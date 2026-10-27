/// Double-six domino rules — a one-to-one port of `game-engine/src/engine.ts`.
/// Offline games run entirely on this engine; the shared test vectors prove it
/// behaves exactly like the server's engine. Rules: docs/RULES.md.
library;

import 'models.dart';
import 'rng.dart';

const int kTileCount = 28;

class EngineError implements Exception {
  const EngineError(this.code, [this.detail]);
  final String code;
  final String? detail;

  @override
  String toString() => 'EngineError($code${detail == null ? '' : ': $detail'})';
}

List<Tile> createSet() => [
      for (var a = 0; a <= 6; a++)
        for (var b = a; b <= 6; b++) Tile(a, b),
    ];

int handSize(int playerCount) => playerCount == 2 ? 7 : 5;
int handPips(Iterable<Tile> hand) => hand.fold(0, (sum, t) => sum + t.pips);

class Opening {
  const Opening(this.seat, this.tileId);
  final int seat;
  final String tileId;
}

/// Highest double starts (6-6 … 0-0); without doubles the heaviest tile does.
Opening findOpening(List<List<Tile>> hands) {
  int? bestSeat;
  Tile? bestTile;
  var bestRank = -1;
  for (var seat = 0; seat < hands.length; seat++) {
    for (final tile in hands[seat]) {
      final rank = tile.isDouble ? 1000 + tile.a : tile.pips * 10 + (tile.a > tile.b ? tile.a : tile.b);
      if (rank > bestRank) {
        bestRank = rank;
        bestSeat = seat;
        bestTile = tile;
      }
    }
  }
  if (bestTile == null) throw const EngineError('INVALID_STATE', 'No tiles dealt');
  return Opening(bestSeat!, bestTile.id);
}

({List<List<Tile>> hands, List<Tile> stock}) _deal(int playerCount, RandomSource random) {
  final deck = shuffle(createSet(), random);
  final size = handSize(playerCount);
  final hands = [for (var seat = 0; seat < playerCount; seat++) deck.sublist(seat * size, (seat + 1) * size)];
  return (hands: hands, stock: deck.sublist(playerCount * size));
}

GameState createMatch(List<String> playerIds, int targetScore, RandomSource random) {
  if (playerIds.length < 2 || playerIds.length > 4) throw const EngineError('INVALID_PLAYERS');
  if (playerIds.toSet().length != playerIds.length || playerIds.any((id) => id.isEmpty)) {
    throw const EngineError('INVALID_PLAYERS');
  }
  if (!kTargetScores.contains(targetScore)) throw const EngineError('INVALID_TARGET');
  final dealt = _deal(playerIds.length, random);
  final opening = findOpening(dealt.hands);
  final state = GameState(
    version: 0,
    round: 1,
    phase: Phase.playing,
    targetScore: targetScore,
    players: [
      for (var seat = 0; seat < playerIds.length; seat++) PlayerState(id: playerIds[seat], hand: dealt.hands[seat]),
    ],
    board: [],
    stock: dealt.stock,
    current: opening.seat,
    starter: opening.seat,
    openingTileId: opening.tileId,
    consecutivePasses: 0,
    lastRound: null,
    winnerId: null,
    lastAction: null,
  );
  assertInvariants(state);
  return state;
}

GameState startNextRound(GameState previous, RandomSource random) {
  if (previous.phase == Phase.matchOver) throw const EngineError('MATCH_OVER');
  if (previous.phase != Phase.roundOver || previous.lastRound == null) throw const EngineError('ROUND_NOT_OVER');
  final state = previous.clone();
  final dealt = _deal(state.players.length, random);
  final starter = state.seatOf(previous.lastRound!.winnerId);
  for (var seat = 0; seat < state.players.length; seat++) {
    state.players[seat].hand = dealt.hands[seat];
    state.players[seat].missing = [];
  }
  state.stock = dealt.stock;
  state.board = [];
  state.round += 1;
  state.phase = Phase.playing;
  state.starter = starter < 0 ? 0 : starter;
  state.current = state.starter;
  state.openingTileId = null;
  state.consecutivePasses = 0;
  state.lastAction = null;
  state.version += 1;
  assertInvariants(state);
  return state;
}

