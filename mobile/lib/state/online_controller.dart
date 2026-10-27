import 'dart:async';

import '../ai/bot.dart';
import '../engine/models.dart';
import '../net/protocol.dart';
import '../net/transport.dart';
import 'table_session.dart';

class LobbyPlayer {
  const LobbyPlayer({
    required this.id,
    required this.name,
    required this.isBot,
    required this.ready,
    required this.isHost,
    required this.connected,
    required this.autopilot,
    this.difficulty,
  });

  factory LobbyPlayer.fromJson(Map<String, dynamic> json) => LobbyPlayer(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        isBot: json['kind'] == 'bot',
        ready: json['ready'] as bool? ?? false,
        isHost: json['isHost'] as bool? ?? false,
        connected: json['connected'] as bool? ?? true,
        autopilot: json['autopilot'] as bool? ?? false,
        difficulty: json['difficulty'] as String?,
      );

  final String id;
  final String name;
  final bool isBot;
  final bool ready;
  final bool isHost;
  final bool connected;
  final bool autopilot;
  final String? difficulty;
}

class RoomInfo {
  const RoomInfo({required this.code, required this.hostId, required this.phase, required this.targetScore, required this.players});

  factory RoomInfo.fromJson(Map<String, dynamic> json) => RoomInfo(
        code: json['code'] as String,
        hostId: json['hostId'] as String,
        phase: json['phase'] as String,
        targetScore: json['targetScore'] as int,
        players: (json['players'] as List).map((p) => LobbyPlayer.fromJson(Map<String, dynamic>.from(p as Map))).toList(),
      );

  final String code;
  final String hostId;

  /// 'lobby' | 'playing' | 'round-over' | 'match-over'
  final String phase;
  final int targetScore;
  final List<LobbyPlayer> players;

  bool get inLobby => phase == 'lobby';
}

/// Online room + match state. The server is authoritative: this controller
/// only sends intentions and renders the sanitized state it receives.
class OnlineController extends TableSession {
  OnlineController({required this.transport, required this.myId}) {
    transport.on(S2C.roomUpdate, (data) {
      final room = RoomInfo.fromJson(data);
      if (_room != null && room.code != _room!.code) return;
      _room = room;
      _notify();
    });
    transport.on(S2C.gameState, (data) {
      final snap = TableSnapshot.fromView(data);
      if (_room != null && data['code'] != _room!.code) return;
      // ignore out-of-order updates
      if (_snapshot != null && data['gameId'] == _gameId && snap.version < _snapshot!.version) return;
      _gameId = data['gameId'] as String?;
      _snapshot = snap;
      _notify();
    });
    transport.on(S2C.roomClosed, (data) {
      if (_room?.code == data['code']) {
        _closed = true;
        _notify();
      }
    });
    transport.on(S2C.error, (data) {
      final code = data['code'];
      if (code is String) {
        _error = code;
        _notify();
      }
    });
    _statusSub = transport.statusChanges.listen((status) {
      if (status == ConnectionStatus.connected && _room != null) unawaited(resync());
      _notify();
    });
  }

  final RealtimeTransport transport;
  final String myId;
  StreamSubscription<ConnectionStatus>? _statusSub;
  RoomInfo? _room;
  TableSnapshot? _snapshot;
  String? _gameId;
  String? _error;
  bool _busy = false;
  bool _closed = false;
  bool _disposed = false;

  RoomInfo? get room => _room;
  bool get closed => _closed;
  bool get isHost => _room?.hostId == myId;
  LobbyPlayer? get meInRoom => _room?.players.where((p) => p.id == myId).firstOrNull;

  @override
  TableSnapshot? get snapshot => _snapshot;

  @override
  bool get isOnline => true;

  @override
  ConnectionStatus get connection => transport.status;

  @override
  bool get busy => _busy;

  @override
  bool get autoNextRound => true;

