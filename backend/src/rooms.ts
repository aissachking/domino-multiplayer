import { randomInt, randomUUID } from 'node:crypto';
import {
  type End,
  type GameState,
  type RandomSource,
  applyAction,
  createMatch,
  isTargetScore,
  startNextRound,
} from '@daeef/game-engine';
import { decideBotAction } from '@daeef/ai';
import type { Difficulty, GameView, PlayerKind, PublicPlayer, RoomPhase, RoomSummary } from '@daeef/shared';
import { AppError } from './errors.js';

export interface RoomPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  difficulty?: Difficulty;
  connected: boolean;
  ready: boolean;
  /** A bot is playing this human seat (player abandoned or left mid-match). */
  autopilot: boolean;
  disconnectedAt?: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  targetScore: number;
  phase: RoomPhase;
  game?: GameState;
  gameId?: string;
  startedAt?: number;
  createdAt: number;
  updatedAt: number;
  closed: boolean;
}

export interface Timing {
  /** A disconnected human is replaced (lobby) or put on autopilot (match) after this long. */
  abandonMs: number;
  /** Rooms without any connected human are closed after this long. */
  emptyRoomMs: number;
  /** Finished matches are closed after this long. */
  finishedRoomMs: number;
}

export const DEFAULT_TIMING: Timing = { abandonMs: 60_000, emptyRoomMs: 120_000, finishedRoomMs: 600_000 };

export interface RoomManagerOptions {
  now?: () => number;
  random?: RandomSource;
  timing?: Partial<Timing>;
  botOptions?: { timeBudgetMs?: number; maxSimulations?: number };
}

export type HumanAction = { type: 'play'; tileId: string; end: End } | { type: 'draw' } | { type: 'pass' };

export interface ActionResult {
  room: Room;
  roundEnded: boolean;
  matchEnded: boolean;
}

