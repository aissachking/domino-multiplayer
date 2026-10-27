import test from 'node:test';
import assert from 'node:assert/strict';
import { legalMoves, mulberry32 } from '@daeef/game-engine';
import { AppError } from './errors.js';
import { RateLimiter, SessionRegistry } from './identity.js';
import { MemoryMatchRepository } from './repository.js';
import { RoomManager, cryptoRandom } from './rooms.js';

const code = (fn: () => unknown, expected: string) =>
  assert.throws(fn, (e: unknown) => (e instanceof AppError || (e as { code?: string })?.code !== undefined) && (e as { code: string }).code === expected);

function manager(clock = { t: 0 }) {
  return new RoomManager({ now: () => clock.t, random: mulberry32(7), botOptions: { maxSimulations: 30 } });
}

/** Plays the current human turn with the first legal move (or draw/pass). */
function humanTurn(rooms: RoomManager, roomCode: string) {
  const room = rooms.get(roomCode);
  const g = room.game!;
  const id = g.players[g.current].id;
  const move = legalMoves(g)[0];
  if (move) return rooms.act(roomCode, id, { type: 'play', ...move }, g.version);
  return rooms.act(roomCode, id, { type: g.stock.length ? 'draw' : 'pass' }, g.version);
}

test('the default (cryptographic) random source works for codes and deals', () => {
  for (let i = 0; i < 1000; i++) {
    const r = cryptoRandom();
    assert.ok(r >= 0 && r < 1);
  }
  const rooms = new RoomManager();
  const room = rooms.create('crypto-001', 'C');
  rooms.addBot(room.code, 'crypto-001', 'easy');
  rooms.start(room.code, 'crypto-001');
  assert.equal(room.game!.players.length, 2);
});

test('creates rooms with unambiguous codes and rejects unknown codes', () => {
  const rooms = manager();
  const room = rooms.create('host-0001', 'Host', 100);
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{5}$/);
  code(() => rooms.join('ZZZZZ', 'p-0000002', 'X'), 'ROOM_NOT_FOUND');
  code(() => rooms.create('host-0002', 'H', 77), 'INVALID_TARGET');
});

test('supports every human/bot combination from 2 to 4 seats', () => {
  for (const humans of [1, 2, 3, 4]) {
    for (let bots = 0; humans + bots <= 4; bots++) {
      if (humans + bots < 2) continue;
      const rooms = manager();
      const room = rooms.create('human-01', 'H1', 50);
      for (let i = 2; i <= humans; i++) {
        rooms.join(room.code, `human-0${i}`, `H${i}`);
        rooms.setReady(room.code, `human-0${i}`, true);
      }
      for (let b = 0; b < bots; b++) rooms.addBot(room.code, 'human-01', (['easy', 'normal', 'hard', 'expert'] as const)[b % 4]);
      rooms.start(room.code, 'human-01');
      assert.equal(room.game!.players.length, humans + bots);
      assert.equal(room.phase, 'playing');
    }
  }
});

test('enforces capacity, host rights, readiness and minimum players', () => {
  const rooms = manager();
  const room = rooms.create('host-0001', 'Host');
  code(() => rooms.start(room.code, 'host-0001'), 'NOT_ENOUGH_PLAYERS');
  rooms.join(room.code, 'guest-001', 'G1');
  code(() => rooms.start(room.code, 'guest-001'), 'NOT_HOST');
  code(() => rooms.start(room.code, 'host-0001'), 'PLAYERS_NOT_READY');
  code(() => rooms.addBot(room.code, 'guest-001', 'easy'), 'NOT_HOST');
  code(() => rooms.setTargetScore(room.code, 'guest-001', 150), 'NOT_HOST');
  rooms.setTargetScore(room.code, 'host-0001', 150);
  assert.equal(room.targetScore, 150);
  rooms.addBot(room.code, 'host-0001', 'hard');
  rooms.addBot(room.code, 'host-0001', 'easy');
  code(() => rooms.addBot(room.code, 'host-0001', 'easy'), 'ROOM_FULL');
  code(() => rooms.join(room.code, 'guest-002', 'G2'), 'ROOM_FULL');
  const bot = room.players.find((p) => p.kind === 'bot')!;
  code(() => rooms.removeBot(room.code, 'host-0001', 'guest-001'), 'BOT_NOT_FOUND');
  rooms.removeBot(room.code, 'host-0001', bot.id);
  assert.equal(room.players.length, 3);
  rooms.setReady(room.code, 'guest-001', true);
  rooms.start(room.code, 'host-0001');
  code(() => rooms.join(room.code, 'guest-003', 'late'), 'ALREADY_STARTED');
  code(() => rooms.addBot(room.code, 'host-0001', 'easy'), 'ALREADY_STARTED');
});

