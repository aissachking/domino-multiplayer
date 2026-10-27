import 'dart:convert';

import 'package:daeef_jiddan/ai/bot.dart';
import 'package:daeef_jiddan/engine/engine.dart';
import 'package:daeef_jiddan/engine/models.dart';
import 'package:daeef_jiddan/engine/rng.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('every difficulty produces only legal actions', () {
    for (final level in Difficulty.values) {
      for (var seed = 1; seed <= (level == Difficulty.expert ? 2 : 8); seed++) {
        final rnd = mulberry32(seed);
        var g = createMatch(['me', 'bot1', 'bot2'], 50, rnd);
        while (g.phase != Phase.matchOver) {
          if (g.phase == Phase.roundOver) {
            g = startNextRound(g, rnd);
            continue;
          }
          final action = chooseAction(BotView.of(g, g.current), level, random: rnd, maxSimulations: 40);
          g = applyAction(g, action); // throws on an illegal action
        }
      }
    }
  });

  test('bots draw or pass when no tile fits', () {
    final view = BotView(
      seat: 0,
      playerId: 'bot1',
      hand: const [Tile(6, 6)],
      board: const [PlacedTile(Tile(1, 2), 1, 2)],
      openingTileId: null,
      stockCount: 3,
      opponents: const [BotOpponent(seat: 1, id: 'me', tileCount: 4, missing: [])],
    );
    for (final level in Difficulty.values) {
      expect(chooseAction(view, level).type, ActionType.draw);
    }
    final empty = BotView(
      seat: 0,
      playerId: 'bot1',
      hand: view.hand,
      board: view.board,
      openingTileId: null,
      stockCount: 0,
      opponents: view.opponents,
    );
    for (final level in Difficulty.values) {
      expect(chooseAction(empty, level).type, ActionType.pass);
    }
  });

  test('a bot view never contains other players private tiles', () {
    final g = createMatch(['me', 'bot1', 'bot2', 'bot3'], 100, mulberry32(21));
    final view = BotView.of(g, 1);
    final seen = {...view.hand.map((t) => t.id), ...view.board.map((t) => t.id)};
    for (final p in g.players.where((p) => p.id != 'bot1')) {
      for (final t in p.hand) {
        expect(seen.contains(t.id), isFalse);
      }
    }
  });

  test('deciding never mutates the given state', () {
    final g = createMatch(['me', 'bot1'], 100, mulberry32(5));
    final before = jsonEncode(g.toJson());
    for (final level in Difficulty.values) {
      decideBotAction(g, g.current, level, random: mulberry32(1), maxSimulations: 30);
    }
    expect(jsonEncode(g.toJson()), before);
  });

  test('expert stays within its time budget', () {
    final g = createMatch(['me', 'b1', 'b2', 'b3'], 100, mulberry32(77));
    final s = applyAction(g, GameAction.play(g.currentPlayer.id, g.openingTileId!, BoardEnd.left));
    final watch = Stopwatch()..start();
    chooseAction(BotView.of(s, s.current), Difficulty.expert, expertBudget: const Duration(milliseconds: 150), maxSimulations: 100000);
    expect(watch.elapsedMilliseconds, lessThan(1200));
  });

  test('stronger levels beat the random bot over many rounds', () {
    int duel(Difficulty strong) {
      var wins = 0;
      for (var i = 0; i < 40; i++) {
        final rnd = mulberry32(1000 + i);
        final ids = i.isOdd ? ['s', 'w'] : ['w', 's'];
        var g = createMatch(ids, 200, rnd);
        while (g.phase == Phase.playing) {
          final level = g.currentPlayer.id == 's' ? strong : Difficulty.easy;
          g = applyAction(g, chooseAction(BotView.of(g, g.current), level, random: rnd, maxSimulations: 40));
        }
        if (g.lastRound!.winnerId == 's') wins++;
      }
      return wins;
    }

    expect(duel(Difficulty.hard), greaterThan(20));
    expect(duel(Difficulty.expert), greaterThan(20));
  });
}
