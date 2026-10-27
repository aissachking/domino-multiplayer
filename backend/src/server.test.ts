import test from 'node:test';
import assert from 'node:assert/strict';
import type { Ack, GameView, RoomSummary } from '@daeef/shared';
import { loadConfig } from './config.js';
import { startServer } from './server.js';

/*
 * End-to-end Socket.IO tests against a real server on an ephemeral port.
 * socket.io-client is a devDependency; in CI its absence is a hard failure.
 */
type ClientSocket = {
  connected: boolean;
  on(event: string, cb: (...args: any[]) => void): void;
  once(event: string, cb: (...args: any[]) => void): void;
  off(event: string, cb?: (...args: any[]) => void): void;
  timeout(ms: number): { emitWithAck(event: string, payload?: unknown): Promise<Ack<any>> };
  connect(): void;
  disconnect(): void;
};
type IoFactory = (url: string, opts: Record<string, unknown>) => ClientSocket;

let ioFactory: IoFactory | null = null;
try {
  ioFactory = ((await import('socket.io-client')) as unknown as { io: IoFactory }).io;
} catch {
  if (process.env.CI) throw new Error('socket.io-client is required for integration tests in CI');
}

const config = { ...loadConfig({}), port: 0, host: '127.0.0.1', botDelayMs: 0, roundBreakMs: 30, abandonMs: 60_000 };

function client(port: number, playerId: string, token = `${playerId}-token-abcdef`): ClientSocket {
  return ioFactory!(`http://127.0.0.1:${port}`, {
    auth: { playerId, token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

const connected = (s: ClientSocket) =>
  new Promise<void>((resolve, reject) => {
    if (s.connected) return resolve();
    s.once('connect', () => resolve());
    s.once('connect_error', (e: Error) => reject(e));
  });

const call = (s: ClientSocket, event: string, payload?: unknown) => s.timeout(3000).emitWithAck(event, payload);

function waitFor<T>(s: ClientSocket, event: string, pred: (v: T) => boolean = () => true, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const handler = (v: T) => {
      if (!pred(v)) return;
      clearTimeout(timer);
      s.off(event, handler);
      resolve(v);
    };
    s.on(event, handler);
  });
}

test('socket integration', { skip: ioFactory ? false : 'socket.io-client not installed' }, async (t) => {
  const server = await startServer({ config, log: () => {} });
  const sockets: ClientSocket[] = [];
  const open = async (id: string, token?: string) => {
    const s = client(server.port, id, token);
    sockets.push(s);
    await connected(s);
    return s;
  };
  try {
    await t.test('health endpoint responds', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/health`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).status, 'ok');
    });

    await t.test('a stolen player id without the token is refused', async () => {
      const a = await open('alice-0001');
      a.disconnect();
      await assert.rejects(open('alice-0001', 'wrong-token-0000000000'), /UNAUTHORIZED/);
    });

    await t.test('two humans and a bot play with private hands, turn checks and stale rejection', async () => {
      const a = await open('host-00001');
      const b = await open('guest-0001');
      const created = await call(a, 'room:create', { name: 'سارة', targetScore: 50 });
      assert.ok(created.ok);
      const code = (created as { data: RoomSummary }).data.code;
      assert.deepEqual(await call(b, 'room:join', { code: 'XXXXX', name: 'B' }), {
        ok: false,
        error: { code: 'ROOM_NOT_FOUND', message: 'ROOM_NOT_FOUND' },
      });
      assert.ok((await call(b, 'room:join', { code, name: 'Bob' })).ok);
      assert.equal(((await call(a, 'game:start', { code })) as { ok: false; error: { code: string } }).error.code, 'PLAYERS_NOT_READY');
      assert.ok((await call(b, 'room:ready', { code, ready: true })).ok);
      assert.ok((await call(a, 'room:add-bot', { code, difficulty: 'hard' })).ok);
      const aState = waitFor<GameView>(a, 'game:state');
      const bState = waitFor<GameView>(b, 'game:state');
      assert.ok((await call(a, 'game:start', { code })).ok);
      const [va, vb] = await Promise.all([aState, bState]);
      assert.equal(va.hand.length, 5);
      assert.equal(vb.hand.length, 5);
      assert.equal(va.hand.some((t) => vb.hand.some((u) => u.id === t.id)), false);
      assert.equal(JSON.stringify(va).includes('"stock"'), false);

      // wait until a human is to move (a bot may open the round)
      let view: GameView = va;
      for (let i = 0; i < 100 && view.currentPlayerId.startsWith('bot-'); i++) {
        await new Promise((r) => setTimeout(r, 30));
        view = ((await call(a, 'game:sync')) as { data: { game: GameView } }).data.game;
      }
      const mover = view.currentPlayerId === 'host-00001' ? a : b;
      const waiter = mover === a ? b : a;
      const notTurn = await call(waiter, 'game:draw', { code, version: view.version });
      assert.equal((notTurn as { ok: false; error: { code: string } }).error.code, 'NOT_YOUR_TURN');
      const stale = await call(mover, 'game:draw', { code, version: view.version + 5 });
      assert.equal((stale as { ok: false; error: { code: string } }).error.code, 'STALE_STATE');
      const bad = await call(mover, 'game:play', { code, version: view.version, tileId: '9-9', end: 'left' });
      assert.equal((bad as { ok: false; error: { code: string } }).error.code, 'BAD_REQUEST');
    });

    await t.test('reconnecting restores the same seat and private hand', async () => {
      const c = await open('carol-0001');
      const created = (await call(c, 'room:create', { name: 'Carol' })) as { data: RoomSummary };
      const code = created.data.code;
      await call(c, 'room:add-bot', { code, difficulty: 'easy' });
      const first = waitFor<GameView>(c, 'game:state');
      await call(c, 'game:start', { code });
      const before = await first;
      c.disconnect();
      const again = client(server.port, 'carol-0001');
      sockets.push(again);
      const restored = waitFor<GameView>(again, 'game:state', (v) => v.code === code);
      await connected(again);
      const after = await restored;
      assert.equal(after.you, 'carol-0001');
      assert.ok(after.hand.length >= 1);
      if (after.version === before.version) assert.deepEqual(after.hand, before.hand);
      const room = server.rooms.get(code);
      assert.equal(room.players.find((p) => p.id === 'carol-0001')!.connected, true);
    });

    await t.test('the last human leaving closes the room', async () => {
      const d = await open('dave-00001');
      const created = (await call(d, 'room:create', { name: 'Dave', targetScore: 50 })) as { data: RoomSummary };
      const code = created.data.code;
      await call(d, 'room:add-bot', { code, difficulty: 'easy' });
      await call(d, 'game:start', { code });
      assert.ok((await call(d, 'room:leave', { code })).ok);
      assert.equal(server.rooms.rooms.has(code), false);
      const sync = (await call(d, 'game:sync')) as { ok: true; data: unknown };
      assert.equal(sync.data, null);
    });
  } finally {
    for (const s of sockets) s.disconnect();
    await server.close();
  }
});
