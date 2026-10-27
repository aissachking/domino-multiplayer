import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../state/table_session.dart';
import 'protocol.dart';

/// Minimal real-time transport so the online controller can be tested with a fake.
abstract class RealtimeTransport {
  ConnectionStatus get status;
  Stream<ConnectionStatus> get statusChanges;
  void on(String event, void Function(Map<String, dynamic> payload) handler);
  Future<AckResult> request(String event, [Map<String, dynamic> payload = const {}]);
  void connect();
  void dispose();
}

/// Socket.IO implementation with automatic reconnection.
class SocketIoTransport implements RealtimeTransport {
  SocketIoTransport({required String url, required String playerId, required String token, this.timeout = const Duration(seconds: 8)})
      : _socket = io.io(url, <String, dynamic>{
          'transports': ['websocket'],
          'autoConnect': false,
          'forceNew': true,
          'reconnection': true,
          'reconnectionDelay': 1000,
          'reconnectionDelayMax': 5000,
          'timeout': 10000,
          'auth': {'playerId': playerId, 'token': token},
        }) {
    _socket.on('connect', (_) => _set(ConnectionStatus.connected));
    _socket.on('disconnect', (reason) {
      _set(reason == 'io client disconnect' ? ConnectionStatus.offline : ConnectionStatus.reconnecting);
    });
    _socket.on('connect_error', (_) {
      _set(_everConnected ? ConnectionStatus.reconnecting : ConnectionStatus.offline);
    });
  }

  final io.Socket _socket;
  final Duration timeout;
  final _statusController = StreamController<ConnectionStatus>.broadcast();
  ConnectionStatus _status = ConnectionStatus.connecting;
  bool _everConnected = false;

  void _set(ConnectionStatus status) {
    if (status == ConnectionStatus.connected) _everConnected = true;
    if (_status == status) return;
    _status = status;
    _statusController.add(status);
  }

  @override
  ConnectionStatus get status => _status;

  @override
  Stream<ConnectionStatus> get statusChanges => _statusController.stream;

  @override
  void on(String event, void Function(Map<String, dynamic> payload) handler) {
    _socket.on(event, (data) {
      final value = data is List && data.isNotEmpty ? data.first : data;
      if (value is Map) handler(Map<String, dynamic>.from(value));
    });
  }

  @override
  Future<AckResult> request(String event, [Map<String, dynamic> payload = const {}]) {
    if (!_socket.connected) return Future.value(const AckResult.fail('NOT_CONNECTED'));
    final completer = Completer<AckResult>();
    _socket.emitWithAck(event, payload, ack: (Object? response) {
      if (!completer.isCompleted) completer.complete(AckResult.parse(response));
    });
    return completer.future.timeout(timeout, onTimeout: () => const AckResult.fail('TIMEOUT'));
  }

  @override
  void connect() {
    _set(_everConnected ? ConnectionStatus.reconnecting : ConnectionStatus.connecting);
    _socket.connect();
  }

  @override
  void dispose() {
    _socket.dispose();
    _statusController.close();
  }
}
