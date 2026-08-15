package com.intoyoutharchive.into_youth_admin

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.intoyoutharchive/system_settings",
        ).setMethodCallHandler { call, result ->
            if (call.method != "openAppPermissionSettings") {
                result.notImplemented()
                return@setMethodCallHandler
            }

            try {
                startActivity(
                    Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:$packageName"),
                    ),
                )
                result.success(null)
            } catch (error: Exception) {
                result.error("settings_unavailable", error.message, null)
            }
        }
    }
}
