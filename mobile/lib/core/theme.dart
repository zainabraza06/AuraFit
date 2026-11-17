import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// The web app's design language: near-black surfaces, champagne-gold accent,
/// Cormorant Garamond for headings, Inter for body text.
class AuraColors {
  static const bg = Color(0xFF0C0B0A);
  static const surface = Color(0xFF131210);
  static const card = Color(0xFF181614);
  static const elevated = Color(0xFF201E1B);
  static const accent = Color(0xFFC9A96E);
  static const accentLight = Color(0xFFE2C898);
  static const accentDeep = Color(0xFF9E7D48);
  static const text = Color(0xFFF0ECE6);
  static const textDim = Color(0xFF9E9689);
  static const textMuted = Color(0xFF5C5750);
  static const border = Color(0x12FFFFFF);
  static const error = Color(0xFFC47272);
  static const success = Color(0xFF72A884);
}

/// Fonts are downloaded from Google Fonts the first time they are needed, then cached on the device.
/// Tests (and anything offline-only) set this to false and get the platform fonts instead, with no network call.
class AuraFonts {
  static bool enabled = true;
}

TextStyle display(double size, {FontWeight weight = FontWeight.w500, Color color = AuraColors.text}) => AuraFonts.enabled
    ? GoogleFonts.cormorantGaramond(fontSize: size, fontWeight: weight, color: color, height: 1.1)
    : TextStyle(fontFamily: 'serif', fontSize: size, fontWeight: weight, color: color, height: 1.1);

TextStyle _inter({double? size, Color? color, FontWeight? weight}) =>
    AuraFonts.enabled ? GoogleFonts.inter(fontSize: size, color: color, fontWeight: weight) : TextStyle(fontSize: size, color: color, fontWeight: weight);

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final body = (AuraFonts.enabled ? GoogleFonts.interTextTheme(base.textTheme) : base.textTheme).apply(bodyColor: AuraColors.text, displayColor: AuraColors.text);
  return base.copyWith(
    scaffoldBackgroundColor: AuraColors.bg,
    colorScheme: const ColorScheme.dark(
      primary: AuraColors.accent,
      onPrimary: Color(0xFF1A1408),
      secondary: AuraColors.accentLight,
      surface: AuraColors.surface,
      onSurface: AuraColors.text,
      error: AuraColors.error,
    ),
    textTheme: body,
    appBarTheme: AppBarTheme(
      backgroundColor: AuraColors.bg,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: display(26),
      iconTheme: const IconThemeData(color: AuraColors.text),
    ),
    cardTheme: CardThemeData(
      color: AuraColors.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AuraColors.border)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AuraColors.surface,
      indicatorColor: AuraColors.accent.withValues(alpha: 0.18),
      labelTextStyle: WidgetStatePropertyAll(_inter(size: 11, color: AuraColors.textDim)),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? AuraColors.accent : AuraColors.textDim),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AuraColors.card,
      hintStyle: const TextStyle(color: AuraColors.textMuted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AuraColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AuraColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AuraColors.accent)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AuraColors.accent,
        foregroundColor: const Color(0xFF1A1408),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: _inter(weight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AuraColors.accent,
        side: const BorderSide(color: AuraColors.accentDeep),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AuraColors.card,
      selectedColor: AuraColors.accent.withValues(alpha: 0.2),
      side: const BorderSide(color: AuraColors.border),
      labelStyle: _inter(size: 12.5, color: AuraColors.text),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    dividerTheme: const DividerThemeData(color: AuraColors.border, space: 1),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AuraColors.elevated,
      contentTextStyle: _inter(color: AuraColors.text),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );
}
