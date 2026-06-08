import 'dart:math' as math;

import 'package:flutter/material.dart';

Color _navIconColor(BuildContext context, Color? override) {
  return override ??
      IconTheme.of(context).color ??
      Theme.of(context).colorScheme.onSurface;
}

/// Portrait / profile — head + shoulders; no Material Icons font.
class MoremiProfileNavIcon extends StatelessWidget {
  const MoremiProfileNavIcon({super.key, required this.selected, this.color});

  final bool selected;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = _navIconColor(context, color);
    return CustomPaint(
      size: const Size(26, 26),
      painter: _ProfileBustPainter(
        color: c,
        strokeWidth: selected ? 2.1 : 1.75,
      ),
    );
  }
}

class _ProfileBustPainter extends CustomPainter {
  _ProfileBustPainter({required this.color, required this.strokeWidth});

  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    final cx = size.width * 0.5;
    final headR = size.width * 0.22;
    final headCy = size.height * 0.34;
    canvas.drawCircle(Offset(cx, headCy), headR, p);
    final path = Path()
      ..moveTo(size.width * 0.15, size.height * 0.92)
      ..quadraticBezierTo(cx, size.height * 0.58, size.width * 0.85, size.height * 0.92);
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant _ProfileBustPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
}

/// Three small figures (groups); no Material Icons font.
class MoremiGroupsNavIcon extends StatelessWidget {
  const MoremiGroupsNavIcon({super.key, required this.selected, this.color});

  final bool selected;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = _navIconColor(context, color);
    return CustomPaint(
      size: const Size(30, 26),
      painter: _ThreePeoplePainter(
        color: c,
        strokeWidth: selected ? 2.05 : 1.7,
      ),
    );
  }
}

class _ThreePeoplePainter extends CustomPainter {
  _ThreePeoplePainter({required this.color, required this.strokeWidth});

  final Color color;
  final double strokeWidth;

  void _person(Canvas canvas, double cx, double bw, Size size, Paint p) {
    final headR = size.height * 0.16;
    final headCy = size.height * 0.28;
    canvas.drawCircle(Offset(cx, headCy), headR, p);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, size.height * 0.72),
          width: bw,
          height: size.height * 0.38,
        ),
        Radius.circular(bw * 0.35),
      ),
      p,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    final w = size.width;
    _person(canvas, w * 0.2, w * 0.18, size, p);
    _person(canvas, w * 0.5, w * 0.2, size, p);
    _person(canvas, w * 0.8, w * 0.18, size, p);
  }

  @override
  bool shouldRepaint(covariant _ThreePeoplePainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
}

/// Outlined gear (Material / Google “settings” style): alternating tooth polygon + centre hole.
class MoremiCogNavIcon extends StatelessWidget {
  const MoremiCogNavIcon({super.key, required this.color, this.size = 22});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.square(size),
      painter: _CogPainter(color: color, strokeWidth: (size * 0.085).clamp(1.25, 2.1)),
    );
  }
}

class _CogPainter extends CustomPainter {
  _CogPainter({required this.color, required this.strokeWidth});

  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;

    final cx = size.width / 2;
    final cy = size.height / 2;
    const teeth = 8;
    final rOuter = size.shortestSide * 0.39;
    final rInner = size.shortestSide * 0.245;

    final path = Path();
    for (var i = 0; i < teeth * 2; i++) {
      final ang = (i * math.pi / teeth) - math.pi / 2;
      final r = i.isEven ? rOuter : rInner;
      final x = cx + r * math.cos(ang);
      final y = cy + r * math.sin(ang);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();
    canvas.drawPath(path, p);
    canvas.drawCircle(Offset(cx, cy), size.shortestSide * 0.155, p);
  }

  @override
  bool shouldRepaint(covariant _CogPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
}
