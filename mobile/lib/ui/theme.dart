import 'package:flutter/material.dart';

const kFontFamily = 'Tajawal';
const kFelt = Color(0xFF14533F);
const kFeltDark = Color(0xFF0B3528);
const kAccent = Color(0xFFF2B33D);

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: const Color(0xFF1B6B52),
    brightness: brightness,
    tertiary: kAccent,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: kFontFamily, brightness: brightness);
  return base.copyWith(
    textTheme: base.textTheme.apply(fontFamily: kFontFamily),
    appBarTheme: AppBarTheme(
      centerTitle: true,
      titleTextStyle: base.textTheme.titleLarge?.copyWith(fontFamily: kFontFamily, fontWeight: FontWeight.w800, color: scheme.onSurface),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        textStyle: const TextStyle(fontFamily: kFontFamily, fontSize: 17, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 48),
        textStyle: const TextStyle(fontFamily: kFontFamily, fontSize: 16, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surfaceContainerHigh,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
