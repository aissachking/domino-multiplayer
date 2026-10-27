import 'package:flutter/material.dart';

/// Visual style of domino tiles. Purely cosmetic: skins never change tile
/// values, identity or rules, and each player's choice stays on their device.
@immutable
class TileSkin {
  const TileSkin({
    required this.id,
    required this.faceTop,
    required this.faceBottom,
    required this.border,
    required this.divider,
    required this.pip,
    required this.back,
    this.pipColors,
    this.pipOutline,
    this.borderWidth = 1.2,
    this.pipScale = 1.0,
    this.numerals = false,
    this.grain,
  });

  final String id;
  final Color faceTop;
  final Color faceBottom;
  final Color border;
  final Color divider;
  final Color pip;
  final Color back;

  /// Optional colour per value 0..6 (colourful skin).
  final List<Color>? pipColors;
  final Color? pipOutline;
  final double borderWidth;
  final double pipScale;

  /// Draw digits instead of pips (high readability).
  final bool numerals;

  /// Optional wood-grain line colour.
  final Color? grain;

  Color pipColor(int value) => pipColors != null ? pipColors![value.clamp(0, 6).toInt()] : pip;

  static const String defaultId = 'classic';

  static const classic = TileSkin(
    id: 'classic',
    faceTop: Color(0xFFFFFDF7),
    faceBottom: Color(0xFFEDE7D9),
    border: Color(0xFF2B2B2B),
    divider: Color(0xFF8C877C),
    pip: Color(0xFF141414),
    back: Color(0xFF1F6F5C),
  );

  static const dark = TileSkin(
    id: 'dark',
    faceTop: Color(0xFF3A3E47),
    faceBottom: Color(0xFF1E2026),
    border: Color(0xFF0B0C0E),
    divider: Color(0xFF6B717D),
    pip: Color(0xFFF7F7F7),
    back: Color(0xFF8E1B2E),
  );

  static const wood = TileSkin(
    id: 'wood',
    faceTop: Color(0xFFD7A26A),
    faceBottom: Color(0xFFA0672F),
    border: Color(0xFF4A2A10),
    divider: Color(0xFF5C3818),
    pip: Color(0xFFFFF4DF),
    pipOutline: Color(0xFF3B2412),
    back: Color(0xFF5C3818),
    grain: Color(0x2E3B2412),
    borderWidth: 1.4,
  );

  static const gold = TileSkin(
    id: 'gold',
    faceTop: Color(0xFFFBE7A1),
    faceBottom: Color(0xFFC99A35),
    border: Color(0xFF6E4C0E),
    divider: Color(0xFF8A6418),
    pip: Color(0xFF2E1E05),
    back: Color(0xFF6E4C0E),
    borderWidth: 1.4,
  );

  static const colorful = TileSkin(
    id: 'colorful',
    faceTop: Color(0xFFFFFFFF),
    faceBottom: Color(0xFFF1F3F8),
    border: Color(0xFF30343B),
    divider: Color(0xFFB0B5C0),
    pip: Color(0xFF141414),
    pipColors: [
      Color(0xFF000000),
      Color(0xFFD32F2F),
      Color(0xFF1565C0),
      Color(0xFF2E7D32),
      Color(0xFFEF6C00),
      Color(0xFF6A1B9A),
      Color(0xFF00838F),
    ],
    back: Color(0xFF283593),
  );

  static const modern = TileSkin(
    id: 'modern',
    faceTop: Color(0xFFFFFFFF),
    faceBottom: Color(0xFFFFFFFF),
    border: Color(0xFF000000),
    divider: Color(0xFF000000),
    pip: Color(0xFF000000),
    back: Color(0xFF000000),
    borderWidth: 2.2,
    pipScale: 1.25,
  );

  static const numbers = TileSkin(
    id: 'numbers',
    faceTop: Color(0xFFF8F9FC),
    faceBottom: Color(0xFFE6E9F2),
    border: Color(0xFF1A237E),
    divider: Color(0xFF7986CB),
    pip: Color(0xFF1A237E),
    back: Color(0xFF1A237E),
    borderWidth: 1.6,
    numerals: true,
  );

  static const List<TileSkin> all = [classic, dark, wood, gold, colorful, modern, numbers];

  /// Unknown or missing ids fall back to the classic skin.
  static TileSkin byId(String? id) => all.firstWhere((s) => s.id == id, orElse: () => classic);
}
