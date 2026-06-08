import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import 'moremi_map_data.dart';

/// Park / reserve names at higher zoom (centroid labels).
class ParkLabelsLayer extends StatelessWidget {
  const ParkLabelsLayer({
    super.key,
    required this.parks,
    this.minZoom = kNatParkLabelMinZoom,
  });

  final List<NatParkRegion> parks;
  final double minZoom;

  @override
  Widget build(BuildContext context) {
    final camera = MapCamera.maybeOf(context);
    if (camera == null || camera.zoom < minZoom) {
      return const SizedBox.shrink();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        return CustomPaint(
          size: Size(constraints.maxWidth, constraints.maxHeight),
          painter: _ParkLabelsPainter(camera: camera, parks: parks),
        );
      },
    );
  }
}

class _ParkLabelsPainter extends CustomPainter {
  _ParkLabelsPainter({required this.camera, required this.parks});

  final MapCamera camera;
  final List<NatParkRegion> parks;

  @override
  void paint(Canvas canvas, Size size) {
    const fill = Color(0xFF1B5E20);
    final style = TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w700,
      color: fill,
      fontFamily: 'Arial',
    );
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = Colors.white.withValues(alpha: 0.85);

    for (final park in parks) {
      final offset = camera.getOffsetFromOrigin(park.labelPoint);
      if (offset.dx < -80 ||
          offset.dy < -20 ||
          offset.dx > size.width + 80 ||
          offset.dy > size.height + 20) {
        continue;
      }
      final tp = TextPainter(
        text: TextSpan(text: park.name, style: style),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 160);

      final pos = Offset(offset.dx - tp.width / 2, offset.dy - tp.height / 2);
      final strokeTp = TextPainter(
        text: TextSpan(
          text: park.name,
          style: style.copyWith(
            foreground: stroke,
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 160);
      strokeTp.paint(canvas, pos);
      tp.paint(canvas, pos);
    }
  }

  @override
  bool shouldRepaint(covariant _ParkLabelsPainter oldDelegate) =>
      oldDelegate.camera != camera || oldDelegate.parks != parks;
}
