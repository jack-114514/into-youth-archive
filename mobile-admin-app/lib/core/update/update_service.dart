import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../platform/system_settings.dart';
import 'delta_patch.dart';

String _stringValue(Map<String, dynamic> json, String modern, String legacy) =>
    json[modern]?.toString() ?? json[legacy]?.toString() ?? '';

int _intValue(Map<String, dynamic> json, String modern, String legacy) =>
    int.tryParse((json[modern] ?? json[legacy])?.toString() ?? '') ?? 0;

class DeltaPatchManifest {
  const DeltaPatchManifest({
    required this.fromVersionCode,
    required this.fromSha256,
    required this.url,
    required this.sha256,
    required this.size,
  });

  factory DeltaPatchManifest.fromJson(Map<String, dynamic> json) {
    return DeltaPatchManifest(
      fromVersionCode: _intValue(json, 'fromVersionCode', 'from_version_code'),
      fromSha256: _stringValue(json, 'fromSha256', 'from_sha256').toLowerCase(),
      url: json['url']?.toString() ?? '',
      sha256: json['sha256']?.toString().toLowerCase() ?? '',
      size: int.tryParse(json['size']?.toString() ?? '') ?? 0,
    );
  }

  final int fromVersionCode;
  final String fromSha256;
  final String url;
  final String sha256;
  final int size;

  bool get isValid =>
      fromVersionCode > 0 &&
      RegExp(r'^[a-f0-9]{64}$').hasMatch(fromSha256) &&
      RegExp(r'^[a-f0-9]{64}$').hasMatch(sha256) &&
      size > 0 &&
      Uri.tryParse(url)?.scheme == 'https';
}

class UpdateManifest {
  const UpdateManifest({
    required this.versionName,
    required this.versionCode,
    required this.gitCommit,
    required this.apkUrl,
    required this.githubReleaseUrl,
    required this.sha256,
    required this.apkSize,
    required this.mandatory,
    required this.notes,
    required this.patches,
  });

  factory UpdateManifest.fromJson(Map<String, dynamic> json) {
    final patches = <DeltaPatchManifest>[];
    final rawPatches = json['patches'];
    if (rawPatches is List) {
      for (final value in rawPatches) {
        if (value is Map) {
          final patch = DeltaPatchManifest.fromJson(
            value.map((key, value) => MapEntry(key.toString(), value)),
          );
          if (patch.isValid) patches.add(patch);
        }
      }
    }
    return UpdateManifest(
      versionName: _stringValue(json, 'version', 'version_name'),
      versionCode: _intValue(json, 'versionCode', 'version_code'),
      gitCommit: _stringValue(json, 'gitCommit', 'git_commit'),
      apkUrl: _stringValue(json, 'apkUrl', 'apk_url'),
      githubReleaseUrl: _stringValue(json, 'githubUrl', 'github_release_url'),
      sha256: json['sha256']?.toString().toLowerCase() ?? '',
      apkSize: int.tryParse(json['apkSize']?.toString() ?? '') ?? 0,
      mandatory: json['forceUpdate'] == true || json['mandatory'] == true,
      notes: json['notes']?.toString() ?? '',
      patches: patches,
    );
  }

  final String versionName;
  final int versionCode;
  final String gitCommit;
  final String apkUrl;
  final String githubReleaseUrl;
  final String sha256;
  final int apkSize;
  final bool mandatory;
  final String notes;
  final List<DeltaPatchManifest> patches;

  DeltaPatchManifest? patchFor(int currentVersionCode) {
    for (final patch in patches) {
      if (patch.fromVersionCode == currentVersionCode) return patch;
    }
    return null;
  }
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

class PreparedUpdate {
  const PreparedUpdate({required this.apk, required this.usedDelta});

  final File apk;
  final bool usedDelta;
}

class UpdateService {
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(minutes: 5),
      headers: const {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'},
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
    final cacheBusted = manifestUri.replace(
      queryParameters: {
        ...manifestUri.queryParameters,
        't': DateTime.now().millisecondsSinceEpoch.toString(),
      },
    );
    final response = await _dio.get<Map<String, dynamic>>(
      cacheBusted.toString(),
    );
    final manifest = UpdateManifest.fromJson(response.data ?? const {});
    return UpdateCheckResult(
      currentVersion: package.version,
      currentBuild: currentBuild,
      hasUpdate: manifest.versionCode > currentBuild,
      manifest: manifest,
    );
  }

