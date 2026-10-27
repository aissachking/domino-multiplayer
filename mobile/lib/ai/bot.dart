/// Offline bots — mirrors `ai/src/index.ts`. Bots only receive a [BotView]
/// (own hand + public information); they never see another player's hand.
library;

import '../engine/engine.dart';
import '../engine/models.dart';
import '../engine/rng.dart';

enum Difficulty { easy, normal, hard, expert }

Difficulty difficultyFromName(String? name) =>
    Difficulty.values.firstWhere((d) => d.name == name, orElse: () => Difficulty.normal);

class BotOpponent {
  const BotOpponent({required this.seat, required this.id, required this.tileCount, required this.missing});
  final int seat;
  final String id;
  final int tileCount;
  final List<int> missing;
}

class BotView {
  BotView({
    required this.seat,
    required this.playerId,
    required this.hand,
    required this.board,
    required this.openingTileId,
    required this.stockCount,
    required this.opponents,
  });

  factory BotView.of(GameState state, int seat) {
    final n = state.players.length;
    return BotView(
      seat: seat,
      playerId: state.players[seat].id,
      hand: List.of(state.players[seat].hand),
      board: List.of(state.board),
      openingTileId: state.openingTileId,
      stockCount: state.stock.length,
      opponents: [
        for (var k = 1; k < n; k++)
          BotOpponent(
            seat: (seat + k) % n,
            id: state.players[(seat + k) % n].id,
            tileCount: state.players[(seat + k) % n].hand.length,
            missing: List.of(state.players[(seat + k) % n].missing),
          ),
      ],
    );
  }

  final int seat;
  final String playerId;
  final List<Tile> hand;
  final List<PlacedTile> board;
  final String? openingTileId;
  final int stockCount;
  final List<BotOpponent> opponents;
}

List<Move> candidateMoves(BotView view) => [
      for (final tile in view.hand)
        for (final end in legalEndsFor(view.board, view.openingTileId, tile)) Move(tile, end),
    ];

(int, int) endsAfter(List<PlacedTile> board, Move move) {
  final t = move.tile;
  if (board.isEmpty) return (t.a, t.b);
  final left = board.first.left;
  final right = board.last.right;
  if (move.end == BoardEnd.left) return (t.a == left ? t.b : t.a, right);
  return (left, t.a == right ? t.b : t.a);
}

int _countValue(Iterable<Tile> tiles, int v) => tiles.where((t) => t.matches(v)).length;

double _normalScore(BotView view, Move m) => m.tile.pips + (m.tile.isDouble ? 4.0 : 0.0);

double _hardScore(BotView view, Move m) {
  final rest = view.hand.where((t) => t.id != m.tile.id).toList();
  if (rest.isEmpty) return 10000;
  final (l, r) = endsAfter(view.board, m);
  final boardAfter = [...view.board.map((p) => p.tile), m.tile];
  final next = view.opponents.isEmpty ? null : view.opponents.first;
  var score = m.tile.pips + (m.tile.isDouble ? 3.0 : 0.0);
  score += 2 * rest.where((t) => t.matches(l) || t.matches(r)).length;
  for (final v in l == r ? [l] : [l, r]) {
    final unseen = 7 - _countValue(rest, v) - _countValue(boardAfter, v);
    if (next != null && next.missing.contains(v)) score += 4;
    if (unseen == 0) score += 2;
    score -= unseen * 0.3;
  }
  return score;
}

