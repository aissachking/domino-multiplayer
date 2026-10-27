import type { End, PlacedTile, RoundResult, Tile } from '@daeef/game-engine';

/*
 * Socket.IO protocol shared by the backend and documented for the Flutter
 * client (mobile/lib/net/protocol.dart mirrors these names). See docs/PROTOCOL.md.
 */

export const PROTOCOL_VERSION = 2;
export type PlayerKind = 'human' | 'bot';
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type RoomPhase = 'lobby' | 'playing' | 'round-over' | 'match-over';

/** Client → server events (every one is acknowledged with an `Ack`). */
export const C2S = {
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomReady: 'room:ready',
  roomSettings: 'room:settings',
  roomAddBot: 'room:add-bot',
  roomRemoveBot: 'room:remove-bot',
  gameStart: 'game:start',
  gamePlay: 'game:play',
  gameDraw: 'game:draw',
  gamePass: 'game:pass',
  gameNextRound: 'game:next-round',
  gameSync: 'game:sync',
} as const;

/** Server → client events. */
export const S2C = {
  roomUpdate: 'room:update',
  gameState: 'game:state',
  roundEnd: 'game:roundEnd',
  matchEnd: 'game:matchEnd',
  playerDisconnect: 'player:disconnect',
  playerReconnect: 'player:reconnect',
  roomClosed: 'room:closed',
  error: 'game:error',
} as const;

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_STARTED'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'BOT_NOT_FOUND'
  | 'STALE_STATE'
  | 'GAME_NOT_ACTIVE'
  | 'INTERNAL'
  // engine codes are forwarded unchanged
  | 'NOT_YOUR_TURN'
  | 'ROUND_OVER'
  | 'MATCH_OVER'
  | 'ROUND_NOT_OVER'
  | 'TILE_NOT_IN_HAND'
  | 'MUST_OPEN_WITH_TILE'
  | 'ILLEGAL_MOVE'
  | 'MOVE_AVAILABLE'
  | 'STOCK_EMPTY'
  | 'MUST_DRAW'
  | 'INVALID_ACTION'
  | 'INVALID_TARGET'
  | 'INVALID_PLAYERS'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_STATE';

export interface ServerError {
  code: ErrorCode;
  message: string;
}

export type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: ServerError };

export interface PublicPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  difficulty?: Difficulty;
  seat: number;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  /** A bot is temporarily playing this human seat. */
  autopilot: boolean;
  score: number;
  tileCount: number;
}

export interface RoomSummary {
  code: string;
  hostId: string;
  phase: RoomPhase;
  targetScore: number;
  players: PublicPlayer[];
}

/** Per-player sanitized game view: only the recipient's own hand is included. */
export interface GameView {
  code: string;
  gameId: string;
  version: number;
  round: number;
  phase: 'playing' | 'round-over' | 'match-over';
  targetScore: number;
  board: PlacedTile[];
  stockCount: number;
  currentPlayerId: string;
  openingTileId: string | null;
  players: PublicPlayer[];
  you: string;
  hand: Tile[];
  lastRound: RoundResult | null;
  winnerId: string | null;
  lastAction: { type: string; playerId: string; tileId?: string; end?: End } | null;
}

// ------------------------------------------------------------ validation
// Tiny dependency-free validators for untrusted payloads.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

type Obj = Record<string, unknown>;
export function asObject(value: unknown): Obj {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Payload must be an object');
  return value as Obj;
}

export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
export const PLAYER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function roomCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!ROOM_CODE_RE.test(code)) throw new ValidationError('Invalid room code');
  return code;
}

export function displayName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim() : '';
  return (name || 'Player').slice(0, 20);
}

export function difficulty(value: unknown): Difficulty {
  if (typeof value !== 'string' || !(DIFFICULTIES as readonly string[]).includes(value))
    throw new ValidationError('Invalid difficulty');
  return value as Difficulty;
}

export function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new ValidationError('Missing state version');
  return value;
}

export function end(value: unknown): End {
  if (value !== 'left' && value !== 'right') throw new ValidationError('Invalid end');
  return value;
}

export function tileIdField(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-6]-[0-6]$/.test(value)) throw new ValidationError('Invalid tile');
  return value;
}

export function boolField(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ValidationError('Expected boolean');
  return value;
}
