import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../state/settings_controller.dart';
import 'tile_skins.dart';

/// Reusable domino tile used in the hand, on the board and in skin previews.
///
/// [first] is drawn on the left (horizontal) or top (vertical) half. The tile
/// keeps a strict 2:1 aspect ratio so it never distorts when resized.
class DominoTile extends StatelessWidget {
  const DominoTile({
    super.key,
    required this.first,
    required this.second,
    this.axis = Axis.vertical,
    this.length = 64,
    this.skin,
    this.highlighted = false,
    this.selected = false,
    this.dimmed = false,
    this.faceDown = false,
    this.onTap,
  });

  /// A face-down tile (opponents' hands).
  const DominoTile.back({super.key, this.axis = Axis.vertical, this.length = 28, this.skin})
      : first = 0,
        second = 0,
        highlighted = false,
        selected = false,
        dimmed = false,
        faceDown = true,
        onTap = null;

  final int first;
  final int second;
  final Axis axis;
  final double length;
  final TileSkin? skin;
  final bool highlighted;
  final bool selected;
  final bool dimmed;
  final bool faceDown;
  final VoidCallback? onTap;

  Size get size => axis == Axis.horizontal ? Size(length, length / 2) : Size(length / 2, length);

  @override
  Widget build(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SettingsScope>();
    final effective = skin ?? scope?.notifier?.skin ?? TileSkin.classic;
    final glow = Theme.of(context).colorScheme.tertiary;
    Widget tile = CustomPaint(
      size: size,
      painter: DominoPainter(
        first: first,
        second: second,
        axis: axis,
        skin: effective,
        faceDown: faceDown,
        highlight: selected ? glow : (highlighted ? glow.withValues(alpha: 0.75) : null),
      ),
    );
    if (dimmed) tile = Opacity(opacity: 0.45, child: tile);
    final label = faceDown ? 'domino' : 'domino $first-$second';
    tile = Semantics(label: label, button: onTap != null, selected: selected, child: tile);
    if (onTap == null) return tile;
    return GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: tile);
  }
}

class DominoPainter extends CustomPainter {
  DominoPainter({
    required this.first,
    required this.second,
    required this.axis,
    required this.skin,
    this.faceDown = false,
    this.highlight,
  });

  final int first;
  final int second;
  final Axis axis;
  final TileSkin skin;
  final bool faceDown;
  final Color? highlight;

  // Pip positions on a 3x3 grid (column, row) for values 0..6.
  static const List<List<(int, int)>> _layout = [
    [],
    [(1, 1)],
    [(0, 0), (2, 2)],
    [(0, 0), (1, 1), (2, 2)],
    [(0, 0), (2, 0), (0, 2), (2, 2)],
    [(0, 0), (2, 0), (1, 1), (0, 2), (2, 2)],
    [(0, 0), (0, 1), (0, 2), (2, 0), (2, 1), (2, 2)],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final short = math.min(size.width, size.height);
    final radius = Radius.circular(short * 0.14);
    final rect = Offset.zero & size;
    final body = RRect.fromRectAndRadius(rect.deflate(0.5), radius);

    // soft shadow
    canvas.drawRRect(
      body.shift(Offset(0, short * 0.04)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.22)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, short * 0.05),
    );

    if (highlight != null) {
      canvas.drawRRect(
        body.inflate(short * 0.08),
        Paint()
          ..color = highlight!
          ..style = PaintingStyle.stroke
          ..strokeWidth = short * 0.1,
      );
    }

    if (faceDown) {
      canvas.drawRRect(body, Paint()..color = skin.back);
      canvas.drawRRect(
        body.deflate(short * 0.12),
        Paint()
          ..color = Colors.white.withValues(alpha: 0.18)
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(1.0, short * 0.05),
      );
      _border(canvas, body, short);
      return;
    }

