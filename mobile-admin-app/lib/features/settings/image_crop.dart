import 'dart:typed_data';
import 'dart:ui' as ui;

/// Crop a separate uploaded copy; never overwrite the selected gallery file.
Future<Uint8List> cropImageCopy(
  Uint8List source,
  Map<String, dynamic> crop, {
  bool circle = false,
}) async {
  final codec = await ui.instantiateImageCodec(
    source,
    targetWidth: 2048,
    allowUpscaling: false,
  );
  final frame = await codec.getNextFrame();
  final image = frame.image;
  try {
    var rect = ui.Rect.fromLTWH(
      image.width * (crop['left'] as num) / 100,
      image.height * (crop['top'] as num) / 100,
      image.width * (crop['width'] as num) / 100,
      image.height * (crop['height'] as num) / 100,
    );
    if (circle) {
      final side = rect.width < rect.height ? rect.width : rect.height;
      rect = ui.Rect.fromCenter(center: rect.center, width: side, height: side);
    }
    final longest = rect.width > rect.height ? rect.width : rect.height;
    final scale = longest > 2048 ? 2048 / longest : 1.0;
    final outputWidth = (rect.width * scale).clamp(1, 2048).round();
    final outputHeight = (rect.height * scale).clamp(1, 2048).round();
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    final output = ui.Rect.fromLTWH(
      0,
      0,
      outputWidth.toDouble(),
      outputHeight.toDouble(),
    );
    if (circle) canvas.clipPath(ui.Path()..addOval(output));
    canvas.drawImageRect(
      image,
      rect,
      output,
      ui.Paint()..filterQuality = ui.FilterQuality.high,
    );
    final picture = recorder.endRecording();
    final result = await picture.toImage(outputWidth, outputHeight);
    try {
      final bytes = await result.toByteData(format: ui.ImageByteFormat.png);
      return bytes!.buffer.asUint8List();
    } finally {
      result.dispose();
      picture.dispose();
    }
  } finally {
    image.dispose();
    codec.dispose();
  }
}
