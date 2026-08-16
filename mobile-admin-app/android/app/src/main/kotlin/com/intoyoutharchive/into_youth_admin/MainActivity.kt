package com.intoyoutharchive.into_youth_admin

import android.content.Intent
import android.net.Uri
import android.os.Build
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
            when (call.method) {
                "openAppPermissionSettings" -> openAppPermissionSettings(result)
                "canRequestPackageInstalls" -> {
                    result.success(
                        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
                            packageManager.canRequestPackageInstalls(),
                    )
                }
                "openInstallPermissionSettings" -> openInstallPermissionSettings(result)
                else -> result.notImplemented()
            }
        }
    }

    private fun openAppPermissionSettings(result: MethodChannel.Result) {
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

    private fun openInstallPermissionSettings(result: MethodChannel.Result) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName"),
                )
            } else {
                Intent(Settings.ACTION_SECURITY_SETTINGS)
            }
            startActivity(intent)
            result.success(null)
        } catch (error: Exception) {
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:$packageName"),
                    ),
                )
                result.success(null)
            } catch (fallbackError: Exception) {
                result.error("settings_unavailable", fallbackError.message ?: error.message, null)
            }
        }
    }
}