Move _pickBest(BotView view, List<Move> moves, double Function(BotView, Move) scorer) {
  var best = moves.first;
  var bestScore = double.negativeInfinity;
  for (final m in moves) {
    final s = scorer(view, m);
    if (s > bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return best;
}

/// Deals unseen tiles to opponents consistently with counts and known gaps.
GameState sampleWorld(BotView view, RandomSource random) {
  final known = {...view.hand.map((t) => t.id), ...view.board.map((t) => t.id)};
  var pool = shuffle(createSet().where((t) => !known.contains(t.id)).toList(), random);
  final hands = <int, List<Tile>>{};
  final order = [...view.opponents]..sort((a, b) => b.missing.length.compareTo(a.missing.length));
  for (final opp in order) {
    final hand = <Tile>[];
    for (final t in pool) {
      if (hand.length >= opp.tileCount) break;
      if (!opp.missing.contains(t.a) && !opp.missing.contains(t.b)) hand.add(t);
    }
    for (final t in pool) {
      if (hand.length >= opp.tileCount) break;
      if (!hand.contains(t)) hand.add(t);
    }
    final taken = hand.map((t) => t.id).toSet();
    pool = pool.where((t) => !taken.contains(t.id)).toList();
    hands[opp.seat] = hand;
  }
  final count = view.opponents.length + 1;
  return GameState(
    version: 0,
    round: 1,
    phase: Phase.playing,
    targetScore: 200,
    players: [
      for (var seat = 0; seat < count; seat++)
        seat == view.seat
            ? PlayerState(id: view.playerId, hand: List.of(view.hand))
            : PlayerState(
                id: view.opponents.firstWhere((o) => o.seat == seat).id,
                hand: hands[seat]!,
                missing: List.of(view.opponents.firstWhere((o) => o.seat == seat).missing),
              ),
    ],
    board: List.of(view.board),
    stock: pool,
    current: view.seat,
    starter: view.seat,
    openingTileId: view.openingTileId,
    consecutivePasses: 0,
    lastRound: null,
    winnerId: null,
    lastAction: null,
  );
}

GameAction _greedyAction(GameState state) {
  final player = state.currentPlayer;
  final moves = legalMoves(state);
  if (moves.isNotEmpty) {
    var best = moves.first;
    var bestScore = -1;
    for (final m in moves) {
      final s = m.tile.pips + (m.tile.isDouble ? 4 : 0);
      if (s > bestScore) {
        best = m;
        bestScore = s;
      }
    }
    return GameAction.play(player.id, best.tile.id, best.end);
  }
  return state.stock.isNotEmpty ? GameAction.draw(player.id) : GameAction.pass(player.id);
}

double _playout(GameState start, String me) {
  var s = start;
  for (var i = 0; i < 300 && s.phase == Phase.playing; i++) {
    s = applyAction(s, _greedyAction(s));
  }
  final result = s.lastRound;
  if (result == null) return 0;
  if (result.winnerId == me) return result.points.toDouble();
  final mine = result.hands.firstWhere((h) => h.playerId == me).pips;
  return -result.points * 0.5 - mine;
}

Move _expertMove(BotView view, List<Move> moves, RandomSource random, Duration budget, int maxSimulations) {
  if (moves.length == 1 || view.hand.length == 1) return moves.first;
  final totals = List<double>.filled(moves.length, 0);
  final counts = List<int>.filled(moves.length, 0);
  final watch = Stopwatch()..start();
  var sims = 0;
  outer:
  while (sims < maxSimulations) {
    final world = sampleWorld(view, random);
    for (var i = 0; i < moves.length; i++) {
      if (watch.elapsed > budget || sims >= maxSimulations) break outer;
      final m = moves[i];
      final after = applyAction(world, GameAction.play(view.playerId, m.tile.id, m.end));
      totals[i] += _playout(after, view.playerId);
      counts[i] += 1;
      sims++;
    }
  }
  var best = -1;
  var bestValue = double.negativeInfinity;
  for (var i = 0; i < moves.length; i++) {
    if (counts[i] == 0) continue;
    final value = totals[i] / counts[i] + _hardScore(view, moves[i]) * 0.01;
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best >= 0 ? moves[best] : _pickBest(view, moves, _hardScore);
}

GameAction chooseAction(
  BotView view,
  Difficulty level, {
  RandomSource? random,
  Duration expertBudget = const Duration(milliseconds: 250),
  int maxSimulations = 500,
}) {
  final rnd = random ?? mulberry32(DateTime.now().microsecondsSinceEpoch);
  final moves = candidateMoves(view);
  if (moves.isEmpty) {
    return view.stockCount > 0 ? GameAction.draw(view.playerId) : GameAction.pass(view.playerId);
  }
  final Move move = switch (level) {
    Difficulty.easy => moves[(rnd() * moves.length).floor()],
    Difficulty.normal => _pickBest(view, moves, _normalScore),
    Difficulty.hard => _pickBest(view, moves, _hardScore),
    Difficulty.expert => _expertMove(view, moves, rnd, expertBudget, maxSimulations),
  };
  return GameAction.play(view.playerId, move.tile.id, move.end);
}

/// Chooses a bot action and validates it with the engine; falls back to a
/// safe legal action if the bot ever produced an invalid decision.
({GameAction action, GameState next, bool fallback}) decideBotAction(
  GameState state,
  int seat,
  Difficulty level, {
  RandomSource? random,
  Duration expertBudget = const Duration(milliseconds: 250),
  int maxSimulations = 500,
}) {
  try {
    final action = chooseAction(
      BotView.of(state, seat),
      level,
      random: random,
      expertBudget: expertBudget,
      maxSimulations: maxSimulations,
    );
    return (action: action, next: applyAction(state, action), fallback: false);
  } on EngineError {
    final action = _greedyAction(state);
    return (action: action, next: applyAction(state, action), fallback: true);
  }
}
