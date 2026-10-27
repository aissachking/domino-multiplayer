import 'dart:convert';
import 'dart:io';

import 'package:daeef_jiddan/ai/bot.dart';
import 'package:daeef_jiddan/engine/engine.dart';
import 'package:daeef_jiddan/engine/models.dart';
import 'package:daeef_jiddan/engine/rng.dart';
import 'package:flutter_test/flutter_test.dart';

/// Same digest as game-engine/src/vectors.ts.
String digest(GameState s) => [
      s.version,
      s.round,
      phaseName(s.phase),
      s.current,
      s.players.map((p) => '${p.score}:${p.hand.map((t) => t.id).join(',')}:${p.missing.join('')}').join('|'),
      s.board.map((t) => '${t.left}${t.right}').join(''),
      s.stock.length,
      s.openingTileId ?? '-',
      s.consecutivePasses,
    ].join('/');

Matcher throwsCode(String code) => throwsA(isA<EngineError>().having((e) => e.code, 'code', code));

int tileCount(GameState s) => s.players.fold(0, (n, p) => n + p.hand.length) + s.board.length + s.stock.length;

void main() {
  test('mulberry32 matches the TypeScript generator', () {
    final r = mulberry32(1);
    expect([r(), r(), r(), r()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741]);
  });

  test('engine vectors: Dart reproduces every TypeScript step exactly', () {
    final vectors = jsonDecode(File('test/fixtures/engine_vectors.json').readAsStringSync()) as List;
    expect(vectors, isNotEmpty);
    for (final raw in vectors) {
      final v = raw as Map<String, dynamic>;
      final random = mulberry32(v['seed'] as int);
      var state = createMatch((v['players'] as List).cast<String>(), v['targetScore'] as int, random);
      expect(state.players.map((p) => p.hand.map((t) => t.id).toList()).toList(), v['initialHands'], reason: 'deal seed ${v['seed']}');
      expect(state.stock.map((t) => t.id).toList(), v['initialStock']);
      var step = 0;
      for (final s in v['steps'] as List) {
        final action = Map<String, dynamic>.from((s as Map)['action'] as Map);
        state = action['type'] == 'next-round' ? startNextRound(state, random) : applyAction(state, GameAction.fromJson(action));
        expect(digest(state), s['digest'], reason: 'seed ${v['seed']} players ${(v['players'] as List).length} step $step');
        step++;
      }
      final fin = v['final'] as Map;
      expect(phaseName(state.phase), fin['phase']);
      expect(state.winnerId, fin['winnerId']);
      expect(state.players.map((p) => p.score).toList(), fin['scores']);
    }
  });

  test('28 unique tiles and correct deal sizes', () {
    expect(createSet().map((t) => t.id).toSet().length, 28);
    for (final n in [2, 3, 4]) {
      final g = createMatch(List.generate(n, (i) => 'p$i'), 100, mulberry32(n));
      expect(g.players.every((p) => p.hand.length == (n == 2 ? 7 : 5)), isTrue);
      expect(tileCount(g), 28);
    }
  });

  test('opening, illegal moves, drawing and passing follow the rules', () {
    final g = createMatch(['a', 'b'], 100, mulberry32(3));
    final starter = g.currentPlayer;
    final other = starter.hand.firstWhere((t) => t.id != g.openingTileId);
    expect(() => applyAction(g, GameAction.play(starter.id, other.id, BoardEnd.left)), throwsCode('MUST_OPEN_WITH_TILE'));
    final waiting = g.players[(g.current + 1) % 2].id;
    expect(() => applyAction(g, GameAction.draw(waiting)), throwsCode('NOT_YOUR_TURN'));
    final n = applyAction(g, GameAction.play(starter.id, g.openingTileId!, BoardEnd.left));
    expect(n.version, 1);
    expect(g.board, isEmpty, reason: 'input state must not be mutated');
    expect(() => applyAction(n, GameAction.pass(n.currentPlayer.id)), throwsA(isA<EngineError>()));
  });

  test('random full matches terminate with tiles conserved', () {
    for (var seed = 1; seed <= 40; seed++) {
      final rnd = mulberry32(seed);
      var g = createMatch(List.generate(2 + seed % 3, (i) => 'p$i'), 50, rnd);
      var steps = 0;
      while (g.phase != Phase.matchOver) {
        expect(++steps, lessThan(5000));
        if (g.phase == Phase.roundOver) {
          g = startNextRound(g, rnd);
          continue;
        }
        g = decideBotAction(g, g.current, Difficulty.easy, random: rnd).next;
        expect(tileCount(g), 28);
      }
      expect(g.winnerId, isNotNull);
      expect(() => applyAction(g, GameAction.pass(g.currentPlayer.id)), throwsCode('MATCH_OVER'));
    }
  });

  test('parseState rejects corrupted saves', () {
    final g = createMatch(['me', 'bot1'], 100, mulberry32(9));
    expect(parseState(jsonDecode(jsonEncode(g.toJson()))).version, 0);
    final dup = g.toJson();
    ((dup['players'] as List)[0]['hand'] as List).add((dup['stock'] as List).first);
    expect(() => parseState(jsonDecode(jsonEncode(dup))), throwsCode('INVALID_STATE'));
    expect(() => parseState({'nope': true}), throwsCode('INVALID_STATE'));
    expect(() => parseState('garbage'), throwsCode('INVALID_STATE'));
  });
}
