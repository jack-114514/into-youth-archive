import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

class DeltaPatchException implements Exception {
  const DeltaPatchException(this.message);

  final String message;

  @override
  String toString() => message;
}

class DeltaPatch {
  const DeltaPatch._();

  static final _magic = ascii.encode('IYDPATCH');
  static const _formatVersion = 1;
  static const _maxOperations = 200000;
  static const _copyBufferSize = 64 * 1024;

  static Future<void> apply({
    required File oldApk,
    required File patch,
    required File outputApk,
    void Function(int completed, int total)? onProgress,
  }) async {
    final patchReader = await patch.open();
    final oldReader = await oldApk.open();
    IOSink? output;
    try {
      final magic = await _readExact(patchReader, _magic.length);
      if (!_equalBytes(magic, _magic)) {
        throw const DeltaPatchException('差分包格式无效');
      }
      final version = (await _readExact(patchReader, 1)).first;
      if (version != _formatVersion) {
        throw const DeltaPatchException('差分包版本不受支持');
      }

      final oldSize = await _readUint64(patchReader);
      final newSize = await _readUint64(patchReader);
      final expectedOldHash = _hex(await _readExact(patchReader, 32));
      final expectedNewHash = _hex(await _readExact(patchReader, 32));
      final operationCount = await _readUint32(patchReader);
      if (operationCount <= 0 || operationCount > _maxOperations) {
        throw const DeltaPatchException('差分包操作数量异常');
      }
      if (await oldApk.length() != oldSize) {
        throw const DeltaPatchException('本机旧版 APK 大小不匹配');
      }
      if (await fileSha256(oldApk) != expectedOldHash) {
        throw const DeltaPatchException('本机旧版 APK 校验失败');
      }

      if (await outputApk.exists()) await outputApk.delete();
      output = outputApk.openWrite();
      var written = 0;
      for (var index = 0; index < operationCount; index += 1) {
        final type = (await _readExact(patchReader, 1)).first;
        if (type == 0) {
          final offset = await _readUint64(patchReader);
          final length = await _readUint32(patchReader);
          if (offset < 0 || length <= 0 || offset + length > oldSize) {
            throw const DeltaPatchException('差分包复制范围无效');
          }
          await oldReader.setPosition(offset);
          var remaining = length;
          while (remaining > 0) {
            final part = await oldReader.read(
              remaining > _copyBufferSize ? _copyBufferSize : remaining,
            );
            if (part.isEmpty) {
              throw const DeltaPatchException('读取旧版 APK 失败');
            }
            output.add(part);
            remaining -= part.length;
            written += part.length;
            onProgress?.call(written, newSize);
          }
        } else if (type == 1) {
          final compressedLength = await _readUint32(patchReader);
          final rawLength = await _readUint32(patchReader);
          if (compressedLength <= 0 || rawLength <= 0) {
            throw const DeltaPatchException('差分包数据长度无效');
          }
          final compressed = await _readExact(patchReader, compressedLength);
          final raw = zlib.decode(compressed);
          if (raw.length != rawLength) {
            throw const DeltaPatchException('差分包数据解压失败');
          }
          output.add(raw);
          written += raw.length;
          onProgress?.call(written, newSize);
        } else {
          throw const DeltaPatchException('差分包包含未知操作');
        }
        if (written > newSize) {
          throw const DeltaPatchException('差分包输出大小异常');
        }
      }
      await output.flush();
      await output.close();
      output = null;
      if (written != newSize || await outputApk.length() != newSize) {
        throw const DeltaPatchException('重建 APK 大小不匹配');
      }
      if (await fileSha256(outputApk) != expectedNewHash) {
        throw const DeltaPatchException('重建 APK SHA-256 校验失败');
      }
    } catch (_) {
      if (output != null) {
        await output.close();
      }
      if (await outputApk.exists()) await outputApk.delete();
      rethrow;
    } finally {
      await patchReader.close();
      await oldReader.close();
    }
  }

  static Future<String> fileSha256(File file) async {
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString().toLowerCase();
  }

  static Future<Uint8List> _readExact(
    RandomAccessFile reader,
    int length,
  ) async {
    final result = Uint8List(length);
    var offset = 0;
    while (offset < length) {
      final part = await reader.read(length - offset);
      if (part.isEmpty) {
        throw const DeltaPatchException('差分包提前结束');
      }
      result.setRange(offset, offset + part.length, part);
      offset += part.length;
    }
    return result;
  }

  static Future<int> _readUint32(RandomAccessFile reader) async =>
      ByteData.sublistView(await _readExact(reader, 4)).getUint32(0);

  static Future<int> _readUint64(RandomAccessFile reader) async =>
      ByteData.sublistView(await _readExact(reader, 8)).getUint64(0);

  static bool _equalBytes(List<int> left, List<int> right) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index += 1) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }

  static String _hex(List<int> bytes) =>
      bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();
}
