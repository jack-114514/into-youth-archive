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
}
