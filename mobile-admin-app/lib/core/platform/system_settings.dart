import 'package:flutter/services.dart';

class SystemSettings {
  const SystemSettings._();

  static const _channel = MethodChannel('com.intoyoutharchive/system_settings');

  static Future<void> openAppPermissionSettings() async {
    await _channel.invokeMethod<void>('openAppPermissionSettings');
  }

  static Future<bool> canRequestPackageInstalls() async {
    return await _channel.invokeMethod<bool>('canRequestPackageInstalls') ??
        false;
  }

  static Future<void> openInstallPermissionSettings() async {
    await _channel.invokeMethod<void>('openInstallPermissionSettings');
  }

  static Future<String?> installedApkPath() async {
    final path = await _channel.invokeMethod<String>('installedApkPath');
    return path == null || path.isEmpty ? null : path;
  }

  static Future<bool> verifyApkForUpdate(
    String apkPath,
    int expectedVersionCode,
  ) async {
    return await _channel.invokeMethod<bool>('verifyApkForUpdate', {
          'apkPath': apkPath,
          'versionCode': expectedVersionCode,
        }) ??
        false;
  }
}
