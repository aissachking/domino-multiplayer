import 'package:flutter/foundation.dart';

import '../engine/engine.dart';
import '../engine/models.dart';

enum ConnectionStatus { connecting, connected, reconnecting, offline }

/// One seat as displayed at the table (never contains the seat's hand).
@immutable
class SeatInfo {
  const SeatInfo({
    required this.id,
    required this.name,
    required this.isBot,
    required this.isMe,
    required this.connected,
    required this.autopilot,
    required this.score,
    required this.tileCount,
    this.difficulty,
  });

  factory SeatInfo.fromJson(Map<String, dynamic> json, String me) => SeatInfo(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        isBot: json['kind'] == 'bot',
        isMe: json['id'] == me,
        connected: json['connected'] as bool? ?? true,
        autopilot: json['autopilot'] as bool? ?? false,
        score: json['score'] as int? ?? 0,
        tileCount: json['tileCount'] as int? ?? 0,
        difficulty: json['difficulty'] as String?,
      );

  final String id;
  final String name;
  final bool isBot;
  final bool isMe;
  final bool connected;
  final bool autopilot;
  final int score;
  final int tileCount;
  final String? difficulty;
}

/// Everything the table UI needs, identical for offline and online games.
@immutable
class TableSnapshot {
  const TableSnapshot({
    required this.version,
    required this.round,
    required this.phase,
    required this.targetScore,
    required this.board,
    required this.stockCount,
    required this.currentPlayerId,
    required this.openingTileId,
    required this.seats,
    required this.myId,
    required this.hand,
    required this.lastRound,
    required this.winnerId,
    required this.lastAction,
  });

  /// Builds a snapshot from the server's sanitized `game:state` payload.
  factory TableSnapshot.fromView(Map<String, dynamic> json) {
    final me = json['you'] as String;
    List<Map<String, dynamic>> maps(Object? list) =>
        (list as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    return TableSnapshot(
      version: json['version'] as int,
      round: json['round'] as int,
      phase: phaseFromName(json['phase'] as String),
      targetScore: json['targetScore'] as int,
      board: maps(json['board']).map(PlacedTile.fromJson).toList(),
      stockCount: json['stockCount'] as int,
      currentPlayerId: json['currentPlayerId'] as String,
      openingTileId: json['openingTileId'] as String?,
      seats: maps(json['players']).map((p) => SeatInfo.fromJson(p, me)).toList(),
      myId: me,
      hand: maps(json['hand']).map(Tile.fromJson).toList(),
      lastRound: json['lastRound'] == null ? null : RoundResult.fromJson(Map<String, dynamic>.from(json['lastRound'] as Map)),
      winnerId: json['winnerId'] as String?,
      lastAction: json['lastAction'] == null ? null : GameAction.fromJson(Map<String, dynamic>.from(json['lastAction'] as Map)),
    );
  }

  /// Builds a snapshot from a local engine state (offline games).
  factory TableSnapshot.fromState(GameState state, {required String myId, required List<SeatInfo> Function(GameState) seats}) {
    final mine = state.players.firstWhere((p) => p.id == myId, orElse: () => PlayerState(id: myId));
    return TableSnapshot(
      version: state.version,
      round: state.round,
      phase: state.phase,
      targetScore: state.targetScore,
      board: List.unmodifiable(state.board),
      stockCount: state.stock.length,
      currentPlayerId: state.currentPlayer.id,
      openingTileId: state.openingTileId,
      seats: seats(state),
      myId: myId,
      hand: List.unmodifiable(mine.hand),
      lastRound: state.lastRound,
      winnerId: state.winnerId,
      lastAction: state.lastAction,
    );
  }

  final int version;
  final int round;
  final Phase phase;
  final int targetScore;
  final List<PlacedTile> board;
  final int stockCount;
  final String currentPlayerId;
  final String? openingTileId;
  final List<SeatInfo> seats;
  final String myId;
  final List<Tile> hand;
  final RoundResult? lastRound;
  final String? winnerId;
  final GameAction? lastAction;

  bool get isMyTurn => phase == Phase.playing && currentPlayerId == myId;
  SeatInfo? seat(String id) => seats.where((s) => s.id == id).firstOrNull;
  SeatInfo? get me => seat(myId);

  List<BoardEnd> endsFor(Tile tile) => legalEndsFor(board, openingTileId, tile);
  bool canPlay(Tile tile) => endsFor(tile).isNotEmpty;
  bool get hasMove => hand.any(canPlay);
  bool get mustDraw => isMyTurn && !hasMove && stockCount > 0;
  bool get mustPass => isMyTurn && !hasMove && stockCount == 0;
}

/// Common interface for offline (local engine) and online (server) tables.
abstract class TableSession extends ChangeNotifier {
  TableSnapshot? get snapshot;
  bool get isOnline;
  ConnectionStatus get connection;
  bool get busy;

  /// Last error code to show (engine or server code), consumed by the UI.
  String? takeError();

  Future<void> play(String tileId, BoardEnd end);
  Future<void> draw();
  Future<void> pass();
  Future<void> nextRound();
  Future<void> leave();

  /// Online only: the server starts the next round automatically.
  bool get autoNextRound;
}
