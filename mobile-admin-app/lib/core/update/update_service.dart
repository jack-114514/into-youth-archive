import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';

class UpdateManifest {
  const UpdateManifest({
    required this.versionName,
    required this.versionCode,
    required this.gitCommit,
    required this.apkUrl,
    required this.githubReleaseUrl,
    required this.sha256,
    required this.mandatory,
    required this.notes,
    this.packageName = '',
  });

  factory UpdateManifest.fromJson(Map<String, dynamic> json) {
    return UpdateManifest(
      versionName:
          json['version']?.toString() ?? json['version_name']?.toString() ?? '',
      versionCode:
          int.tryParse(
            (json['versionCode'] ?? json['version_code'])?.toString() ?? '',
          ) ??
          0,
      gitCommit:
          json['gitCommit']?.toString() ?? json['git_commit']?.toString() ?? '',
      apkUrl: json['apkUrl']?.toString() ?? json['apk_url']?.toString() ?? '',
      githubReleaseUrl:
          json['githubUrl']?.toString() ??
          json['github_release_url']?.toString() ??
          '',
      sha256: json['sha256']?.toString().toLowerCase() ?? '',
      mandatory: json['forceUpdate'] == true || json['mandatory'] == true,
      notes: json['notes']?.toString() ?? '',
      packageName: json['packageName']?.toString() ?? '',
    );
  }

  final String versionName;
  final int versionCode;
  final String gitCommit;
  final String apkUrl;
  final String githubReleaseUrl;
  final String sha256;
  final bool mandatory;
  final String notes;
  final String packageName;

  void requirePackage(String currentPackage) {
    if (packageName.isEmpty || packageName != currentPackage) {
      throw const FormatException('更新清单与当前应用不匹配，请使用本应用的更新清单');
    }
  }
}

class UpdateCheckResult {
  const UpdateCheckResult({
    required this.currentVersion,
    required this.currentBuild,
    required this.hasUpdate,
    this.manifest,
    this.sourceName = '',
    this.sourceUrl = '',
  });

  final String currentVersion;
  final int currentBuild;
  final bool hasUpdate;
  final UpdateManifest? manifest;
  final String sourceName;
  final String sourceUrl;
}

enum UpdateSource { server, github }

