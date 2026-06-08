/// Canonical species options for sightings (stored as display name in API).
const List<String> kMoremiSpecies = [
  'Lion',
  'Leopard',
  'Cheetah',
  'Pangolin',
  'Aardvark',
  'Hyena',
  'Brown hyena',
  "Pel's fishing owl",
  'Rhino',
  'Buffalo',
  'Giraffe',
  'Elephant',
  'Wild dog',
  'Zebra',
  'Other',
];

String speciesEmoji(String species) {
  switch (species.trim().toLowerCase()) {
    case 'lion':
      return '🦁';
    case 'leopard':
      return '🐆';
    case 'cheetah':
      return '🐆';
    case 'pangolin':
      return '🦔';
    case 'aardvark':
      return '🐜';
    case 'hyena':
      return '🐺';
    case 'brown hyena':
      return '🐺';
    case "pel's fishing owl":
      return '🦉';
    case 'rhino':
      return '🦏';
    case 'buffalo':
      return '🐃';
    case 'giraffe':
      return '🦒';
    case 'elephant':
      return '🐘';
    case 'wild dog':
      return '🐕';
    case 'zebra':
      return '🦓';
    default:
      return '🐾';
  }
}
