# Real-time protocol (Socket.IO)

Source of truth: `shared/src/index.ts` (`C2S`, `S2C`, payload types). The Flutter client mirrors the
names in `mobile/lib/net/protocol.dart`.

## Connection and identity
The app creates a random `playerId` and secret `token` on first launch and stores them on the device.
They are sent in the Socket.IO handshake: `auth: { playerId, token }`.
The server binds the token (SHA-256) to the id on first use; later connections must present the same
token, so knowing another player's public id does not let you take their seat. Invalid handshakes are
refused with `connect_error: UNAUTHORIZED`.

## Requests (client → server)
Every request is acknowledged: `{ ok: true, data? }` or `{ ok: false, error: { code, message } }`.

| Event | Payload | Notes |
|---|---|---|
| `room:create` | `{ name, targetScore }` | returns the room summary; creator is host |
| `room:join` | `{ code, name }` | 5-char code; rejoining reclaims your seat |
| `room:leave` | `{ code }` | lobby: frees the seat; match: a bot plays your seat |
| `room:ready` | `{ code, ready }` | guests must be ready before the host can start |
| `room:settings` | `{ code, targetScore }` | host only, lobby only |
| `room:add-bot` | `{ code, difficulty }` | host only; `easy`/`normal`/`hard`/`expert` |
| `room:remove-bot` | `{ code, playerId }` | host only |
| `game:start` | `{ code }` | host only; 2–4 seats, guests ready |
| `game:play` | `{ code, version, tileId, end }` | `end` is `left` or `right` |
| `game:draw` | `{ code, version }` | |
| `game:pass` | `{ code, version }` | |
| `game:next-round` | `{ code, version }` | the server also starts it automatically after `ROUND_BREAK_MS` |
| `game:sync` | `{}` | returns `{ room, game }` for the caller (after reconnecting) |

`version` must equal the current state version; otherwise the action is rejected with `STALE_STATE`
(this also rejects duplicated submissions).

## Server events (server → client)
| Event | Payload |
|---|---|
| `room:update` | room summary (players, ready flags, host, scores, tile counts) |
| `game:state` | **per-player** sanitized view: board, stock count, public seat info and **only the recipient's hand** |
| `game:roundEnd` | `{ code, version, result }` (hands are revealed at round end) |
| `game:matchEnd` | `{ code, winnerId, players }` |
| `player:disconnect` / `player:reconnect` | `{ code, playerId }` |
| `room:closed` | `{ code }` |
| `game:error` | `{ code, message }` (only for requests sent without an ack) |

## Error codes
Room/transport: `BAD_REQUEST`, `RATE_LIMITED`, `UNAUTHORIZED`, `ROOM_NOT_FOUND`, `ROOM_FULL`,
`ALREADY_STARTED`, `NOT_IN_ROOM`, `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `PLAYERS_NOT_READY`,
`BOT_NOT_FOUND`, `STALE_STATE`, `GAME_NOT_ACTIVE`, `INTERNAL`.
Rules (from the engine): `NOT_YOUR_TURN`, `ROUND_OVER`, `MATCH_OVER`, `ROUND_NOT_OVER`,
`TILE_NOT_IN_HAND`, `MUST_OPEN_WITH_TILE`, `ILLEGAL_MOVE`, `MOVE_AVAILABLE`, `STOCK_EMPTY`,
`MUST_DRAW`, `INVALID_ACTION`, `INVALID_TARGET`. All are translated in the app (AR/FR/EN).

## Disconnections
- A disconnected player keeps their seat. Reconnecting (same id + token) restores the seat, the
  private hand and the public state automatically.
- After `ABANDON_TIMEOUT_MS` (default 60 s) a disconnected player is removed from a lobby, or put on
  **autopilot** during a match (a bot plays the seat). Returning gives control back.
- Rooms without any connected human are closed after 2 minutes; finished matches after 10 minutes.
- The host role passes to another human if the host leaves the lobby.

## Abuse protection
Payloads are validated (types, lengths, codes, tile ids), each socket has a token-bucket rate limit
(20 burst, 10/s), payloads are capped at 16 KB, internal errors are never sent to clients.
