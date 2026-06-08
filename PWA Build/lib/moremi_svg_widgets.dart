import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Binoculars asset for the Sightings tab (NavigationBar picks up [IconTheme] color).
class MoremiNavBinocularsSvg extends StatelessWidget {
  const MoremiNavBinocularsSvg({super.key, this.size = 26});

  final double size;

  @override
  Widget build(BuildContext context) {
    final c = IconTheme.of(context).color ??
        Theme.of(context).colorScheme.onSurface;
    return SvgPicture.asset(
      'assets/binoculars.svg',
      width: size,
      height: size,
      fit: BoxFit.contain,
      colorFilter: ColorFilter.mode(c, BlendMode.srcIn),
    );
  }
}

/// Magnifying glass for “zoom to my location” and similar controls.
class MoremiMagnifierSvgIcon extends StatelessWidget {
  const MoremiMagnifierSvgIcon({super.key, this.size = 24, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ??
        IconTheme.of(context).color ??
        Theme.of(context).colorScheme.onSurface;
    return SvgPicture.asset(
      'assets/magnifying.svg',
      width: size,
      height: size,
      fit: BoxFit.contain,
      colorFilter: ColorFilter.mode(c, BlendMode.srcIn),
    );
  }
}

/// Full-rotation loading indicator using the pangolin artwork (keeps SVG colors).
class MoremiPangolinLoadingIndicator extends StatefulWidget {
  const MoremiPangolinLoadingIndicator({
    super.key,
    this.size = 28,
    this.period = const Duration(milliseconds: 1400),
  });

  final double size;
  final Duration period;

  @override
  State<MoremiPangolinLoadingIndicator> createState() =>
      _MoremiPangolinLoadingIndicatorState();
}

class _MoremiPangolinLoadingIndicatorState
    extends State<MoremiPangolinLoadingIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.period)
      ..repeat();
  }

  @override
  void didUpdateWidget(MoremiPangolinLoadingIndicator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.period != widget.period) {
      _controller.duration = widget.period;
      _controller
        ..reset()
        ..repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RotationTransition(
      turns: _controller,
      child: SvgPicture.asset(
        'assets/pangolin_loading.svg',
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        alignment: Alignment.center,
      ),
    );
  }
}
