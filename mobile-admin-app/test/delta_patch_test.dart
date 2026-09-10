import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/update/delta_patch.dart';

void _writeUint32(BytesBuilder output, int value) {
  final data = ByteData(4)..setUint32(0, value);
  output.add(data.buffer.asUint8List());
}

void _writeUint64(BytesBuilder output, int value) {
  final data = ByteData(8)..setUint64(0, value);
  output.add(data.buffer.asUint8List());
}

List<int> _fixturePatch(List<int> oldBytes, List<int> newBytes) {
  final output = BytesBuilder();
  output.add(ascii.encode('IYDPATCH'));
  output.addByte(1);
  _writeUint64(output, oldBytes.length);
  _writeUint64(output, newBytes.length);
  output.add(sha256.convert(oldBytes).bytes);
  output.add(sha256.convert(newBytes).bytes);
  _writeUint32(output, 3);

  output.addByte(0);
  _writeUint64(output, 0);
  _writeUint32(output, 6);

  final inserted = utf8.encode('brave ');
  final compressed = zlib.encode(inserted);
  output.addByte(1);
  _writeUint32(output, compressed.length);
  _writeUint32(output, inserted.length);
  output.add(compressed);

  output.addByte(0);
  _writeUint64(output, 6);
  _writeUint32(output, 5);
  return output.takeBytes();
}

void main() {
  test('reconstructs the exact target bytes', () async {
    final directory = await Directory.systemTemp.createTemp('iydpatch-test-');
    addTearDown(() => directory.delete(recursive: true));
    final oldBytes = utf8.encode('hello world');
    final newBytes = utf8.encode('hello brave world');
    final oldApk = File('${directory.path}/old.apk')
      ..writeAsBytesSync(oldBytes);
    final patch = File('${directory.path}/update.iydpatch')
      ..writeAsBytesSync(_fixturePatch(oldBytes, newBytes));
    final output = File('${directory.path}/new.apk');

    await DeltaPatch.apply(oldApk: oldApk, patch: patch, outputApk: output);

    expect(await output.readAsBytes(), newBytes);
  });

  test('rejects a patch when the installed base differs', () async {
    final directory = await Directory.systemTemp.createTemp('iydpatch-test-');
    addTearDown(() => directory.delete(recursive: true));
    final original = utf8.encode('hello world');
    final target = utf8.encode('hello brave world');
    final oldApk = File('${directory.path}/old.apk')
      ..writeAsStringSync('tampered');
    final patch = File('${directory.path}/update.iydpatch')
      ..writeAsBytesSync(_fixturePatch(original, target));
    final output = File('${directory.path}/new.apk');

    await expectLater(
      DeltaPatch.apply(oldApk: oldApk, patch: patch, outputApk: output),
      throwsA(isA<DeltaPatchException>()),
    );
    expect(await output.exists(), isFalse);
  });
}