class BoardEnds {
  const BoardEnds(this.left, this.right);
  final int left;
  final int right;
}

BoardEnds? boardEnds(List<PlacedTile> board) => board.isEmpty ? null : BoardEnds(board.first.left, board.last.right);

/// Ends where [tile] may be placed. An empty board uses the canonical left end.
List<BoardEnd> legalEndsFor(List<PlacedTile> board, String? openingTileId, Tile tile) {
  final ends = boardEnds(board);
  if (ends == null) return openingTileId != null && tile.id != openingTileId ? const [] : const [BoardEnd.left];
  return [
    if (tile.matches(ends.left)) BoardEnd.left,
    if (tile.matches(ends.right)) BoardEnd.right,
  ];
}

class Move {
  const Move(this.tile, this.end);
  final Tile tile;
  final BoardEnd end;
}

List<Move> legalMoves(GameState state, [int? seatIndex]) {
  final seat = seatIndex ?? state.current;
  if (state.phase != Phase.playing || seat < 0 || seat >= state.players.length) return const [];
  return [
    for (final tile in state.players[seat].hand)
      for (final end in legalEndsFor(state.board, state.openingTileId, tile)) Move(tile, end),
  ];
}

PlacedTile orient(Tile tile, int value, BoardEnd end) {
  final other = tile.a == value ? tile.b : tile.a;
  return end == BoardEnd.left ? PlacedTile(tile, other, value) : PlacedTile(tile, value, other);
}

void _addMissing(PlayerState player, BoardEnds? ends) {
  if (ends == null) return;
  for (final v in [ends.left, ends.right]) {
    if (!player.missing.contains(v)) player.missing.add(v);
  }
  player.missing.sort();
}

/// Validates and applies one action; never mutates [previous].
GameState applyAction(GameState previous, GameAction action) {
  if (previous.phase == Phase.matchOver) throw const EngineError('MATCH_OVER');
  if (previous.phase == Phase.roundOver) throw const EngineError('ROUND_OVER');
  final seat = previous.seatOf(action.playerId);
  if (seat < 0) throw const EngineError('UNKNOWN_PLAYER');
  if (seat != previous.current) throw const EngineError('NOT_YOUR_TURN');

  final state = previous.clone();
  final player = state.players[seat];
  final hasMove = legalMoves(state, seat).isNotEmpty;

  switch (action.type) {
    case ActionType.play:
      final end = action.end;
      if (end == null || action.tileId == null) throw const EngineError('INVALID_ACTION');
      final index = player.hand.indexWhere((t) => t.id == action.tileId);
      if (index < 0) throw const EngineError('TILE_NOT_IN_HAND');
      final tile = player.hand[index];
      if (!legalEndsFor(state.board, state.openingTileId, tile).contains(end)) {
        if (state.board.isEmpty && state.openingTileId != null && tile.id != state.openingTileId) {
          throw EngineError('MUST_OPEN_WITH_TILE', state.openingTileId);
        }
        throw const EngineError('ILLEGAL_MOVE');
      }
      player.hand.removeAt(index);
      final ends = boardEnds(state.board);
      if (ends == null) {
        state.board.add(PlacedTile(tile, tile.a, tile.b));
      } else if (end == BoardEnd.left) {
        state.board.insert(0, orient(tile, ends.left, BoardEnd.left));
      } else {
        state.board.add(orient(tile, ends.right, BoardEnd.right));
      }
      state.openingTileId = null;
      state.consecutivePasses = 0;
      state.lastAction = GameAction.play(player.id, tile.id, end);
      if (player.hand.isEmpty) {
        _finishRound(state, seat, 'domino');
      } else {
        state.current = (seat + 1) % state.players.length;
      }
    case ActionType.draw:
      if (hasMove) throw const EngineError('MOVE_AVAILABLE');
      if (state.stock.isEmpty) throw const EngineError('STOCK_EMPTY');
      player.hand.add(state.stock.removeLast());
      _addMissing(player, boardEnds(state.board));
      state.lastAction = GameAction.draw(player.id);
    case ActionType.pass:
      if (hasMove) throw const EngineError('MOVE_AVAILABLE');
      if (state.stock.isNotEmpty) throw const EngineError('MUST_DRAW');
      _addMissing(player, boardEnds(state.board));
      state.consecutivePasses += 1;
      state.lastAction = GameAction.pass(player.id);
      if (state.consecutivePasses >= state.players.length) {
        _finishRound(state, blockedWinner(state), 'blocked');
      } else {
        state.current = (seat + 1) % state.players.length;
      }
  }
  state.version = previous.version + 1;
  assertInvariants(state);
  return state;
}

