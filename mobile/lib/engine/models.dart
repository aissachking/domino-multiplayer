/// Game data models shared by the offline engine, the bots and the online
/// views received from the server. JSON shapes match the TypeScript engine.
library;

enum BoardEnd { left, right }

BoardEnd endFromName(String name) => name == 'right' ? BoardEnd.right : BoardEnd.left;

const List<int> kTargetScores = [50, 100, 150, 200];

class Tile {
  const Tile(this.a, this.b);

  /// Canonical constructor from any two values (low value first).
  factory Tile.of(int x, int y) => x <= y ? Tile(x, y) : Tile(y, x);

  factory Tile.fromId(String id) {
    final parts = id.split('-');
    return Tile.of(int.parse(parts[0]), int.parse(parts[1]));
  }

  factory Tile.fromJson(Map<String, dynamic> json) => Tile.of(json['a'] as int, json['b'] as int);

  final int a;
  final int b;

  String get id => '$a-$b';
  int get pips => a + b;
  bool get isDouble => a == b;
  bool matches(int value) => a == value || b == value;

  Map<String, dynamic> toJson() => {'id': id, 'a': a, 'b': b};

  @override
  bool operator ==(Object other) => other is Tile && other.a == a && other.b == b;

  @override
  int get hashCode => Object.hash(a, b);

  @override
  String toString() => id;
}

/// A tile on the board with its displayed orientation.
class PlacedTile {
  const PlacedTile(this.tile, this.left, this.right);

  factory PlacedTile.fromJson(Map<String, dynamic> json) =>
      PlacedTile(Tile.of(json['a'] as int, json['b'] as int), json['left'] as int, json['right'] as int);

  final Tile tile;
  final int left;
  final int right;

  String get id => tile.id;

  Map<String, dynamic> toJson() => {...tile.toJson(), 'left': left, 'right': right};
}

class PlayerState {
  PlayerState({required this.id, this.score = 0, List<Tile>? hand, List<int>? missing})
      : hand = hand ?? <Tile>[],
        missing = missing ?? <int>[];

  factory PlayerState.fromJson(Map<String, dynamic> json) => PlayerState(
        id: json['id'] as String,
        score: json['score'] as int,
        hand: (json['hand'] as List).map((t) => Tile.fromJson(Map<String, dynamic>.from(t as Map))).toList(),
        missing: (json['missing'] as List? ?? const []).map((v) => v as int).toList(),
      );

  final String id;
  int score;
  List<Tile> hand;
  List<int> missing;

  Map<String, dynamic> toJson() => {
        'id': id,
        'score': score,
        'hand': hand.map((t) => t.toJson()).toList(),
        'missing': missing,
      };
}

class RoundHand {
  const RoundHand({required this.playerId, required this.pips, required this.tiles});

  factory RoundHand.fromJson(Map<String, dynamic> json) => RoundHand(
        playerId: json['playerId'] as String,
        pips: json['pips'] as int,
        tiles: (json['tiles'] as List).map((t) => Tile.fromJson(Map<String, dynamic>.from(t as Map))).toList(),
      );

  final String playerId;
  final int pips;
  final List<Tile> tiles;

  Map<String, dynamic> toJson() => {'playerId': playerId, 'pips': pips, 'tiles': tiles.map((t) => t.toJson()).toList()};
}

class RoundResult {
  const RoundResult({
    required this.round,
    required this.winnerId,
    required this.reason,
    required this.points,
    required this.hands,
  });

  factory RoundResult.fromJson(Map<String, dynamic> json) => RoundResult(
        round: json['round'] as int,
        winnerId: json['winnerId'] as String,
        reason: json['reason'] as String,
        points: json['points'] as int,
        hands: (json['hands'] as List).map((h) => RoundHand.fromJson(Map<String, dynamic>.from(h as Map))).toList(),
      );

  final int round;
  final String winnerId;

  /// 'domino' or 'blocked'.
  final String reason;
  final int points;
  final List<RoundHand> hands;

  bool get blocked => reason == 'blocked';

  Map<String, dynamic> toJson() => {
        'round': round,
        'winnerId': winnerId,
        'reason': reason,
        'points': points,
        'hands': hands.map((h) => h.toJson()).toList(),
      };
}