test('validates turn ownership, legality and stale or duplicated actions', () => {
  const rooms = manager();
  const room = rooms.create('host-0001', 'Host');
  rooms.join(room.code, 'guest-001', 'G');
  rooms.setReady(room.code, 'guest-001', true);
  rooms.start(room.code, 'host-0001');
  const g = room.game!;
  const mover = g.players[g.current].id;
  const waiter = g.players[(g.current + 1) % 2].id;
  code(() => rooms.act(room.code, waiter, { type: 'draw' }, g.version), 'NOT_YOUR_TURN');
  code(() => rooms.act(room.code, 'stranger', { type: 'draw' }, g.version), 'NOT_IN_ROOM');
  const wrong = g.players[g.current].hand.find((t) => t.id !== g.openingTileId)!;
  code(() => rooms.act(room.code, mover, { type: 'play', tileId: wrong.id, end: 'left' }, g.version), 'MUST_OPEN_WITH_TILE');
  rooms.act(room.code, mover, { type: 'play', tileId: g.openingTileId!, end: 'left' }, 0);
  // the same action replayed with the old version is rejected as stale
  code(() => rooms.act(room.code, mover, { type: 'play', tileId: g.openingTileId!, end: 'left' }, 0), 'STALE_STATE');
  assert.equal(room.game!.version, 1);
});

test('views never expose another player private hand', () => {
  const rooms = manager();
  const room = rooms.create('host-0001', 'Host');
  rooms.join(room.code, 'guest-001', 'G');
  rooms.addBot(room.code, 'host-0001', 'normal');
  rooms.setReady(room.code, 'guest-001', true);
  rooms.start(room.code, 'host-0001');
  const summary = JSON.stringify(rooms.summary(room));
  assert.equal(summary.includes('"hand"'), false);
  for (const viewer of ['host-0001', 'guest-001']) {
    const view = rooms.viewFor(room, viewer)!;
    const mine = room.game!.players.find((p) => p.id === viewer)!.hand;
    assert.deepEqual(view.hand, mine);
    const text = JSON.stringify({ ...view, openingTileId: null });
    for (const other of room.game!.players.filter((p) => p.id !== viewer))
      for (const t of other.hand) assert.equal(text.includes(`"${t.id}"`), false, `${viewer} sees ${t.id}`);
  }
  assert.deepEqual(rooms.viewFor(room, 'stranger')!.hand, []);
});

test('bots take their turns and a mixed match runs to completion', () => {
  const rooms = manager();
  const room = rooms.create('host-0001', 'Host', 50);
  rooms.addBot(room.code, 'host-0001', 'expert');
  rooms.addBot(room.code, 'host-0001', 'easy');
  rooms.start(room.code, 'host-0001');
  let steps = 0;
  let rounds = 0;
  while (room.phase !== 'match-over') {
    assert.ok(++steps < 3000);
    if (room.phase === 'round-over') {
      rooms.nextRound(room.code, 'host-0001', room.game!.version);
      rounds++;
      continue;
    }
    if (rooms.botToMove(room)) rooms.botTurn(room.code);
    else humanTurn(rooms, room.code);
  }
  assert.ok(room.game!.winnerId);
  assert.ok(rounds >= 0);
  code(() => humanTurn(rooms, room.code), 'MATCH_OVER');
});

