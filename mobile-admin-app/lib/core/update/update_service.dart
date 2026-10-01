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
}

class UpdateCheckResult {
  const UpdateCheckResult({
    required this.currentVersion,
    required this.currentBuild,
    required this.hasUpdate,
    this.manifest,
  });

  final String currentVersion;
  final int currentBuild;
  final bool hasUpdate;
  final UpdateManifest? manifest;
}

class UpdateService {
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 45),
    ),
  );

  Future<UpdateCheckResult> check() async {
    final package = await PackageInfo.fromPlatform();
    final currentBuild = int.tryParse(package.buildNumber) ?? 0;
    final manifestUri = Uri.tryParse(AppConfig.updateManifestUrl);
    if (manifestUri == null || manifestUri.scheme != 'https') {
      return UpdateCheckResult(
        currentVersion: package.version,
        currentBuild: currentBuild,
        hasUpdate: false,
      );
    }
    final response = await _dio.get<Map<String, dynamic>>(
      manifestUri.toString(),
    );
    final manifest = UpdateManifest.fromJson(response.data ?? const {});
    return UpdateCheckResult(
      currentVersion: package.version,
      currentBuild: currentBuild,
      hasUpdate: manifest.versionCode > currentBuild,
      manifest: manifest,
    );
  }

  Future<File> downloadAndVerify(
    UpdateManifest manifest, {
    void Function(int received, int total)? onProgress,
  }) async {
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
      });
}
