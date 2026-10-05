package com.intoyoutharchive.into_youth_admin

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.app.Activity
import java.io.File
import java.util.UUID

class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "memory_archive/files").setMethodCallHandler { call, result ->
            if (call.method != "pickMp3") { result.notImplemented(); return@setMethodCallHandler }
            if (pending != null) { result.error("busy", "文件选择器正在使用", null); return@setMethodCallHandler }
            pending = result
            try {
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "audio/mpeg"
                }, 7104)
            } catch (e: Exception) { pending = null; result.error("picker", "无法打开文件选择器", null) }
        }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 7104) return
        val result = pending ?: return
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) { result.success(null); return }
        val target = File(cacheDir, "audio-${UUID.randomUUID()}.mp3")
        Thread {
            try {
                contentResolver.openInputStream(uri).use { input ->
                    requireNotNull(input)
                    target.outputStream().use { output ->
                        val buffer = ByteArray(65536)
                        var total = 0L
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            total += count
                            require(total <= 12 * 1024 * 1024) { "MP3 不能超过 12 MiB" }
                            output.write(buffer, 0, count)
                        }
                    }
                }
                runOnUiThread { result.success(target.absolutePath) }
            } catch (e: Exception) {
                target.delete()
                runOnUiThread { result.error("file", "无法读取 MP3，或文件超过 12 MiB", null) }
            }
        }.start()
    }
}