test('reconnection keeps the seat; abandoned players are put on autopilot', () => {
  const clock = { t: 0 };
  const rooms = manager(clock);
  const room = rooms.create('host-0001', 'Host');
  rooms.join(room.code, 'guest-001', 'G');
  rooms.setReady(room.code, 'guest-001', true);
  rooms.start(room.code, 'host-0001');
  rooms.disconnect('guest-001');
  assert.equal(room.players[1].connected, false);
  clock.t += 10_000;
  assert.deepEqual(rooms.sweep(), []);
  rooms.reconnect('guest-001');
  assert.equal(room.players[1].connected, true);
  assert.equal(room.players.length, 2);
  // a duplicate join from the same identity reuses the seat
  rooms.join(room.code, 'guest-001', 'G again');
  assert.equal(room.players.length, 2);

  rooms.disconnect('guest-001');
  clock.t += rooms.timing.abandonMs + 1;
  const events = rooms.sweep();
  assert.deepEqual(events.map((e) => e.type), ['autopilot']);
  assert.equal(room.players[1].autopilot, true);
  // the autopilot seat is now played by a bot
  if (room.game!.players[room.game!.current].id === 'guest-001') assert.ok(rooms.botToMove(room));
  rooms.reconnect('guest-001');
  assert.equal(room.players[1].autopilot, false);
});

test('lobby abandonment frees the seat and transfers host; empty rooms are cleaned up', () => {
  const clock = { t: 0 };
  const rooms = manager(clock);
  const room = rooms.create('host-0001', 'Host');
  rooms.join(room.code, 'guest-001', 'G');
  rooms.disconnect('host-0001');
  clock.t += rooms.timing.abandonMs + 1;
  rooms.sweep();
  assert.equal(room.players.length, 1);
  assert.equal(room.hostId, 'guest-001');
  rooms.leave(room.code, 'guest-001');
  assert.equal(room.closed, true);
  code(() => rooms.get(room.code), 'ROOM_NOT_FOUND');

  const other = rooms.create('solo-0001', 'Solo');
  rooms.addBot(other.code, 'solo-0001', 'easy');
  rooms.start(other.code, 'solo-0001');
  rooms.disconnect('solo-0001');
  clock.t += rooms.timing.emptyRoomMs + rooms.timing.abandonMs + 10;
  const events = rooms.sweep();
  assert.ok(events.some((e) => e.type === 'closed'));
  assert.equal(rooms.rooms.size, 0);
});

test('leaving mid-match hands the seat to a bot; joining another room leaves the first', () => {
  const rooms = manager();
  const room = rooms.create('host-0001', 'Host');
  rooms.join(room.code, 'guest-001', 'G');
  rooms.setReady(room.code, 'guest-001', true);
  rooms.start(room.code, 'host-0001');
  rooms.leave(room.code, 'guest-001');
  assert.equal(room.players.length, 2);
  assert.equal(room.players[1].autopilot, true);

  const a = rooms.create('wander-01', 'W');
  const b = rooms.create('other-001', 'O');
  rooms.join(b.code, 'wander-01', 'W');
  assert.equal(a.closed, true);
  assert.equal(rooms.roomOf('wander-01')!.code, b.code);
});

test('guest sessions bind tokens to ids and rate limiting throttles bursts', () => {
  const sessions = new SessionRegistry();
  const token = 'secret-token-1234567890';
  assert.equal(sessions.authenticate('player-001', token), 'player-001');
  assert.equal(sessions.authenticate('player-001', token), 'player-001');
  assert.equal(sessions.authenticate('player-001', 'another-token-123456789'), null);
  assert.equal(sessions.authenticate('bot-12345678', token), null);
  assert.equal(sessions.authenticate('short', token), null);
  assert.equal(sessions.authenticate('player-002', 'tiny'), null);
  const clock = { t: 0 };
  const limiter = new RateLimiter(3, 1, () => clock.t);
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take('s')), [true, true, true, false]);
  clock.t += 1000;
  assert.equal(limiter.take('s'), true);
});

test('memory repository records match history and stats idempotently', async () => {
  const repo = new MemoryMatchRepository();
  const match = {
    id: 'm1',
    roomCode: 'ABCDE',
    targetScore: 50,
    rounds: 3,
    winnerId: 'a',
    startedAt: new Date(),
    endedAt: new Date(),
    participants: [
      { seat: 0, playerId: 'a', name: 'A', kind: 'human' as const, score: 55, won: true },
      { seat: 1, playerId: 'b', name: 'B', kind: 'bot' as const, difficulty: 'hard' as const, score: 20, won: false },
    ],
  };
  await repo.saveMatch(match);
  await repo.saveMatch(match);
  assert.deepEqual(await repo.statsFor('a'), { playerId: 'a', played: 1, won: 1, totalPoints: 55, bestScore: 55 });
  assert.equal((await repo.recentMatches('b', 5)).length, 1);
});
