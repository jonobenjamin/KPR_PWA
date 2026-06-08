import 'dart:math';

/// Shannon–Wiener index H = -Σ p_i ln(p_i), with p_i = proportion of individuals in species i.
double shannonWiener(Map<String, int> speciesCounts) {
  if (speciesCounts.isEmpty) return 0;
  final total = speciesCounts.values.fold<int>(0, (a, b) => a + b);
  if (total <= 0) return 0;
  double h = 0;
  for (final c in speciesCounts.values) {
    if (c <= 0) continue;
    final p = c / total;
    h -= p * log(p);
  }
  return h;
}
