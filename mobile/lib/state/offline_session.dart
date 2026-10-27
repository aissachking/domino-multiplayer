import 'dart:async';
import 'dart:convert';
import 'dart:isolate';

import '../ai/bot.dart';
import '../engine/engine.dart';
import '../engine/models.dart';
import '../engine/rng.dart';
import 'table_session.dart';

/// Offline match: the local engine is authoritative, bots run on-device,
/// and progress is saved after every action so it survives an app restart.
class OfflineSession extends TableSession {
  OfflineSession._({
    required GameState state,
    required this.difficulty,
    required this.myName,
    required int seed,
    required this.saver,
    this.botDelay = const Duration(milliseconds: 850),
    this.useIsolate = true,
  })  : _state = state,
        _seed = seed,
        _random = mulberry32(seed) {
    _rebuild();
  }

  /// Starts a fresh match: the human always sits at seat 0.
  factory OfflineSession.start({
    required int botCount,
    required Difficulty difficulty,
    required int targetScore,
    required String myName,
    required Future<void> Function(String? json) saver,
    int? seed,
    Duration botDelay = const Duration(milliseconds: 850),
    bool useIsolate = true,
  }) {
    final s = seed ?? DateTime.now().microsecondsSinceEpoch & 0x7fffffff;
    final ids = ['me', for (var i = 1; i <= botCount.clamp(1, 3); i++) 'bot$i'];
    final state = createMatch(ids, targetScore, mulberry32(s));
    final session = OfflineSession._(
      state: state,
      difficulty: difficulty,
      myName: myName,
      seed: s ^ 0x5bd1e995,
      saver: saver,
      botDelay: botDelay,
      useIsolate: useIsolate,
    );
    session._save();
    session._scheduleBot();
    return session;
  }

  /// Restores a saved match. Throws [EngineError] / [FormatException] when the
  /// save is corrupt or from an incompatible version.
  factory OfflineSession.restore(
    String json, {
    required Future<void> Function(String? json) saver,
    Duration botDelay = const Duration(milliseconds: 850),
    bool useIsolate = true,
  }) {
    final data = jsonDecode(json);
    if (data is! Map || data['format'] != kSaveFormat) throw const FormatException('Incompatible save');
    final state = parseState(data['state']);
    if (state.phase == Phase.matchOver) throw const FormatException('Finished match');
    if (state.players.first.id != 'me') throw const FormatException('Unknown seat layout');
    final session = OfflineSession._(
      state: state,
      difficulty: difficultyFromName(data['difficulty'] as String?),
      myName: data['name'] as String? ?? '',
      seed: (data['seed'] as int? ?? 1) + state.version,
      saver: saver,
      botDelay: botDelay,
      useIsolate: useIsolate,
    );
    session._scheduleBot();
    return session;
  }

  /// Quick summary of a save for the "resume" card, or null if unusable.
  static ({int round, int score})? peek(String? json) {
    if (json == null) return null;
    try {
      final data = jsonDecode(json);
      if (data is! Map || data['format'] != kSaveFormat) return null;
      final state = parseState(data['state']);
      if (state.phase == Phase.matchOver) return null;
      return (round: state.round, score: state.players.first.score);
    } catch (_) {
      return null;
    }
  }

  static const String kSaveFormat = 'daeef-offline-1';

  final Difficulty difficulty;
  final String myName;
  final Future<void> Function(String? json) saver;
  final Duration botDelay;
  final bool useIsolate;
  final int _seed;
  final RandomSource _random;

  GameState _state;
  TableSnapshot? _snapshot;
  String? _error;
  Timer? _botTimer;
  bool _botThinking = false;
  bool _disposed = false;

  GameState get state => _state;

  @override
  TableSnapshot? get snapshot => _snapshot;

  @override
  bool get isOnline => false;

  @override
  ConnectionStatus get connection => ConnectionStatus.connected;

  @override
  bool get busy => _botThinking;

  @override
  bool get autoNextRound => false;

