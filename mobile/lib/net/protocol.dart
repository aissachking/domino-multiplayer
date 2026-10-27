/// Socket.IO event names — keep in sync with shared/src/index.ts (C2S / S2C).
library;

abstract final class C2S {
  static const roomCreate = 'room:create';
  static const roomJoin = 'room:join';
  static const roomLeave = 'room:leave';
  static const roomReady = 'room:ready';
  static const roomSettings = 'room:settings';
  static const roomAddBot = 'room:add-bot';
  static const roomRemoveBot = 'room:remove-bot';
  static const gameStart = 'game:start';
  static const gamePlay = 'game:play';
  static const gameDraw = 'game:draw';
  static const gamePass = 'game:pass';
  static const gameNextRound = 'game:next-round';
  static const gameSync = 'game:sync';
}

abstract final class S2C {
  static const roomUpdate = 'room:update';
  static const gameState = 'game:state';
  static const roundEnd = 'game:roundEnd';
  static const matchEnd = 'game:matchEnd';
  static const playerDisconnect = 'player:disconnect';
  static const playerReconnect = 'player:reconnect';
  static const roomClosed = 'room:closed';
  static const error = 'game:error';
}

/// Result of an acknowledged request.
class AckResult {
  const AckResult.ok(this.data) : errorCode = null;
  const AckResult.fail(this.errorCode) : data = null;

  factory AckResult.parse(Object? raw) {
    // socket.io may wrap the ack payload in a list
    final value = raw is List && raw.isNotEmpty ? raw.first : raw;
    if (value is Map) {
      if (value['ok'] == true) return AckResult.ok(value['data']);
      final error = value['error'];
      if (error is Map && error['code'] is String) return AckResult.fail(error['code'] as String);
    }
    return const AckResult.fail('INTERNAL');
  }

  final Object? data;
  final String? errorCode;
  bool get ok => errorCode == null;
}

final RegExp roomCodePattern = RegExp(r'^[A-HJ-NP-Z2-9]{5}$');

String normalizeRoomCode(String input) => input.trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
