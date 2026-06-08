import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Noto Sans + emoji fallback — reduces “missing Noto fonts” warnings on web for mixed text + emoji.
ThemeData moremiAppTheme() {
  final base = ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2E7D32)),
    useMaterial3: true,
  );
  final emojiFamily = GoogleFonts.notoColorEmoji().fontFamily;
  final sans = GoogleFonts.notoSansTextTheme(base.textTheme);
  return base.copyWith(
    textTheme: sans.apply(
      fontFamilyFallback:
          emojiFamily != null ? <String>[emojiFamily] : const <String>[],
    ),
  );
}