  @override
  String? takeError() {
    final e = _error;
    _error = null;
    return e;
  }

  List<SeatInfo> _seats(GameState s) {
    return [
      for (final p in s.players)
        SeatInfo(
          id: p.id,
          name: p.id == 'me' ? myName : p.id,
          isBot: p.id != 'me',
          isMe: p.id == 'me',
          connected: true,
          autopilot: false,
          score: p.score,
          tileCount: p.hand.length,
          difficulty: p.id == 'me' ? null : difficulty.name,
        ),
    ];
  }

  void _rebuild() {
    _snapshot = TableSnapshot.fromState(_state, myId: 'me', seats: _seats);
  }

  void _commit(GameState next) {
    _state = next;
    _rebuild();
    _save();
    if (!_disposed) notifyListeners();
    _scheduleBot();
  }

  void _save() {
    if (_state.phase == Phase.matchOver) {
      unawaited(saver(null));
      return;
    }
    unawaited(saver(jsonEncode({
      'format': kSaveFormat,
      'seed': _seed,
      'difficulty': difficulty.name,
      'name': myName,
      'state': _state.toJson(),
    })));
  }

  Future<void> _human(GameAction action) async {
    if (_state.currentPlayer.id != 'me') {
      _error = 'NOT_YOUR_TURN';
      notifyListeners();
      return;
    }
    try {
      _commit(applyAction(_state, action));
    } on EngineError catch (e) {
      _error = e.code;
      notifyListeners();
    }
  }

  @override
  Future<void> play(String tileId, BoardEnd end) => _human(GameAction.play('me', tileId, end));

  @override
  Future<void> draw() => _human(const GameAction.draw('me'));

  @override
  Future<void> pass() => _human(const GameAction.pass('me'));

  @override
  Future<void> nextRound() async {
    if (_state.phase != Phase.roundOver) return;
    try {
      _commit(startNextRound(_state, _random));
    } on EngineError catch (e) {
      _error = e.code;
      notifyListeners();
    }
  }

  @override
  Future<void> leave() async {
    _botTimer?.cancel();
    _save();
  }

  void _scheduleBot() {
    _botTimer?.cancel();
    if (_disposed || _state.phase != Phase.playing || _state.currentPlayer.id == 'me') return;
    _botTimer = Timer(botDelay, _runBot);
  }

  Future<void> _runBot() async {
    if (_disposed || _state.phase != Phase.playing || _state.currentPlayer.id == 'me') return;
    _botThinking = true;
    final before = _state;
    final seed = (_random() * 0x7fffffff).floor();
    final level = difficulty;
    final seat = before.current;
    try {
      GameState next;
      if (useIsolate && level == Difficulty.expert) {
        next = GameState.fromJson(await _expertInBackground(before.toJson(), seat, seed));
        assertInvariants(next);
      } else {
        next = decideBotAction(before, seat, level, random: mulberry32(seed)).next;
      }
      _botThinking = false;
      if (_disposed || !identical(before, _state)) return;
      _commit(next);
    } catch (_) {
      // Never corrupt the match: fall back to the simplest legal action.
      _botThinking = false;
      if (_disposed || !identical(before, _state)) return;
      final p = before.currentPlayer.id;
      final moves = legalMoves(before);
      final GameAction safe = moves.isNotEmpty
          ? GameAction.play(p, moves.first.tile.id, moves.first.end)
          : (before.stock.isNotEmpty ? GameAction.draw(p) : GameAction.pass(p));
      _commit(applyAction(before, safe));
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _botTimer?.cancel();
    super.dispose();
  }
}

/// Runs the expert bot on a background isolate so the UI stays smooth.
/// Top-level so the closure only captures plain, sendable data.
Future<Map<String, dynamic>> _expertInBackground(Map<String, dynamic> json, int seat, int seed) {
  return Isolate.run(() {
    final state = GameState.fromJson(json);
    return decideBotAction(state, seat, Difficulty.expert, random: mulberry32(seed)).next.toJson();
  });
}
