import 'package:flutter/services.dart';

class SystemSettings {
  const SystemSettings._();

  static const _channel = MethodChannel('com.intoyoutharchive/system_settings');

  static Future<void> openAppPermissionSettings() async {
    await _channel.invokeMethod<void>('openAppPermissionSettings');
  }
}
