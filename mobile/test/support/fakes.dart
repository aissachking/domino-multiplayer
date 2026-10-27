import 'dart:async';

import 'package:daeef_jiddan/net/protocol.dart';
import 'package:daeef_jiddan/net/transport.dart';
import 'package:daeef_jiddan/state/table_session.dart';

/// In-memory stand-in for the Socket.IO transport.
class FakeTransport implements RealtimeTransport {
  FakeTransport({this.onRequest});

  FutureOr<AckResult> Function(String event, Map<String, dynamic> payload)? onRequest;
  final requests = <(String, Map<String, dynamic>)>[];
  final _handlers = <String, List<void Function(Map<String, dynamic>)>>{};
  final _status = StreamController<ConnectionStatus>.broadcast(sync: true);
  ConnectionStatus _current = ConnectionStatus.connecting;
  bool disposed = false;

  @override
  ConnectionStatus get status => _current;

  @override
  Stream<ConnectionStatus> get statusChanges => _status.stream;

  void setStatus(ConnectionStatus s) {
    _current = s;
    _status.add(s);
  }

  /// Simulates a server → client event.
  void push(String event, Map<String, dynamic> payload) {
    for (final h in _handlers[event] ?? const []) {
      h(payload);
    }
  }

  @override
  void on(String event, void Function(Map<String, dynamic>) handler) => (_handlers[event] ??= []).add(handler);

  @override
  Future<AckResult> request(String event, [Map<String, dynamic> payload = const {}]) async {
    requests.add((event, payload));
    return await (onRequest?.call(event, payload) ?? const AckResult.ok(null));
  }

  @override
  void connect() => setStatus(ConnectionStatus.connected);

  @override
  void dispose() {
    disposed = true;
    _status.close();
  }
}

Map<String, dynamic> roomJson({
  String code = 'ABCDE',
  String hostId = 'me-1234567',
  String phase = 'lobby',
  int target = 100,
  List<Map<String, dynamic>>? players,
}) =>
    {
      'code': code,
      'hostId': hostId,
      'phase': phase,
      'targetScore': target,
      'players': players ??
          [
            {'id': 'me-1234567', 'name': 'Sara', 'kind': 'human', 'seat': 0, 'connected': true, 'ready': true, 'isHost': true, 'autopilot': false, 'score': 0, 'tileCount': 0},
          ],
    };