export type SweepEvent =
  | { type: 'autopilot'; room: Room; playerId: string }
  | { type: 'removed'; room: Room; playerId: string }
  | { type: 'closed'; room: Room };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const cryptoRandom: RandomSource = () => randomInt(0, 2 ** 48) / 2 ** 48;

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly now: () => number;
  private readonly random: RandomSource;
  readonly timing: Timing;
  private readonly botOptions: { timeBudgetMs?: number; maxSimulations?: number };

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? cryptoRandom;
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
    this.botOptions = options.botOptions ?? {};
  }

  // ---------------------------------------------------------------- lookup

  get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || room.closed) throw new AppError('ROOM_NOT_FOUND');
    return room;
  }

  /** The (single) open room a player belongs to. */
  roomOf(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) if (!room.closed && room.players.some((p) => p.id === playerId)) return room;
    return undefined;
  }

  private member(room: Room, playerId: string): RoomPlayer {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new AppError('NOT_IN_ROOM');
    return player;
  }

  private requireHost(room: Room, playerId: string): void {
    this.member(room, playerId);
    if (room.hostId !== playerId) throw new AppError('NOT_HOST');
  }

  private requireLobby(room: Room): void {
    if (room.phase !== 'lobby') throw new AppError('ALREADY_STARTED');
  }

  private touch(room: Room): void {
    room.updatedAt = this.now();
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  // ---------------------------------------------------------------- lobby

  create(playerId: string, name: string, targetScore = 100): Room {
    if (!isTargetScore(targetScore)) throw new AppError('INVALID_TARGET');
    this.leaveCurrent(playerId);
    const now = this.now();
    const room: Room = {
      code: this.newCode(),
      hostId: playerId,
      players: [{ id: playerId, name, kind: 'human', connected: true, ready: true, autopilot: false }],
      targetScore,
      phase: 'lobby',
      createdAt: now,
      updatedAt: now,
      closed: false,
    };
    this.rooms.set(room.code, room);
    return room;
  }

  /** Joins a room, or reconnects to the seat the player already holds. */
  join(code: string, playerId: string, name: string): Room {
    const room = this.get(code);
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      this.markConnected(room, existing);
      return room;
    }
    this.requireLobby(room);
    if (room.players.length >= 4) throw new AppError('ROOM_FULL');
    this.leaveCurrent(playerId);
    room.players.push({ id: playerId, name, kind: 'human', connected: true, ready: false, autopilot: false });
    this.touch(room);
    return room;
  }

  private leaveCurrent(playerId: string): void {
    const current = this.roomOf(playerId);
    if (current) this.leave(current.code, playerId);
  }

  /**
   * Leaving the lobby frees the seat; leaving a running match hands the seat
   * to a bot so the other players can finish. Returns the room if still open.
   */
  leave(code: string, playerId: string): Room | undefined {
    const room = this.get(code);
    const player = this.member(room, playerId);
    if (room.phase === 'lobby' || room.phase === 'match-over') {
      room.players = room.players.filter((p) => p.id !== playerId);
    } else {
      player.autopilot = true;
      player.connected = false;
      player.disconnectedAt = this.now();
    }
    this.afterHumanGone(room);
    this.touch(room);
    return room.closed ? undefined : room;
  }

  private afterHumanGone(room: Room): void {
    const humans = room.players.filter((p) => p.kind === 'human' && !p.autopilot);
    if (!humans.length) {
      this.close(room);
      return;
    }
    if (!humans.some((p) => p.id === room.hostId)) {
      const next = humans.find((p) => p.connected) ?? humans[0];
      room.hostId = next.id;
      next.ready = true;
    }
  }

  close(room: Room): void {
    room.closed = true;
    this.rooms.delete(room.code);
  }

  setReady(code: string, playerId: string, ready: boolean): Room {
    const room = this.get(code);
    this.requireLobby(room);
    this.member(room, playerId).ready = ready;
    this.touch(room);
    return room;
  }

  setTargetScore(code: string, playerId: string, targetScore: number): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    if (!isTargetScore(targetScore)) throw new AppError('INVALID_TARGET');
    room.targetScore = targetScore;
    this.touch(room);
    return room;
  }

  addBot(code: string, playerId: string, difficulty: Difficulty): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    if (room.players.length >= 4) throw new AppError('ROOM_FULL');
    const number = room.players.filter((p) => p.kind === 'bot').length + 1;
    room.players.push({
      id: `bot-${randomUUID().slice(0, 8)}`,
      name: `Bot ${number}`,
      kind: 'bot',
      difficulty,
      connected: true,
      ready: true,
      autopilot: false,
    });
    this.touch(room);
    return room;
  }

  removeBot(code: string, playerId: string, botId: string): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    const bot = room.players.find((p) => p.id === botId);
    if (!bot || bot.kind !== 'bot') throw new AppError('BOT_NOT_FOUND');
    room.players = room.players.filter((p) => p.id !== botId);
    this.touch(room);
    return room;
  }

  start(code: string, playerId: string): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    if (room.players.length < 2) throw new AppError('NOT_ENOUGH_PLAYERS');
    if (room.players.some((p) => p.kind === 'human' && p.id !== room.hostId && (!p.ready || !p.connected)))
      throw new AppError('PLAYERS_NOT_READY');
    room.game = createMatch(
      room.players.map((p) => p.id),
      room.targetScore,
      this.random,
    );
    room.gameId = randomUUID();
    room.startedAt = this.now();
    room.phase = 'playing';
    this.touch(room);
    return room;
  }

  // ---------------------------------------------------------------- gameplay

  private activeGame(room: Room): GameState {
    if (!room.game || room.phase === 'lobby') throw new AppError('GAME_NOT_ACTIVE');
    return room.game;
  }

  private commit(room: Room, next: GameState): ActionResult {
    const before = room.phase;
    room.game = next;
    room.phase = next.phase;
    this.touch(room);
    return {
      room,
      roundEnded: before === 'playing' && next.phase !== 'playing',
      matchEnded: before !== 'match-over' && next.phase === 'match-over',
    };
  }

  /** Applies a human action after membership, staleness and rule validation. */
  act(code: string, playerId: string, action: HumanAction, expectedVersion: number): ActionResult {
    const room = this.get(code);
    const player = this.member(room, playerId);
    const game = this.activeGame(room);
    if (expectedVersion !== game.version) throw new AppError('STALE_STATE');
    if (player.autopilot) {
      // an explicit action means the human is back in control
      player.autopilot = false;
    }
    const next = applyAction(game, { ...action, playerId });
    return this.commit(room, next);
  }

  nextRound(code: string, playerId: string | null, expectedVersion?: number): ActionResult {
    const room = this.get(code);
    if (playerId !== null) this.member(room, playerId);
    const game = this.activeGame(room);
    if (expectedVersion !== undefined && expectedVersion !== game.version) throw new AppError('STALE_STATE');
    return this.commit(room, startNextRound(game, this.random));
  }

  /** Whether the seat to move is controlled by a bot (real bot or autopilot). */
  botToMove(room: Room): RoomPlayer | undefined {
    if (room.phase !== 'playing' || !room.game) return undefined;
    const id = room.game.players[room.game.current].id;
    const player = room.players.find((p) => p.id === id);
    return player && (player.kind === 'bot' || player.autopilot) ? player : undefined;
  }

  /** Plays one bot turn. Invalid bot decisions fall back to a safe legal move. */
  botTurn(code: string, log: (message: string, extra?: unknown) => void = () => {}): ActionResult | undefined {
    const room = this.get(code);
    const bot = this.botToMove(room);
    if (!bot || !room.game) return undefined;
    const decision = decideBotAction(room.game, room.game.current, bot.difficulty ?? 'normal', {
      random: this.random,
      ...this.botOptions,
    });
    if (decision.fallback) log('bot decision rejected, used fallback', { room: room.code, bot: bot.id, error: String(decision.error) });
    return this.commit(room, decision.next);
  }

  // ---------------------------------------------------------------- connections

  private markConnected(room: Room, player: RoomPlayer): void {
    player.connected = true;
    player.disconnectedAt = undefined;
    // returning to a match restores control of the seat
    player.autopilot = false;
    this.touch(room);
  }

  /** Marks the player disconnected everywhere; the seat is kept. */
  disconnect(playerId: string): Room | undefined {
    const room = this.roomOf(playerId);
    if (!room) return undefined;
    const player = this.member(room, playerId);
    player.connected = false;
    player.disconnectedAt = this.now();
    this.touch(room);
    return room;
  }

  reconnect(playerId: string): Room | undefined {
    const room = this.roomOf(playerId);
    if (!room) return undefined;
    this.markConnected(room, this.member(room, playerId));
    return room;
  }

  /** Applies abandon / cleanup policies. Call periodically. */
  sweep(): SweepEvent[] {
    const now = this.now();
    const events: SweepEvent[] = [];
    for (const room of [...this.rooms.values()]) {
      if (room.phase === 'match-over' && now - room.updatedAt > this.timing.finishedRoomMs) {
        this.close(room);
        events.push({ type: 'closed', room });
        continue;
      }
      for (const p of [...room.players]) {
        if (p.kind !== 'human' || p.connected || p.disconnectedAt === undefined) continue;
        if (now - p.disconnectedAt < this.timing.abandonMs) continue;
        if (room.phase === 'lobby') {
          room.players = room.players.filter((x) => x.id !== p.id);
          events.push({ type: 'removed', room, playerId: p.id });
          this.afterHumanGone(room);
        } else if (!p.autopilot && room.phase !== 'match-over') {
          p.autopilot = true;
          events.push({ type: 'autopilot', room, playerId: p.id });
        }
      }
      if (room.closed) {
        events.push({ type: 'closed', room });
        continue;
      }
      const anyConnected = room.players.some((p) => p.kind === 'human' && p.connected);
      if (!anyConnected && now - room.updatedAt > this.timing.emptyRoomMs) {
        this.close(room);
        events.push({ type: 'closed', room });
      }
    }
    return events;
  }

  // ---------------------------------------------------------------- views

  private publicPlayers(room: Room): PublicPlayer[] {
    return room.players.map((p, seat) => {
      const engine = room.game?.players.find((g) => g.id === p.id);
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        ...(p.kind === 'bot' ? { difficulty: p.difficulty } : {}),
        seat,
        connected: p.connected,
        ready: p.ready,
        isHost: p.id === room.hostId,
        autopilot: p.autopilot,
        score: engine?.score ?? 0,
        tileCount: engine?.hand.length ?? 0,
      };
    });
  }

  summary(room: Room): RoomSummary {
    return { code: room.code, hostId: room.hostId, phase: room.phase, targetScore: room.targetScore, players: this.publicPlayers(room) };
  }

  /** Sanitized view for one player: contains only that player's own hand. */
  viewFor(room: Room, playerId: string): GameView | undefined {
    const game = room.game;
    if (!game || !room.gameId) return undefined;
    const me = game.players.find((p) => p.id === playerId);
    return {
      code: room.code,
      gameId: room.gameId,
      version: game.version,
      round: game.round,
      phase: game.phase,
      targetScore: game.targetScore,
      board: game.board.map((t) => ({ ...t })),
      stockCount: game.stock.length,
      currentPlayerId: game.players[game.current].id,
      openingTileId: game.openingTileId,
      players: this.publicPlayers(room),
      you: playerId,
      hand: me ? me.hand.map((t) => ({ ...t })) : [],
      lastRound: game.lastRound,
      winnerId: game.winnerId,
      lastAction: game.lastAction,
    };
  }
}
