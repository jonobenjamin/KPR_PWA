import 'package:flutter/material.dart';

import 'moremi_map_data.dart';

/// Collapsible map layer legend for the sightings (home) page.
class MoremiMapLegendPanel extends StatelessWidget {
  const MoremiMapLegendPanel({
    super.key,
    required this.visibility,
    required this.accommodationTypes,
    required this.onChanged,
  });

  final MoremiMapLayerVisibility visibility;
  final List<String> accommodationTypes;
  final ValueChanged<MoremiMapLayerVisibility> onChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 3,
      borderRadius: BorderRadius.circular(12),
      color: Colors.white.withValues(alpha: 0.94),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 220),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Map layers',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 6),
              _RoadsSection(visibility: visibility, onChanged: onChanged),
              const Divider(height: 16),
              _NatParksRow(visibility: visibility, onChanged: onChanged),
              const Divider(height: 16),
              _AccommodationSection(
                visibility: visibility,
                types: accommodationTypes,
                onChanged: onChanged,
              ),
              const SizedBox(height: 4),
              _RestaurantsRow(visibility: visibility, onChanged: onChanged),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoadsSection extends StatefulWidget {
  const _RoadsSection({required this.visibility, required this.onChanged});

  final MoremiMapLayerVisibility visibility;
  final ValueChanged<MoremiMapLayerVisibility> onChanged;

  @override
  State<_RoadsSection> createState() => _RoadsSectionState();
}

class _RoadsSectionState extends State<_RoadsSection> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final v = widget.visibility;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(
                  child: _LegendSwitchRow(
                    label: 'Roads',
                    value: v.roadsEnabled,
                    onChanged: (on) => widget.onChanged(v.copyWith(roadsEnabled: on)),
                    leading: _RoadSample(scale: 1, enabled: v.roadsEnabled),
                  ),
                ),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  size: 20,
                  color: Colors.grey.shade700,
                ),
              ],
            ),
          ),
        ),
        if (_expanded && v.roadsEnabled) ...[
          const SizedBox(height: 4),
          _LegendSwitchRow(
            label: 'Main (scale 1)',
            subtitle: 'Always visible',
            value: v.roadScale1,
            onChanged: (on) => widget.onChanged(v.copyWith(roadScale1: on)),
            leading: const _RoadSample(scale: 1),
            dense: true,
          ),
          _LegendSwitchRow(
            label: 'Regional (scale 2)',
            subtitle: 'Zoom in',
            value: v.roadScale2,
            onChanged: (on) => widget.onChanged(v.copyWith(roadScale2: on)),
            leading: const _RoadSample(scale: 2),
            dense: true,
          ),
          _LegendSwitchRow(
            label: 'Local (scale 3)',
            subtitle: 'Zoom in further',
            value: v.roadScale3,
            onChanged: (on) => widget.onChanged(v.copyWith(roadScale3: on)),
            leading: const _RoadSample(scale: 3),
            dense: true,
          ),
        ],
      ],
    );
  }
}

class _NatParksRow extends StatelessWidget {
  const _NatParksRow({required this.visibility, required this.onChanged});

  final MoremiMapLayerVisibility visibility;
  final ValueChanged<MoremiMapLayerVisibility> onChanged;

  @override
  Widget build(BuildContext context) {
    return _LegendSwitchRow(
      label: 'National parks',
      value: visibility.natParksEnabled,
      onChanged: (on) => onChanged(visibility.copyWith(natParksEnabled: on)),
      leading: Container(
        width: 22,
        height: 14,
        decoration: BoxDecoration(
          color: const Color(0x662E7D32),
          border: Border.all(color: const Color(0xFF2E7D32), width: 1.2),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _AccommodationSection extends StatefulWidget {
  const _AccommodationSection({
    required this.visibility,
    required this.types,
    required this.onChanged,
  });

  final MoremiMapLayerVisibility visibility;
  final List<String> types;
  final ValueChanged<MoremiMapLayerVisibility> onChanged;

  @override
  State<_AccommodationSection> createState() => _AccommodationSectionState();
}

class _AccommodationSectionState extends State<_AccommodationSection> {
  bool _expanded = false;

  bool get _anyOn {
    for (final t in widget.types) {
      if (widget.visibility.accommodationTypes[t] == true) return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.types.isEmpty) {
      return Text(
        'Accommodation (no POI data loaded)',
        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Accommodation',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (_anyOn)
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(right: 4),
                    decoration: const BoxDecoration(
                      color: Color(0xFF2E7D32),
                      shape: BoxShape.circle,
                    ),
                  ),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  size: 20,
                  color: Colors.grey.shade700,
                ),
              ],
            ),
          ),
        ),
        if (_expanded)
          for (final t in widget.types)
            _LegendSwitchRow(
              label: t,
              value: widget.visibility.accommodationTypes[t] ?? false,
              onChanged: (on) {
                final next = Map<String, bool>.from(widget.visibility.accommodationTypes);
                next[t] = on;
                widget.onChanged(widget.visibility.copyWith(accommodationTypes: next));
              },
              dense: true,
            ),
      ],
    );
  }
}

class _RestaurantsRow extends StatelessWidget {
  const _RestaurantsRow({required this.visibility, required this.onChanged});

  final MoremiMapLayerVisibility visibility;
  final ValueChanged<MoremiMapLayerVisibility> onChanged;

  @override
  Widget build(BuildContext context) {
    return _LegendSwitchRow(
      label: 'Restaurants',
      value: visibility.restaurantsEnabled,
      onChanged: (on) => onChanged(visibility.copyWith(restaurantsEnabled: on)),
      leading: Icon(Icons.restaurant, size: 18, color: Colors.orange.shade800),
    );
  }
}

class _LegendSwitchRow extends StatelessWidget {
  const _LegendSwitchRow({
    required this.label,
    required this.value,
    required this.onChanged,
    this.leading,
    this.subtitle,
    this.dense = false,
  });

  final String label;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final Widget? leading;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (leading != null) ...[
          leading!,
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: dense ? 12 : 13,
                  fontWeight: dense ? FontWeight.w500 : FontWeight.w600,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                ),
            ],
          ),
        ),
        Transform.scale(
          scale: dense ? 0.82 : 0.9,
          child: Switch(
            value: value,
            onChanged: onChanged,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
      ],
    );
  }
}

class _RoadSample extends StatelessWidget {
  const _RoadSample({required this.scale, this.enabled = true});

  final int scale;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final color = !enabled
        ? Colors.grey.shade400
        : scale == 1
            ? Colors.black
            : scale == 2
                ? Colors.grey.shade700
                : Colors.grey.shade500;
    final width = scale == 1 ? 3.0 : scale == 2 ? 2.0 : 1.2;
    return SizedBox(
      width: 22,
      height: 14,
      child: Center(
        child: Container(
          width: 22,
          height: width,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(width),
          ),
        ),
      ),
    );
  }
}
