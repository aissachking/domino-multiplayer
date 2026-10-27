import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../engine/models.dart';
import 'domino_tile.dart';

/// Position of one board tile computed by [layoutBoard].
class BoardSlot {
  const BoardSlot({required this.rect, required this.first, required this.second, required this.axis, required this.index});
  final Rect rect;
  final int first;
  final int second;
  final Axis axis;
  final int index;
}

class BoardLayout {
  const BoardLayout(this.slots, this.tileShort);
  final List<BoardSlot> slots;
  final double tileShort;
}

/// Snake ("boustrophedon") layout: rows alternate direction so the chain reads
/// continuously; doubles stand across the line. Tile size shrinks to fit.
BoardLayout layoutBoard(List<PlacedTile> board, Size area, {double maxShort = 34, double minShort = 9}) {
  if (board.isEmpty || area.width <= 0 || area.height <= 0) return const BoardLayout([], 0);
  for (var s = maxShort; s >= minShort; s -= 1) {
    final long = s * 2;
    final gap = math.max(1.5, s * 0.1);
    final rows = <List<int>>[[]];
    var rowWidth = 0.0;
    var fits = true;
    for (var i = 0; i < board.length; i++) {
      final w = board[i].tile.isDouble ? s : long;
      if (w > area.width) {
        fits = false;
        break;
      }
      final needed = rowWidth == 0 ? w : rowWidth + gap + w;
      if (needed > area.width) {
        rows.add([i]);
        rowWidth = w;
      } else {
        rows.last.add(i);
        rowWidth = needed;
      }
    }
    if (!fits) continue;
    final rowGap = s * 0.35;
    final totalHeight = rows.length * long + (rows.length - 1) * rowGap;
    if (totalHeight > area.height && s > minShort) continue;

    double widthOf(List<int> row) =>
        row.fold<double>(0, (sum, i) => sum + (board[i].tile.isDouble ? s : long)) + gap * math.max(0, row.length - 1);
    final blockWidth = rows.map(widthOf).fold<double>(0, math.max);
    final x0 = (area.width - blockWidth) / 2;
    var y = math.max(0.0, (area.height - totalHeight) / 2);
    final slots = <BoardSlot>[];
    for (var r = 0; r < rows.length; r++) {
      final ltr = r.isEven;
      var x = ltr ? x0 : x0 + blockWidth;
      for (final i in rows[r]) {
        final t = board[i];
        final isDouble = t.tile.isDouble;
        final w = isDouble ? s : long;
        final h = isDouble ? long : s;
        final left = ltr ? x : x - w;
        slots.add(BoardSlot(
          rect: Rect.fromLTWH(left, y + (long - h) / 2, w, h),
          // in right-to-left rows the chain runs backwards, so mirror the values
          first: ltr ? t.left : t.right,
          second: ltr ? t.right : t.left,
          axis: isDouble ? Axis.vertical : Axis.horizontal,
          index: i,
        ));
        x = ltr ? x + w + gap : x - w - gap;
      }
      y += long + rowGap;
    }
    return BoardLayout(slots, s);
  }
  return const BoardLayout([], 0);
}

class BoardView extends StatelessWidget {
  const BoardView({
    super.key,
    required this.board,
    this.highlightEnds = const [],
    this.onEndTap,
    this.emptyHint,
  });

  final List<PlacedTile> board;
  final List<BoardEnd> highlightEnds;
  final ValueChanged<BoardEnd>? onEndTap;
  final String? emptyHint;

  @override
  Widget build(BuildContext context) {
    // The chain has a physical left and right end regardless of UI language.
    return Directionality(
      textDirection: TextDirection.ltr,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final area = Size(constraints.maxWidth - 16, constraints.maxHeight - 16);
          if (board.isEmpty) {
            return Center(
              child: emptyHint == null
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        emptyHint!,
                        textAlign: TextAlign.center,
                        textDirection: Directionality.of(context),
                        style: const TextStyle(color: Colors.white70, fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                    ),
            );
          }
          final layout = layoutBoard(board, area);
          final last = board.length - 1;
          return Padding(
            padding: const EdgeInsets.all(8),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                for (final slot in layout.slots)
                  Positioned.fromRect(
                    rect: slot.rect,
                    child: _endWrapper(slot, last),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _endWrapper(BoardSlot slot, int last) {
    BoardEnd? end;
    if (slot.index == 0 && highlightEnds.contains(BoardEnd.left)) end = BoardEnd.left;
    if (slot.index == last && highlightEnds.contains(BoardEnd.right)) end = BoardEnd.right;
    // a single tile is both ends
    if (slot.index == 0 && slot.index == last && highlightEnds.length == 2) end = null;
    final tile = DominoTile(
      first: slot.first,
      second: slot.second,
      axis: slot.axis,
      length: slot.axis == Axis.horizontal ? slot.rect.width : slot.rect.height,
      highlighted: end != null,
    );
    if (end == null || onEndTap == null) return tile;
    final target = end;
    return GestureDetector(
      key: ValueKey('board-end-${target.name}'),
      behavior: HitTestBehavior.opaque,
      onTap: () => onEndTap!(target),
      child: tile,
    );
  }
}
