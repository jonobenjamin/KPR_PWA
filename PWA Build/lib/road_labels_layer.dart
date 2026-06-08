import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// A segment of road with a name and coordinates for label rendering.
class RoadSegment {
  final String name;
  final List<LatLng> points;

  const RoadSegment({required this.name, required this.points});
}

/// Layer that draws road names along their paths (TextPath-style).
/// Only visible at zoom >= 14, matching the web map behavior.
class RoadLabelsLayer extends StatelessWidget {
  final List<RoadSegment> segments;
  final double minZoomForLabels;

  const RoadLabelsLayer({
    super.key,
    required this.segments,
    this.minZoomForLabels = 14.0,
  });

  @override
  Widget build(BuildContext context) {
    final camera = MapCamera.maybeOf(context);
    if (camera == null || camera.zoom < minZoomForLabels) {
      return const SizedBox.shrink();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        return CustomPaint(
          size: Size(constraints.maxWidth, constraints.maxHeight),
          painter: _RoadLabelsPainter(
            camera: camera,
            segments: segments,
          ),
        );
      },
    );
  }
}

class _RoadLabelsPainter extends CustomPainter {
  final MapCamera camera;
  final List<RoadSegment> segments;

  _RoadLabelsPainter({
    required this.camera,
    required this.segments,
  });

  @override
  void paint(Canvas canvas, Size size) {
    for (final segment in segments) {
      if (segment.points.length < 2) continue;

      final offsets = <Offset>[];
      for (final pt in segment.points) {
        final offset = camera.getOffsetFromOrigin(pt);
        offsets.add(offset);
      }

      _drawTextAlongPath(canvas, '  ${segment.name}  ', offsets);
    }
  }

  void _drawTextAlongPath(Canvas canvas, String text, List<Offset> path) {
    if (path.isEmpty || path.length < 2) return;

    final textStyle = TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.bold,
      color: Colors.black,
      fontFamily: 'Arial',
    );

    final strokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..color = Colors.white.withValues(alpha: 0.9);

    final strokeStyle = TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.bold,
      foreground: strokePaint,
      fontFamily: 'Arial',
    );

    final textPainter = TextPainter(
      text: TextSpan(text: text, style: textStyle),
      textDirection: TextDirection.ltr,
    )..layout();

    final distances = _computePathDistances(path);
    final totalLength = distances.isEmpty ? 0.0 : distances.last;
    if (totalLength <= 0) return;

    const letterSpacing = 2.5;
    final charWidth = textPainter.width / text.length;
    final charSpacing = charWidth + letterSpacing;
    final halfCharWidth = charWidth / 2;

    for (var i = 0; i < text.length; i++) {
      final char = text[i];
      final charOffset = (i + 0.5) * charSpacing;
      if (charOffset >= totalLength) break;

      final posAndAngle = _positionAndAngleAlongPath(
        path,
        distances,
        charOffset,
      );
      if (posAndAngle == null) continue;

      final position = posAndAngle.$1;
      final angleRad = posAndAngle.$2;

      canvas.save();
      canvas.translate(position.dx, position.dy);
      canvas.rotate(angleRad);

      final charSpan = TextSpan(text: char, style: textStyle);
      final charStrokeSpan = TextSpan(text: char, style: strokeStyle);

      final cp = TextPainter(
        text: charSpan,
        textDirection: TextDirection.ltr,
      )..layout();

      final csp = TextPainter(
        text: charStrokeSpan,
        textDirection: TextDirection.ltr,
      )..layout();

      final x = -halfCharWidth;
      final y = -cp.height / 2;

      // Stroke first (white outline), then fill (black text)
      csp.paint(canvas, Offset(x, y));
      cp.paint(canvas, Offset(x, y));
      canvas.restore();
    }
  }

  List<double> _computePathDistances(List<Offset> path) {
    final distances = <double>[0.0];
    for (var i = 1; i < path.length; i++) {
      final d = (path[i] - path[i - 1]).distance;
      distances.add(distances.last + d);
    }
    return distances;
  }

  (Offset, double)? _positionAndAngleAlongPath(
    List<Offset> path,
    List<double> distances,
    double targetDist,
  ) {
    for (var i = 0; i < distances.length - 1; i++) {
      if (targetDist >= distances[i] && targetDist <= distances[i + 1]) {
        final d0 = distances[i];
        final d1 = distances[i + 1];
        final segLen = d1 - d0;
        if (segLen <= 0) continue;
        final t = (targetDist - d0) / segLen;
        final p0 = path[i];
        final p1 = path[i + 1];
        final position = Offset.lerp(p0, p1, t)!;
        final dx = p1.dx - p0.dx;
        final dy = p1.dy - p0.dy;
        final angle = math.atan2(dy, dx);
        return (position, angle);
      }
    }
    return null;
  }

  @override
  bool shouldRepaint(covariant _RoadLabelsPainter oldDelegate) {
    return oldDelegate.camera != camera || oldDelegate.segments != segments;
  }
}
