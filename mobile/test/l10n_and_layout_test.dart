import 'package:daeef_jiddan/engine/models.dart';
import 'package:daeef_jiddan/l10n/app_localizations.dart';
import 'package:daeef_jiddan/net/protocol.dart';
import 'package:daeef_jiddan/ui/widgets/board_view.dart';
import 'package:daeef_jiddan/ui/widgets/tile_skins.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every error code the server or engine can send (shared/src/index.ts).
const serverErrorCodes = [
  'BAD_REQUEST', 'RATE_LIMITED', 'UNAUTHORIZED', 'ROOM_NOT_FOUND', 'ROOM_FULL', 'ALREADY_STARTED', 'NOT_IN_ROOM',
  'NOT_HOST', 'NOT_ENOUGH_PLAYERS', 'PLAYERS_NOT_READY', 'BOT_NOT_FOUND', 'STALE_STATE', 'GAME_NOT_ACTIVE', 'INTERNAL',
  'NOT_YOUR_TURN', 'ROUND_OVER', 'MATCH_OVER', 'ROUND_NOT_OVER', 'TILE_NOT_IN_HAND', 'MUST_OPEN_WITH_TILE',
  'ILLEGAL_MOVE', 'MOVE_AVAILABLE', 'STOCK_EMPTY', 'MUST_DRAW', 'INVALID_ACTION', 'INVALID_TARGET',
];

void main() {
  test('Arabic, French and English define exactly the same keys', () {
    final ar = S.tables['ar']!.keys.toSet();
    for (final lang in ['fr', 'en']) {
      expect(S.tables[lang]!.keys.toSet(), ar, reason: lang);
    }
    for (final table in S.tables.values) {
      for (final value in table.values) {
        expect(value.trim(), isNotEmpty);
      }
    }
  });

  test('all server and engine error codes are translated in every language', () {
    for (final lang in S.tables.keys) {
      final s = S(Locale(lang));
      for (final code in serverErrorCodes) {
        expect(S.tables[lang]!.containsKey('err_$code'), isTrue, reason: '$lang err_$code');
        expect(s.error(code), isNot('err_$code'));
      }
      expect(s.error('SOMETHING_NEW'), s.t('err_generic'));
    }
  });

  test('every tile skin and difficulty has a label; unknown skins fall back to classic', () {
    for (final lang in S.tables.keys) {
      for (final skin in TileSkin.all) {
        expect(S.tables[lang]!.containsKey('skin_${skin.id}'), isTrue);
      }
      for (final d in ['easy', 'normal', 'hard', 'expert']) {
        expect(S.tables[lang]!.containsKey('diff_$d'), isTrue);
      }
    }
    expect(TileSkin.byId('does-not-exist').id, 'classic');
    expect(TileSkin.byId(null).id, 'classic');
    expect(TileSkin.all.map((s) => s.id).toSet().length, TileSkin.all.length);
  });

  test('placeholders are substituted', () {
    expect(S(const Locale('ar')).t('turnOf', {'name': 'سارة'}), 'دور سارة');
    expect(S(const Locale('en')).t('pointsN', {'n': 150}), '150 points');
    expect(S(const Locale('ar')).isRtl, isTrue);
    expect(S(const Locale('fr')).isRtl, isFalse);
  });

  test('room codes are normalized and validated', () {
    expect(normalizeRoomCode(' ab2-cd '), 'AB2CD');
    expect(roomCodePattern.hasMatch('AB2CD'), isTrue);
    expect(roomCodePattern.hasMatch('ABCD'), isFalse);
    expect(roomCodePattern.hasMatch('ABCD0'), isFalse);
    expect(AckResult.parse({'ok': false, 'error': {'code': 'ROOM_FULL'}}).errorCode, 'ROOM_FULL');
    expect(AckResult.parse([{'ok': true, 'data': 3}]).data, 3);
    expect(AckResult.parse('weird').errorCode, 'INTERNAL');
  });

  test('board layout keeps every tile inside the area without overlaps', () {
    // a long chain: 0-0,0-1,1-1,1-2,2-2,... alternating doubles
    final board = <PlacedTile>[];
    for (var v = 0; v <= 6; v++) {
      board.add(PlacedTile(Tile(v, v), v, v));
      if (v < 6) board.add(PlacedTile(Tile(v, v + 1), v, v + 1));
    }
    for (final area in const [Size(320, 260), Size(600, 300), Size(240, 400)]) {
      final layout = layoutBoard(board, area);
      expect(layout.slots.length, board.length);
      for (final a in layout.slots) {
        expect(a.rect.left >= -0.01 && a.rect.right <= area.width + 0.01, isTrue, reason: '$area ${a.rect}');
        for (final b in layout.slots) {
          if (identical(a, b)) continue;
          expect(a.rect.deflate(0.5).overlaps(b.rect.deflate(0.5)), isFalse, reason: '$area overlap ${a.index}/${b.index}');
        }
      }
      // rows alternate direction but the chain values stay continuous
      expect(layout.slots.map((s) => s.index).toList(), List.generate(board.length, (i) => i));
    }
  });
}
