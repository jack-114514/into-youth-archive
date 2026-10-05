import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/features/settings/image_crop.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Future<ui.Image> crop(bool circle, {int width = 120, int height = 60}) async {
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawRect(
      ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
      ui.Paint()..color = const ui.Color(0xffff0000),
    );
    final picture = recorder.endRecording();
    final image = await picture.toImage(width, height);
    final source = await image.toByteData(format: ui.ImageByteFormat.png);
    final bytes = await cropImageCopy(source!.buffer.asUint8List(), {
      'left': 0,
      'top': 0,
      'width': 100,
      'height': 100,
    }, circle: circle);
    final codec = await ui.instantiateImageCodec(bytes);
    final output = (await codec.getNextFrame()).image;
    codec.dispose();
    image.dispose();
    picture.dispose();
    return output;
  }

  test('rectangular uploaded copy preserves image proportions', () async {
    final image = await crop(false);
    expect([image.width, image.height], [120, 60]);
    image.dispose();
  });
  test('round avatar uses square crop with transparent corners', () async {
    final image = await crop(true);
    expect([image.width, image.height], [60, 60]);
    final bytes = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!
        .buffer
        .asUint8List();
    expect(bytes[3], 0);
    expect(bytes[(30 * 60 + 30) * 4 + 3], 255);
    image.dispose();
  });
  test('large portrait scales both dimensions without stretching', () async {
    final image = await crop(false, width: 1500, height: 3000);
    expect([image.width, image.height], [1024, 2048]);
    image.dispose();
  });
}