  Future<PreparedUpdate> downloadAndVerify(
    UpdateManifest manifest, {
    required int currentVersionCode,
    void Function(int received, int total)? onProgress,
    void Function(String message)? onMessage,
  }) async {
    final patch = manifest.patchFor(currentVersionCode);
    if (patch != null) {
      try {
        onMessage?.call('正在校验本机版本，准备差分更新…');
        final apk = await _downloadDelta(
          manifest,
          patch,
          onProgress: onProgress,
        );
        return PreparedUpdate(apk: apk, usedDelta: true);
      } catch (_) {
        onMessage?.call('差分更新不可用，已自动切换完整安装包…');
        onProgress?.call(0, 0);
      }
    } else {
      onMessage?.call('此版本需要下载一次完整安装包…');
    }
    final apk = await _downloadFull(manifest, onProgress: onProgress);
    return PreparedUpdate(apk: apk, usedDelta: false);
  }

  Future<File> _downloadDelta(
    UpdateManifest manifest,
    DeltaPatchManifest patch, {
    void Function(int received, int total)? onProgress,
  }) async {
    final installedPath = await SystemSettings.installedApkPath();
    if (installedPath == null) throw const FormatException('无法读取本机 APK');
    final oldApk = File(installedPath);
    if (!await oldApk.exists() ||
        await DeltaPatch.fileSha256(oldApk) != patch.fromSha256) {
      throw const FormatException('本机 APK 与差分包基线不匹配');
    }

    final directory = await getTemporaryDirectory();
    final safeVersion = _safeVersion(manifest.versionName);
    final patchFile = File(
      '${directory.path}${Platform.pathSeparator}into-youth-admin-$safeVersion.iydpatch',
    );
    final outputApk = File(
      '${directory.path}${Platform.pathSeparator}into-youth-admin-$safeVersion.apk',
    );
    await _downloadHttps(patch.url, patchFile, onProgress: onProgress);
    if (await DeltaPatch.fileSha256(patchFile) != patch.sha256) {
      await patchFile.delete();
      throw const FormatException('差分包 SHA-256 校验失败');
    }
    try {
      await DeltaPatch.apply(
        oldApk: oldApk,
        patch: patchFile,
        outputApk: outputApk,
      );
    } finally {
      if (await patchFile.exists()) await patchFile.delete();
    }
    await _verifyPreparedApk(outputApk, manifest);
    return outputApk;
  }

  Future<File> _downloadFull(
    UpdateManifest manifest, {
    void Function(int received, int total)? onProgress,
  }) async {
    if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(manifest.sha256)) {
      throw const FormatException('更新清单缺少有效的 APK SHA-256');
    }
    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}${Platform.pathSeparator}into-youth-admin-${_safeVersion(manifest.versionName)}.apk',
    );
    await _downloadHttps(manifest.apkUrl, file, onProgress: onProgress);
    await _verifyPreparedApk(file, manifest);
    return file;
  }

  Future<void> _downloadHttps(
    String value,
    File output, {
    void Function(int received, int total)? onProgress,
  }) async {
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'https') {
      throw const FormatException('更新下载地址无效');
    }
    if (await output.exists()) await output.delete();
    await _dio.download(
      uri.toString(),
      output.path,
      onReceiveProgress: onProgress,
    );
  }

  Future<void> _verifyPreparedApk(File apk, UpdateManifest manifest) async {
    final actual = await DeltaPatch.fileSha256(apk);
    if (actual != manifest.sha256) {
      if (await apk.exists()) await apk.delete();
      throw const FormatException('APK SHA-256 校验失败，已拒绝安装');
    }
    final packageIsValid = await SystemSettings.verifyApkForUpdate(
      apk.path,
      manifest.versionCode,
    );
    if (!packageIsValid) {
      if (await apk.exists()) await apk.delete();
      throw const FormatException('APK 包名、版本或签名校验失败');
    }
  }

  String _safeVersion(String value) =>
      value.replaceAll(RegExp(r'[^0-9A-Za-z._-]'), '_');

  Future<void> openInstaller(File apk) async {
    final result = await OpenFilex.open(
      apk.path,
      type: 'application/vnd.android.package-archive',
    );
    if (result.type != ResultType.done) throw StateError(result.message);
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

  String exportDiagnostic(UpdateCheckResult result) {
    final patch = result.manifest?.patchFor(result.currentBuild);
    return const JsonEncoder.withIndent(' ').convert({
      'current_version': result.currentVersion,
      'current_build': result.currentBuild,
      'git_commit': AppConfig.buildCommit,
      'update_available': result.hasUpdate,
      'remote_version': result.manifest?.versionName,
      'remote_commit': result.manifest?.gitCommit,
      'delta_patch_available': patch != null,
      'delta_patch_size': patch?.size,
      'full_apk_size': result.manifest?.apkSize,
    });
  }
}