class UpdateService {
  UpdateService({Dio? dio, String? githubRepository})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 45),
            ),
          ),
      _githubRepository = githubRepository ?? AppConfig.githubUpdateRepository;
  final Dio _dio;
  final String _githubRepository;
  String get sourceRepositoryUrl =>
      RegExp(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$').hasMatch(_githubRepository)
      ? 'https://github.com/$_githubRepository'
      : '';

  Future<Map<String, dynamic>> _readJson(
    Uri uri, {
    String? siteOrigin,
    bool github = false,
    String accept = 'application/json',
  }) async {
    for (var redirects = 0; redirects < 6; redirects++) {
      final host = uri.host;
      if (uri.scheme != 'https' ||
          uri.userInfo.isNotEmpty ||
          (siteOrigin != null && uri.origin != siteOrigin) ||
          (github &&
              host != 'api.github.com' &&
              host != 'github.com' &&
              !host.endsWith('.githubusercontent.com'))) {
        throw const FormatException('更新服务器返回了不安全的地址，已停止检查');
      }
      final response = await _dio.get<dynamic>(
        (redirects == 0
                ? uri.replace(
                    queryParameters: {
                      ...uri.queryParameters,
                      '_updateCheck': DateTime.now().microsecondsSinceEpoch
                          .toString(),
                    },
                  )
                : uri)
            .toString(),
        options: Options(
          followRedirects: false,
          responseType: ResponseType.plain,
          validateStatus: (status) =>
              status != null && status >= 200 && status < 400,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Accept': accept,
            'User-Agent': 'Memory-Archive-Android-Updater',
          },
        ),
      );
      if (response.statusCode! >= 300) {
        final location = response.headers.value('location');
        if (location == null) throw const FormatException('更新服务器未返回有效地址');
        uri = uri.resolve(location);
        continue;
      }
      final data = response.data is String
          ? jsonDecode(response.data as String)
          : response.data;
      if (data is! Map) throw const FormatException('更新服务器没有返回有效版本信息');
      return data.cast<String, dynamic>();
    }
    throw const FormatException('更新服务器跳转过多，请稍后重试');
  }

  UpdateManifest _validate(Map<String, dynamic> data, String package) {
    final manifest = UpdateManifest.fromJson(data);
    manifest.requirePackage(package);
    if (manifest.versionCode < 1 || manifest.versionName.isEmpty) {
      throw const FormatException('更新服务器缺少有效版本信息');
    }
    final apk = Uri.tryParse(manifest.apkUrl);
    if (apk == null ||
        apk.scheme != 'https' ||
        apk.host.isEmpty ||
        apk.userInfo.isNotEmpty ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(manifest.sha256)) {
      throw const FormatException('更新服务器缺少安全的安装包或校验信息');
    }
    return manifest;
  }

  Future<UpdateManifest> _githubManifest(String package) async {
    final repo = _githubRepository;
    if (!RegExp(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$').hasMatch(repo)) {
      throw const FormatException('此安装包未设置 GitHub 更新来源');
    }
    final release = await _readJson(
      Uri.parse('https://api.github.com/repos/$repo/releases/latest'),
      github: true,
    );
    if (release['draft'] != false || release['prerelease'] != false) {
      throw const FormatException('GitHub 尚未提供正式版本');
    }
    final assets = (release['assets'] as List? ?? const []).whereType<Map>();
    final versions = assets
        .where(
          (a) =>
              RegExp(r'^android-version-v[0-9]+\.[0-9]+\.[0-9]+\.json$')
                  .hasMatch(a['name']?.toString() ?? ''),
        )
        .toList();
    if (versions.length != 1) {
      throw const FormatException('GitHub 正式发行缺少唯一的安卓版本信息');
    }
    final assetUrl = Uri.tryParse(
      versions.single['browser_download_url']?.toString() ?? '',
    );
    if (assetUrl == null ||
        assetUrl.scheme != 'https' ||
        assetUrl.host != 'github.com' ||
        !assetUrl.path.startsWith('/$repo/releases/download/')) {
      throw const FormatException('GitHub 返回的安卓版本地址无效');
    }
    Uri assetApi(Map asset) {
      final id = asset['id'];
      if (id is! int || id < 1) {
        throw const FormatException('GitHub 发行附件标识无效');
      }
      return Uri.parse(
        'https://api.github.com/repos/$repo/releases/assets/$id',
      );
    }

    final data = await _readJson(
      assetApi(versions.single),
      github: true,
      accept: 'application/octet-stream',
    );
    final manifest = _validate(data, package);
    final apk = Uri.parse(manifest.apkUrl);
    final matching = assets
        .where((a) => a['browser_download_url'] == manifest.apkUrl)
        .toList();
    if (apk.host != 'github.com' ||
        !apk.path.startsWith('/$repo/releases/download/') ||
        matching.length != 1 ||
        matching.single['digest'] != 'sha256:${manifest.sha256}') {
      throw const FormatException('GitHub 安装包与发行校验信息不一致');
    }
    return UpdateManifest.fromJson({
      ...data,
      'apkUrl': assetApi(matching.single).toString(),
      'githubUrl': '$sourceRepositoryUrl/releases/latest',
    });
  }

  Future<UpdateCheckResult> check({
    UpdateSource source = UpdateSource.server,
  }) async {
    final site = AppConfig.connection;
    if (site == null && source == UpdateSource.server) {
      throw const FormatException('请先连接你的站点，再检查更新');
    }
    final package = await PackageInfo.fromPlatform();
    final currentBuild = int.tryParse(package.buildNumber) ?? 0;
    UpdateCheckResult result(
      UpdateManifest manifest,
      String name,
      String url,
    ) => UpdateCheckResult(
      currentVersion: package.version,
      currentBuild: currentBuild,
      hasUpdate: manifest.versionCode > currentBuild,
      manifest: manifest,
      sourceName: name,
      sourceUrl: url,
    );
    if (source == UpdateSource.github) {
      return result(
        await _githubManifest(package.packageName),
        'GitHub 正式发行',
        'https://github.com/$_githubRepository/releases/latest',
      );
    }
    final data = await _readJson(
      Uri.parse(AppConfig.updateManifestUrl),
      siteOrigin: site!.origin,
    );
    return result(
      _validate(data, package.packageName),
      '本站服务器',
      AppConfig.updateManifestUrl,
    );
  }

  Future<void> openSourceRepository() async {
    if (sourceRepositoryUrl.isEmpty) {
      throw const FormatException('此安装包未设置 GitHub 开源地址');
    }
    if (!await launchUrl(
      Uri.parse(sourceRepositoryUrl),
      mode: LaunchMode.externalApplication,
    )) {
      throw const FormatException('无法打开 GitHub，请检查浏览器设置');
    }
  }

  Future<File> downloadAndVerify(
    UpdateManifest manifest, {
    void Function(int received, int total)? onProgress,
  }) async {
    manifest.requirePackage((await PackageInfo.fromPlatform()).packageName);
    final apkUri = Uri.tryParse(manifest.apkUrl);
    if (apkUri == null || apkUri.scheme != 'https') {
      throw const FormatException('APK 下载地址无效');
    }
    if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(manifest.sha256)) {
      throw const FormatException('更新清单缺少有效的 APK SHA-256');
    }
    final directory = await getTemporaryDirectory();
    final safeVersion = manifest.versionName.replaceAll(
      RegExp(r'[^0-9A-Za-z._-]'),
      '_',
    );
    final file = File(
      '${directory.path}${Platform.pathSeparator}into-youth-admin-$safeVersion.apk',
    );
    await _dio.download(
      apkUri.toString(),
      file.path,
      options: Options(
        headers: {
          'Accept': 'application/octet-stream',
          'Cache-Control': 'no-cache',
        },
      ),
      onReceiveProgress: onProgress,
    );
    final digest = await sha256.bind(file.openRead()).first;
    final actual = digest.toString().toLowerCase();
    if (actual != manifest.sha256) {
      await file.delete();
      throw const FormatException('APK 校验失败，已拒绝安装');
    }
    return file;
  }

  Future<void> openInstaller(File apk) async {
    final result = await OpenFilex.open(
      apk.path,
      type: 'application/vnd.android.package-archive',
    );
    if (result.type != ResultType.done) {
      throw StateError(result.message);
    }
  }

  Future<void> openGithubFallback(UpdateManifest manifest) async {
    final value = manifest.githubReleaseUrl.isNotEmpty
        ? manifest.githubReleaseUrl
        : AppConfig.githubReleasesUrl;
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'https') {
      throw const FormatException('GitHub Release 地址无效');
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String exportDiagnostic(UpdateCheckResult result) =>
      const JsonEncoder.withIndent(' ').convert({
        'current_version': result.currentVersion,
        'current_build': result.currentBuild,
        'git_commit': AppConfig.buildCommit,
        'update_available': result.hasUpdate,
        'remote_version': result.manifest?.versionName,
        'remote_commit': result.manifest?.gitCommit,
        'update_source': result.sourceUrl,
      });
}