  @override
  String? takeError() {
    final e = _error;
    _error = null;
    return e;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void connect() => transport.connect();

  Future<bool> _send(String event, Map<String, dynamic> payload) async {
    _busy = true;
    _notify();
    final result = await transport.request(event, payload);
    _busy = false;
    if (!result.ok) {
      _error = result.errorCode;
      if (result.errorCode == 'STALE_STATE') unawaited(resync());
    }
    _notify();
    return result.ok;
  }

  /// Creates a room; the server answers with the room summary.
  Future<bool> createRoom(String name, int targetScore) async {
    _busy = true;
    _notify();
    final result = await transport.request(C2S.roomCreate, {'name': name, 'targetScore': targetScore});
    _busy = false;
    if (result.ok && result.data is Map) {
      _resetGame();
      _room = RoomInfo.fromJson(Map<String, dynamic>.from(result.data! as Map));
    } else {
      _error = result.errorCode;
    }
    _notify();
    return result.ok;
  }

  Future<bool> joinRoom(String code, String name) async {
    final normalized = normalizeRoomCode(code);
    if (!roomCodePattern.hasMatch(normalized)) {
      _error = 'ROOM_NOT_FOUND';
      _notify();
      return false;
    }
    _busy = true;
    _notify();
    final result = await transport.request(C2S.roomJoin, {'code': normalized, 'name': name});
    _busy = false;
    if (result.ok && result.data is Map) {
      final room = RoomInfo.fromJson(Map<String, dynamic>.from(result.data! as Map));
      if (_room?.code != room.code) _resetGame();
      _room = room;
      if (!room.inLobby) unawaited(resync());
    } else {
      _error = result.errorCode;
    }
    _notify();
    return result.ok;
  }

  void _resetGame() {
    _snapshot = null;
    _gameId = null;
    _closed = false;
  }

  /// Asks the server for the full current state (after reconnecting).
  Future<void> resync() async {
    final result = await transport.request(C2S.gameSync);
    if (!result.ok || result.data is! Map) return;
    final data = Map<String, dynamic>.from(result.data! as Map);
    if (data['room'] is Map) _room = RoomInfo.fromJson(Map<String, dynamic>.from(data['room'] as Map));
    if (data['game'] is Map) {
      final game = Map<String, dynamic>.from(data['game'] as Map);
      _gameId = game['gameId'] as String?;
      _snapshot = TableSnapshot.fromView(game);
    }
    _notify();
  }

  Future<bool> setReady(bool ready) => _send(C2S.roomReady, {'code': _room?.code, 'ready': ready});
  Future<bool> setTargetScore(int target) => _send(C2S.roomSettings, {'code': _room?.code, 'targetScore': target});
  Future<bool> addBot(Difficulty difficulty) => _send(C2S.roomAddBot, {'code': _room?.code, 'difficulty': difficulty.name});
  Future<bool> removeBot(String botId) => _send(C2S.roomRemoveBot, {'code': _room?.code, 'playerId': botId});
  Future<bool> startMatch() => _send(C2S.gameStart, {'code': _room?.code});

  @override
  Future<void> play(String tileId, BoardEnd end) async {
    final s = _snapshot;
    if (s == null || _busy) return;
    await _send(C2S.gamePlay, {'code': _room?.code, 'version': s.version, 'tileId': tileId, 'end': end.name});
  }

  @override
  Future<void> draw() async {
    final s = _snapshot;
    if (s == null || _busy) return;
    await _send(C2S.gameDraw, {'code': _room?.code, 'version': s.version});
  }

  @override
  Future<void> pass() async {
    final s = _snapshot;
    if (s == null || _busy) return;
    await _send(C2S.gamePass, {'code': _room?.code, 'version': s.version});
  }

  @override
  Future<void> nextRound() async {
    final s = _snapshot;
    if (s == null || s.phase != Phase.roundOver) return;
    await _send(C2S.gameNextRound, {'code': _room?.code, 'version': s.version});
  }

  @override
  Future<void> leave() async {
    final code = _room?.code;
    if (code != null) await transport.request(C2S.roomLeave, {'code': code});
    _room = null;
    _resetGame();
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _statusSub?.cancel();
    transport.dispose();
    super.dispose();
  }
}
