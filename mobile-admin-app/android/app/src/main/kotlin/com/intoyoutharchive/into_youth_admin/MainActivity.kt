package com.intoyoutharchive.into_youth_admin

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
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
                "installedApkPath" -> result.success(applicationInfo.sourceDir)
                "verifyApkForUpdate" -> verifyApkForUpdate(call.arguments, result)
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

    @Suppress("DEPRECATION")
    private fun verifyApkForUpdate(arguments: Any?, result: MethodChannel.Result) {
        try {
            val values = arguments as? Map<*, *> ?: error("Missing arguments")
            val apkPath = values["apkPath"] as? String ?: error("Missing apkPath")
            val expectedVersionCode = (values["versionCode"] as? Number)?.toLong()
                ?: error("Missing versionCode")
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageManager.GET_SIGNING_CERTIFICATES
            } else {
                PackageManager.GET_SIGNATURES
            }
            val archive = packageManager.getPackageArchiveInfo(apkPath, flags)
                ?: error("APK package information is unavailable")
            val installed = packageManager.getPackageInfo(packageName, flags)
            val archiveVersion = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                archive.longVersionCode
            } else {
                archive.versionCode.toLong()
            }
            val valid = archive.packageName == packageName &&
                archiveVersion == expectedVersionCode &&
                signingFingerprints(archive) == signingFingerprints(installed)
            result.success(valid)
        } catch (error: Exception) {
            result.error("apk_verification_failed", error.message, null)
        }
    }

    @Suppress("DEPRECATION")
    private fun signingFingerprints(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners ?: emptyArray()
        } else {
            info.signatures ?: emptyArray()
        }
        return signatures.map { signature ->
            java.security.MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
                .joinToString("") { byte ->
                    (byte.toInt() and 0xff).toString(16).padStart(2, '0')
                }
        }.toSet()
    }
}