enum ActionType { play, draw, pass }

class GameAction {
  const GameAction.play(this.playerId, String this.tileId, BoardEnd this.end) : type = ActionType.play;
  const GameAction.draw(this.playerId)
      : type = ActionType.draw,
        tileId = null,
        end = null;
  const GameAction.pass(this.playerId)
      : type = ActionType.pass,
        tileId = null,
        end = null;

  factory GameAction.fromJson(Map<String, dynamic> json) {
    final player = json['playerId'] as String;
    switch (json['type']) {
      case 'play':
        return GameAction.play(player, json['tileId'] as String, endFromName(json['end'] as String));
      case 'draw':
        return GameAction.draw(player);
      default:
        return GameAction.pass(player);
    }
  }

  final ActionType type;
  final String playerId;
  final String? tileId;
  final BoardEnd? end;

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'playerId': playerId,
        if (tileId != null) 'tileId': tileId,
        if (end != null) 'end': end!.name,
      };
}

enum Phase { playing, roundOver, matchOver }

Phase phaseFromName(String name) => switch (name) {
      'round-over' => Phase.roundOver,
      'match-over' => Phase.matchOver,
      _ => Phase.playing,
    };

String phaseName(Phase phase) => switch (phase) {
      Phase.playing => 'playing',
      Phase.roundOver => 'round-over',
      Phase.matchOver => 'match-over',
    };

class GameState {
  GameState({
    required this.version,
    required this.round,
    required this.phase,
    required this.targetScore,
    required this.players,
    required this.board,
    required this.stock,
    required this.current,
    required this.starter,
    required this.openingTileId,
    required this.consecutivePasses,
    required this.lastRound,
    required this.winnerId,
    required this.lastAction,
  });

  factory GameState.fromJson(Map<String, dynamic> json) {
    if (json['schema'] != 1) throw const FormatException('Unsupported schema');
    return GameState(
      version: json['version'] as int,
      round: json['round'] as int,
      phase: phaseFromName(json['phase'] as String),
      targetScore: json['targetScore'] as int,
      players: (json['players'] as List).map((p) => PlayerState.fromJson(Map<String, dynamic>.from(p as Map))).toList(),
      board: (json['board'] as List).map((t) => PlacedTile.fromJson(Map<String, dynamic>.from(t as Map))).toList(),
      stock: (json['stock'] as List).map((t) => Tile.fromJson(Map<String, dynamic>.from(t as Map))).toList(),
      current: json['current'] as int,
      starter: json['starter'] as int,
      openingTileId: json['openingTileId'] as String?,
      consecutivePasses: json['consecutivePasses'] as int,
      lastRound: json['lastRound'] == null ? null : RoundResult.fromJson(Map<String, dynamic>.from(json['lastRound'] as Map)),
      winnerId: json['winnerId'] as String?,
      lastAction: json['lastAction'] == null ? null : GameAction.fromJson(Map<String, dynamic>.from(json['lastAction'] as Map)),
    );
  }

  int version;
  int round;
  Phase phase;
  int targetScore;
  List<PlayerState> players;
  List<PlacedTile> board;
  List<Tile> stock;
  int current;
  int starter;
  String? openingTileId;
  int consecutivePasses;
  RoundResult? lastRound;
  String? winnerId;
  GameAction? lastAction;

  PlayerState get currentPlayer => players[current];

  int seatOf(String playerId) => players.indexWhere((p) => p.id == playerId);

  GameState clone() => GameState.fromJson(toJson());

  Map<String, dynamic> toJson() => {
        'schema': 1,
        'version': version,
        'round': round,
        'phase': phaseName(phase),
        'targetScore': targetScore,
        'players': players.map((p) => p.toJson()).toList(),
        'board': board.map((t) => t.toJson()).toList(),
        'stock': stock.map((t) => t.toJson()).toList(),
        'current': current,
        'starter': starter,
        'openingTileId': openingTileId,
        'consecutivePasses': consecutivePasses,
        'lastRound': lastRound?.toJson(),
        'winnerId': winnerId,
        'lastAction': lastAction?.toJson(),
      };
}