    canvas.drawRRect(
      body,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [skin.faceTop, skin.faceBottom],
        ).createShader(rect),
    );

    if (skin.grain != null) {
      canvas.save();
      canvas.clipRRect(body);
      final grain = Paint()
        ..color = skin.grain!
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(0.6, short * 0.025);
      final horizontal = axis == Axis.horizontal;
      for (var i = 1; i < 7; i++) {
        final t = i / 7;
        final path = Path();
        if (horizontal) {
          final y = size.height * t;
          path.moveTo(0, y);
          path.quadraticBezierTo(size.width * 0.5, y + short * (i.isEven ? 0.08 : -0.08), size.width, y);
        } else {
          final x = size.width * t;
          path.moveTo(x, 0);
          path.quadraticBezierTo(x + short * (i.isEven ? 0.08 : -0.08), size.height * 0.5, x, size.height);
        }
        canvas.drawPath(path, grain);
      }
      canvas.restore();
    }

    _border(canvas, body, short);

    // divider between the halves
    final inset = short * 0.14;
    final dividerPaint = Paint()
      ..color = skin.divider
      ..strokeWidth = math.max(1.0, short * (skin.borderWidth > 2 ? 0.06 : 0.035))
      ..strokeCap = StrokeCap.round;
    final Rect firstHalf;
    final Rect secondHalf;
    if (axis == Axis.horizontal) {
      final mid = size.width / 2;
      canvas.drawLine(Offset(mid, inset), Offset(mid, size.height - inset), dividerPaint);
      firstHalf = Rect.fromLTWH(0, 0, mid, size.height);
      secondHalf = Rect.fromLTWH(mid, 0, mid, size.height);
    } else {
      final mid = size.height / 2;
      canvas.drawLine(Offset(inset, mid), Offset(size.width - inset, mid), dividerPaint);
      firstHalf = Rect.fromLTWH(0, 0, size.width, mid);
      secondHalf = Rect.fromLTWH(0, mid, size.width, mid);
    }
    _half(canvas, firstHalf, first);
    _half(canvas, secondHalf, second);
  }

  void _border(Canvas canvas, RRect body, double short) {
    canvas.drawRRect(
      body,
      Paint()
        ..color = skin.border
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(0.8, skin.borderWidth * short / 30),
    );
  }

  void _half(Canvas canvas, Rect half, int value) {
    final side = math.min(half.width, half.height);
    if (skin.numerals) {
      final painter = TextPainter(
        text: TextSpan(
          text: '$value',
          style: TextStyle(
            fontFamily: 'Tajawal',
            fontWeight: FontWeight.w800,
            fontSize: side * 0.62,
            height: 1.0,
            color: value == 0 ? skin.pip.withValues(alpha: 0.35) : skin.pipColor(value),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      painter.paint(canvas, half.center - Offset(painter.width / 2, painter.height / 2));
      return;
    }
    final cell = side * 0.27;
    final pipRadius = side * 0.085 * skin.pipScale;
    final fill = Paint()..color = skin.pipColor(value);
    final outline = skin.pipOutline == null
        ? null
        : (Paint()
          ..color = skin.pipOutline!
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(0.6, pipRadius * 0.35));
    final horizontal = axis == Axis.horizontal;
    for (final (col, row) in _layout[value.clamp(0, 6).toInt()]) {
      // rotate the pattern with the tile so 6 shows as rows on horizontal tiles
      final dx = (horizontal ? row : col) - 1;
      final dy = (horizontal ? col : row) - 1;
      final center = half.center + Offset(dx * cell, dy * cell);
      canvas.drawCircle(center, pipRadius, fill);
      if (outline != null) canvas.drawCircle(center, pipRadius, outline);
    }
  }

  @override
  bool shouldRepaint(DominoPainter old) =>
      old.first != first ||
      old.second != second ||
      old.axis != axis ||
      old.skin != skin ||
      old.faceDown != faceDown ||
      old.highlight != highlight;
}
