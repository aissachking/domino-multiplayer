import http from 'node:http';
import { type AddressInfo } from 'node:net';
import cors from 'cors';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import {
  type Ack,
  C2S,
  PLAYER_ID_RE,
  S2C,
  asObject,
  boolField,
  difficulty,
  displayName,
  end,
  roomCode,
  tileIdField,
  version,
} from '@daeef/shared';
import type { AppConfig } from './config.js';
import { AppError, toServerError } from './errors.js';
import { RateLimiter, SessionRegistry } from './identity.js';
import { type MatchRepository, MemoryMatchRepository } from './repository.js';
import { type ActionResult, type Room, RoomManager } from './rooms.js';

export interface GameServerOptions {
  config: AppConfig;
  repository?: MatchRepository;
  rooms?: RoomManager;
  sweepIntervalMs?: number;
  log?: (message: string, extra?: unknown) => void;
}

export interface RunningServer {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

type Handler = (payload: Record<string, unknown>, playerId: string, socket: Socket) => unknown;

export async function startServer(options: GameServerOptions): Promise<RunningServer> {
  const { config } = options;
  const log = options.log ?? ((message: string, extra?: unknown) => console.log(`[domino] ${message}`, extra ?? ''));
  const repository = options.repository ?? new MemoryMatchRepository();
  const rooms = options.rooms ?? new RoomManager({ timing: { abandonMs: config.abandonMs } });
  const sessions = new SessionRegistry();
  const limiter = new RateLimiter();
  const botTimers = new Map<string, NodeJS.Timeout>();
  const roundTimers = new Map<string, NodeJS.Timeout>();

  // ------------------------------------------------------------ HTTP
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins }));
  app.get('/health', async (_req, res) => {
    const db = await repository.healthy().catch(() => false);
    res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()), rooms: rooms.rooms.size, storage: repository.kind, db: db ? 'ok' : 'unavailable' });
  });
  app.get('/api/players/:id/stats', async (req, res) => {
    if (!PLAYER_ID_RE.test(req.params.id)) return void res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      res.json(await repository.statsFor(req.params.id));
    } catch {
      res.status(503).json({ error: 'STORAGE_UNAVAILABLE' });
    }
  });
  app.get('/api/players/:id/matches', async (req, res) => {
    if (!PLAYER_ID_RE.test(req.params.id)) return void res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      res.json(await repository.recentMatches(req.params.id, 20));
    } catch {
      res.status(503).json({ error: 'STORAGE_UNAVAILABLE' });
    }
  });
  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigins },
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 16_000,
  });

  // ------------------------------------------------------------ broadcasting
  const playerChannel = (id: string) => `player:${id}`;

  function broadcast(room: Room): void {
    if (room.closed) return;
    io.to(room.code).emit(S2C.roomUpdate, rooms.summary(room));
    if (!room.game) return;
    for (const p of room.players) {
      if (p.kind !== 'human') continue;
      const view = rooms.viewFor(room, p.id);
      if (view) io.to(playerChannel(p.id)).emit(S2C.gameState, view);
    }
  }

  function afterAction(result: ActionResult): void {
    const { room } = result;
    broadcast(room);
    if (result.roundEnded && room.game?.lastRound) io.to(room.code).emit(S2C.roundEnd, { code: room.code, version: room.game.version, result: room.game.lastRound });
    if (result.matchEnded) {
      io.to(room.code).emit(S2C.matchEnd, { code: room.code, winnerId: room.game?.winnerId, players: rooms.summary(room).players });
      void persist(room);
    }
    schedule(room);
  }

  async function persist(room: Room): Promise<void> {
    const game = room.game;
    if (!game || !room.gameId || !game.winnerId) return;
    try {
      await repository.saveMatch({
        id: room.gameId,
        roomCode: room.code,
        targetScore: game.targetScore,
        rounds: game.round,
        winnerId: game.winnerId,
        startedAt: new Date(room.startedAt ?? Date.now()),
        endedAt: new Date(),
        participants: room.players.map((p, seat) => ({
          seat,
          playerId: p.id,
          name: p.name,
          kind: p.kind,
          difficulty: p.difficulty,
          score: game.players.find((g) => g.id === p.id)?.score ?? 0,
          won: p.id === game.winnerId,
        })),
      });
    } catch (error) {
      log('failed to persist match (game continues normally)', (error as Error).message);
    }
  }

  /** Schedules bot turns (with a natural delay) and automatic next rounds. */
  function schedule(room: Room): void {
    if (room.closed) return;
    clearTimeout(botTimers.get(room.code));
    botTimers.delete(room.code);
    if (room.phase === 'playing' && rooms.botToMove(room)) {
      const delay = config.botDelayMs ? config.botDelayMs * (0.7 + Math.random() * 0.6) : 0;
      botTimers.set(
        room.code,
        setTimeout(() => {
          botTimers.delete(room.code);
          try {
            const result = rooms.botTurn(room.code, log);
            if (result) afterAction(result);
          } catch (error) {
            log('bot turn failed', toServerError(error));
          }
        }, delay),
      );
    }
    if (room.phase === 'round-over' && !roundTimers.has(room.code)) {
      roundTimers.set(
        room.code,
        setTimeout(() => {
          roundTimers.delete(room.code);
          try {
            if (rooms.rooms.get(room.code)?.phase === 'round-over') afterAction(rooms.nextRound(room.code, null));
          } catch (error) {
            log('auto next round failed', toServerError(error));
          }
        }, config.roundBreakMs),
      );
    }
    if (room.phase !== 'round-over') {
      clearTimeout(roundTimers.get(room.code));
      roundTimers.delete(room.code);
    }
  }

  function clearRoomTimers(code: string): void {
    clearTimeout(botTimers.get(code));
    clearTimeout(roundTimers.get(code));
    botTimers.delete(code);
    roundTimers.delete(code);
  }

  // ------------------------------------------------------------ sockets
  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const playerId = sessions.authenticate(auth.playerId, auth.token);
    if (!playerId) return next(new Error('UNAUTHORIZED'));
    socket.data.playerId = playerId;
    next();
  });

  io.on('connection', (socket) => {
    const playerId = socket.data.playerId as string;
    void socket.join(playerChannel(playerId));

    // Reconnection: restore the seat, private hand and public state.
    const existing = rooms.reconnect(playerId);
    if (existing) {
      void socket.join(existing.code);
      io.to(existing.code).emit(S2C.playerReconnect, { code: existing.code, playerId });
      broadcast(existing);
      schedule(existing);
    }

    const on = (event: string, handler: Handler) => {
      socket.on(event, (payload: unknown, ack?: (response: Ack) => void) => {
        const reply = typeof ack === 'function' ? ack : (response: Ack) => !response.ok && socket.emit(S2C.error, response.error);
        if (!limiter.take(socket.id)) return reply({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
        try {
          const data = handler(asObject(payload), playerId, socket);
          reply({ ok: true, data });
        } catch (error) {
          const safe = toServerError(error);
          if (safe.code === 'INTERNAL') log(`internal error on ${event}`, error instanceof Error ? error.message : error);
          reply({ ok: false, error: safe });
        }
      });
    };

    const joinChannel = (room: Room) => {
      for (const s of io.sockets.sockets.values()) if (s.data.playerId === playerId) void s.join(room.code);
    };
    const leaveChannel = (code: string) => {
      for (const s of io.sockets.sockets.values()) if (s.data.playerId === playerId) void s.leave(code);
    };
    const leavePrevious = () => {
      const previous = rooms.roomOf(playerId);
      if (!previous) return;
      leaveChannel(previous.code);
      const still = rooms.leave(previous.code, playerId);
      if (still) {
        broadcast(still);
        schedule(still);
      } else clearRoomTimers(previous.code);
    };

    on(C2S.roomCreate, (p) => {
      leavePrevious();
      const room = rooms.create(playerId, displayName(p.name), p.targetScore === undefined ? 100 : Number(p.targetScore));
      joinChannel(room);
      broadcast(room);
      return rooms.summary(room);
    });

    on(C2S.roomJoin, (p) => {
      const code = roomCode(p.code);
      const current = rooms.roomOf(playerId);
      if (current && current.code !== code) leavePrevious();
      const room = rooms.join(code, playerId, displayName(p.name));
      joinChannel(room);
      broadcast(room);
      schedule(room);
      return rooms.summary(room);
    });

    on(C2S.roomLeave, (p) => {
      const code = roomCode(p.code);
      leaveChannel(code);
      const room = rooms.leave(code, playerId);
      if (room) {
        broadcast(room);
        schedule(room);
      } else {
        clearRoomTimers(code);
        io.to(code).emit(S2C.roomClosed, { code });
      }
      return null;
    });

    on(C2S.roomReady, (p) => {
      const room = rooms.setReady(roomCode(p.code), playerId, boolField(p.ready));
      broadcast(room);
      return null;
    });

    on(C2S.roomSettings, (p) => {
      const room = rooms.setTargetScore(roomCode(p.code), playerId, Number(p.targetScore));
      broadcast(room);
      return null;
    });

    on(C2S.roomAddBot, (p) => {
      const room = rooms.addBot(roomCode(p.code), playerId, difficulty(p.difficulty));
      broadcast(room);
      return null;
    });

    on(C2S.roomRemoveBot, (p) => {
      if (typeof p.playerId !== 'string') throw new AppError('BAD_REQUEST', 'Missing bot id');
      const room = rooms.removeBot(roomCode(p.code), playerId, p.playerId);
      broadcast(room);
      return null;
    });

    on(C2S.gameStart, (p) => {
      const room = rooms.start(roomCode(p.code), playerId);
      broadcast(room);
      schedule(room);
      return null;
    });

    on(C2S.gamePlay, (p) => {
      const result = rooms.act(roomCode(p.code), playerId, { type: 'play', tileId: tileIdField(p.tileId), end: end(p.end) }, version(p.version));
      afterAction(result);
      return { version: result.room.game?.version };
    });

    on(C2S.gameDraw, (p) => {
      const result = rooms.act(roomCode(p.code), playerId, { type: 'draw' }, version(p.version));
      afterAction(result);
      return { version: result.room.game?.version };
    });

    on(C2S.gamePass, (p) => {
      const result = rooms.act(roomCode(p.code), playerId, { type: 'pass' }, version(p.version));
      afterAction(result);
      return { version: result.room.game?.version };
    });

    on(C2S.gameNextRound, (p) => {
      const result = rooms.nextRound(roomCode(p.code), playerId, version(p.version));
      afterAction(result);
      return null;
    });

    on(C2S.gameSync, () => {
      const room = rooms.roomOf(playerId);
      if (!room) return null;
      joinChannel(room);
      return { room: rooms.summary(room), game: rooms.viewFor(room, playerId) ?? null };
    });

    socket.on('disconnect', () => {
      limiter.forget(socket.id);
      // another device of the same player may still be connected
      const stillOnline = [...io.sockets.sockets.values()].some((s) => s.id !== socket.id && s.data.playerId === playerId);
      if (stillOnline) return;
      const room = rooms.disconnect(playerId);
      if (room) {
        io.to(room.code).emit(S2C.playerDisconnect, { code: room.code, playerId });
        broadcast(room);
      }
    });
  });

  // ------------------------------------------------------------ housekeeping
  const sweeper = setInterval(() => {
    for (const event of rooms.sweep()) {
      if (event.type === 'closed') {
        clearRoomTimers(event.room.code);
        io.to(event.room.code).emit(S2C.roomClosed, { code: event.room.code });
        io.in(event.room.code).socketsLeave(event.room.code);
      } else {
        broadcast(event.room);
        schedule(event.room);
      }
    }
    sessions.prune();
  }, options.sweepIntervalMs ?? 5_000);
  sweeper.unref();

  await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));
  const port = (server.address() as AddressInfo).port;
  log(`listening on ${config.host}:${port} (storage: ${repository.kind})`);

  return {
    port,
    rooms,
    async close() {
      clearInterval(sweeper);
      for (const code of [...botTimers.keys(), ...roundTimers.keys()]) clearRoomTimers(code);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await repository.close();
    },
  };
}