/// Lowest pip total wins; ties → fewer tiles; ties → lowest seat.
int blockedWinner(GameState state) {
  var best = 0;
  for (var seat = 0; seat < state.players.length; seat++) {
    final p = state.players[seat];
    final b = state.players[best];
    final diff = handPips(p.hand) - handPips(b.hand);
    if (diff < 0 || (diff == 0 && p.hand.length < b.hand.length)) best = seat;
  }
  return best;
}

void _finishRound(GameState state, int winnerSeat, String reason) {
  final winner = state.players[winnerSeat];
  var points = 0;
  for (var seat = 0; seat < state.players.length; seat++) {
    if (seat != winnerSeat) points += handPips(state.players[seat].hand);
  }
  winner.score += points;
  state.lastRound = RoundResult(
    round: state.round,
    winnerId: winner.id,
    reason: reason,
    points: points,
    hands: [
      for (final p in state.players) RoundHand(playerId: p.id, pips: handPips(p.hand), tiles: List.of(p.hand)),
    ],
  );
  state.current = winnerSeat;
  if (winner.score >= state.targetScore) {
    state.phase = Phase.matchOver;
    state.winnerId = winner.id;
  } else {
    state.phase = Phase.roundOver;
  }
}

/// Throws INVALID_STATE when any rule-level invariant is broken.
void assertInvariants(GameState state) {
  Never fail(String why) => throw EngineError('INVALID_STATE', why);
  if (!kTargetScores.contains(state.targetScore)) fail('target');
  if (state.players.length < 2 || state.players.length > 4) fail('players');
  if (state.current < 0 || state.current >= state.players.length) fail('current');
  if (state.version < 0) fail('version');
  if (state.consecutivePasses < 0 || state.consecutivePasses > state.players.length) fail('passes');
  final seen = <String>{};
  void add(Tile t) {
    if (t.a < 0 || t.b > 6 || t.a > t.b) fail('tile');
    if (!seen.add(t.id)) fail('duplicate ${t.id}');
  }

  final ids = <String>{};
  for (final p in state.players) {
    if (p.id.isEmpty || !ids.add(p.id)) fail('player id');
    if (p.score < 0) fail('score');
    p.hand.forEach(add);
  }
  state.stock.forEach(add);
  for (var i = 0; i < state.board.length; i++) {
    final t = state.board[i];
    add(t.tile);
    final ok = (t.left == t.tile.a && t.right == t.tile.b) || (t.left == t.tile.b && t.right == t.tile.a);
    if (!ok) fail('orientation');
    if (i > 0 && state.board[i - 1].right != t.left) fail('chain');
  }
  if (seen.length != kTileCount) fail('tile count ${seen.length}');
  if (state.phase == Phase.matchOver && state.winnerId == null) fail('winner');
}

/// Parses and validates untrusted JSON (e.g. a saved offline game).
GameState parseState(Object? json) {
  try {
    final state = GameState.fromJson(Map<String, dynamic>.from(json as Map));
    assertInvariants(state);
    return state;
  } on EngineError {
    rethrow;
  } catch (_) {
    throw const EngineError('INVALID_STATE', 'Malformed state');
  }
}
