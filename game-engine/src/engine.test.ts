import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type GameAction,
  type GameState,
  type PlacedTile,
  EngineError,
  applyAction,
  assertInvariants,
  blockedWinner,
  buildAllVectors,
  createMatch,
  createSet,
  findOpening,
  legalEndsFor,
  legalMoves,
  mulberry32,
  parseState,
  simpleAction,
  startNextRound,
} from './index.js';

const T = (id: string) => {
  const [a, b] = id.split('-').map(Number);
  return { id, a, b };
};
const P = (id: string, left: number, right: number): PlacedTile => ({ ...T(id), left, right });

/** Builds a hand-crafted state. Tiles not listed anywhere go to the stock, or to `restSeat`'s hand. */
function custom(opts: {
  hands: string[][];
  board?: PlacedTile[];
  stock?: string[];
  restSeat?: number;
  current?: number;
  scores?: number[];
  target?: 50 | 100 | 150 | 200;
}): GameState {
  const used = new Set([...opts.hands.flat(), ...(opts.board ?? []).map((t) => t.id), ...(opts.stock ?? [])]);
  const rest = createSet()
    .map((t) => t.id)
    .filter((id) => !used.has(id));
  const hands = opts.hands.map((h) => [...h]);
  const stock = [...(opts.stock ?? [])];
  if (opts.restSeat !== undefined) hands[opts.restSeat].push(...rest);
  else stock.push(...rest);
  const state: GameState = {
    schema: 1,
    version: 0,
    round: 1,
    phase: 'playing',
    targetScore: opts.target ?? 100,
    players: hands.map((h, i) => ({ id: `p${i + 1}`, score: opts.scores?.[i] ?? 0, hand: h.map(T), missing: [] })),
    board: opts.board ?? [],
    stock: stock.map(T),
    current: opts.current ?? 0,
    starter: 0,
    openingTileId: null,
    consecutivePasses: 0,
    lastRound: null,
    winnerId: null,
    lastAction: null,
  };
  assertInvariants(state);
  return state;
}

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof EngineError && e.code === code);

const tileCount = (s: GameState) => s.players.reduce((n, p) => n + p.hand.length, 0) + s.board.length + s.stock.length;

test('generates the 28 unique double-six tiles', () => {
  const set = createSet();
  assert.equal(set.length, 28);
  assert.equal(new Set(set.map((t) => t.id)).size, 28);
  for (const t of set) assert.ok(t.a >= 0 && t.b <= 6 && t.a <= t.b);
});

test('deals 7 tiles for 2 players and 5 for 3 or 4 players, conserving all tiles', () => {
  for (const count of [2, 3, 4]) {
    for (let seed = 1; seed <= 20; seed++) {
      const g = createMatch(Array.from({ length: count }, (_, i) => `p${i}`), 100, mulberry32(seed));
      assert.deepEqual(
        g.players.map((p) => p.hand.length),
        Array(count).fill(count === 2 ? 7 : 5),
      );
      assert.equal(g.stock.length, 28 - count * (count === 2 ? 7 : 5));
      assert.equal(tileCount(g), 28);
    }
  }
});

test('rejects invalid player counts, duplicate ids and target scores', () => {
  rejects(() => createMatch(['a'], 100, mulberry32(1)), 'INVALID_PLAYERS');
  rejects(() => createMatch(['a', 'b', 'c', 'd', 'e'], 100, mulberry32(1)), 'INVALID_PLAYERS');
  rejects(() => createMatch(['a', 'a'], 100, mulberry32(1)), 'INVALID_PLAYERS');
  rejects(() => createMatch(['a', 'b'], 75, mulberry32(1)), 'INVALID_TARGET');
  for (const t of [50, 100, 150, 200]) assert.equal(createMatch(['a', 'b'], t, mulberry32(1)).targetScore, t);
});

test('starting player holds the highest double, falling back to the heaviest tile', () => {
  assert.deepEqual(findOpening([[T('1-1'), T('5-6')], [T('4-4'), T('0-1')]]), { seat: 1, tileId: '4-4' });
  assert.deepEqual(findOpening([[T('0-0')], [T('5-6')]]), { seat: 0, tileId: '0-0' });
  assert.deepEqual(findOpening([[T('1-5'), T('0-6')], [T('2-4'), T('4-5')]]), { seat: 1, tileId: '4-5' });
  // equal pip totals: higher single value wins (0-6 beats 1-5 and 2-4)
  assert.deepEqual(findOpening([[T('1-5')], [T('2-4')], [T('0-6')]]), { seat: 2, tileId: '0-6' });
  for (let seed = 1; seed <= 50; seed++) {
    const g = createMatch(['a', 'b', 'c', 'd'], 100, mulberry32(seed));
    assert.ok(g.players[g.current].hand.some((t) => t.id === g.openingTileId));
  }
});

test('the starter must open with the designated tile', () => {
  const g = createMatch(['a', 'b'], 100, mulberry32(3));
  const starter = g.players[g.current];
  const other = starter.hand.find((t) => t.id !== g.openingTileId)!;
  rejects(() => applyAction(g, { type: 'play', playerId: starter.id, tileId: other.id, end: 'left' }), 'MUST_OPEN_WITH_TILE');
  const next = applyAction(g, { type: 'play', playerId: starter.id, tileId: g.openingTileId!, end: 'left' });
  assert.equal(next.board.length, 1);
  assert.equal(next.openingTileId, null);
  assert.equal(next.version, 1);
});

test('legal moves match either open end and orient tiles correctly', () => {
  const s = custom({ hands: [['1-2', '0-0'], ['2-5', '6-6'], ['1-4']], current: 0 });
  let n = applyAction(s, { type: 'play', playerId: 'p1', tileId: '1-2', end: 'left' });
  assert.deepEqual(legalEndsFor(n.board, null, T('2-5')), ['right']);
  assert.deepEqual(legalEndsFor(n.board, null, T('6-6')), []);
  n = applyAction(n, { type: 'play', playerId: 'p2', tileId: '2-5', end: 'right' });
  assert.deepEqual(n.board.map((t) => [t.left, t.right]), [
    [1, 2],
    [2, 5],
  ]);
  n = applyAction(n, { type: 'play', playerId: 'p3', tileId: '1-4', end: 'left' });
  assert.deepEqual(n.board.map((t) => [t.left, t.right]), [
    [4, 1],
    [1, 2],
    [2, 5],
  ]);
});

test('tiles matching both ends can go either way; doubles sit across', () => {
  const board = [P('3-4', 3, 4)];
  assert.deepEqual(legalEndsFor(board, null, T('3-4')), ['left', 'right']);
  const s = custom({ hands: [['4-4', '0-1'], ['2-3']], board, current: 0 });
  const n = applyAction(s, { type: 'play', playerId: 'p1', tileId: '4-4', end: 'right' });
  assert.deepEqual(n.board.at(-1), P('4-4', 4, 4));
  rejects(() => applyAction(n, { type: 'play', playerId: 'p2', tileId: '2-3', end: 'right' }), 'ILLEGAL_MOVE');
  const m = applyAction(n, { type: 'play', playerId: 'p2', tileId: '2-3', end: 'left' });
  assert.deepEqual(m.board[0], P('2-3', 2, 3));
});

test('rejects out-of-turn, unknown players, foreign tiles and malformed actions', () => {
  const s = custom({ hands: [['1-2'], ['2-5']], current: 0 });
  rejects(() => applyAction(s, { type: 'play', playerId: 'p2', tileId: '2-5', end: 'left' }), 'NOT_YOUR_TURN');
  rejects(() => applyAction(s, { type: 'play', playerId: 'zz', tileId: '2-5', end: 'left' }), 'UNKNOWN_PLAYER');
  rejects(() => applyAction(s, { type: 'play', playerId: 'p1', tileId: '2-5', end: 'left' }), 'TILE_NOT_IN_HAND');
  rejects(() => applyAction(s, { type: 'play', playerId: 'p1', tileId: '1-2', end: 'up' as 'left' }), 'INVALID_ACTION');
  rejects(() => applyAction(s, { type: 'steal', playerId: 'p1' } as unknown as GameAction), 'INVALID_ACTION');
});

test('drawing is only allowed without a legal move; the turn stays with the drawer', () => {
  const s = custom({ hands: [['6-6', '5-5'], ['0-0']], board: [P('1-2', 1, 2)], stock: ['0-4', '2-3'], restSeat: 1, current: 0 });
  rejects(() => applyAction(s, { type: 'pass', playerId: 'p1' }), 'MUST_DRAW');
  const d1 = applyAction(s, { type: 'draw', playerId: 'p1' });
  assert.equal(d1.current, 0);
  assert.equal(d1.players[0].hand.at(-1)!.id, '2-3');
  assert.deepEqual(d1.players[0].missing, [1, 2]);
  rejects(() => applyAction(d1, { type: 'draw', playerId: 'p1' }), 'MOVE_AVAILABLE');
  rejects(() => applyAction(d1, { type: 'pass', playerId: 'p1' }), 'MOVE_AVAILABLE');
  const played = applyAction(d1, { type: 'play', playerId: 'p1', tileId: '2-3', end: 'right' });
  assert.equal(played.current, 1);
});

test('drawing from an empty stock is rejected; passing requires an empty stock', () => {
  const s = custom({ hands: [['6-6'], ['1-1']], board: [P('2-3', 2, 3)], stock: [], restSeat: 1, current: 0 });
  rejects(() => applyAction(s, { type: 'draw', playerId: 'p1' }), 'STOCK_EMPTY');
  const n = applyAction(s, { type: 'pass', playerId: 'p1' });
  assert.equal(n.current, 1);
  assert.equal(n.consecutivePasses, 1);
});

test('emptying a hand wins the round with opponents pips; next round starts with the winner', () => {
  const s = custom({ hands: [['1-2'], ['5-6', '0-0']], board: [P('2-3', 2, 3)], restSeat: 1, stock: [], current: 0, target: 200 });
  const opponentPips = s.players[1].hand.reduce((n, t) => n + t.a + t.b, 0);
  const n = applyAction(s, { type: 'play', playerId: 'p1', tileId: '1-2', end: 'left' });
  assert.equal(n.phase, 'round-over');
  assert.equal(n.players[0].score, opponentPips);
  assert.deepEqual(n.lastRound && [n.lastRound.winnerId, n.lastRound.reason, n.lastRound.points], ['p1', 'domino', opponentPips]);
  rejects(() => applyAction(n, { type: 'draw', playerId: 'p2' }), 'ROUND_OVER');
  const r2 = startNextRound(n, mulberry32(5));
  assert.equal(r2.round, 2);
  assert.equal(r2.current, 0);
  assert.equal(r2.openingTileId, null);
  assert.equal(r2.players[0].score, opponentPips);
  assert.equal(tileCount(r2), 28);
  rejects(() => startNextRound(r2, mulberry32(5)), 'ROUND_NOT_OVER');
});

test('a blocked round goes to the lowest pip total', () => {
  // all seven 3-tiles are on the board and both ends show 3 → nobody can move
  const board = [
    P('0-3', 3, 0), P('0-1', 0, 1), P('1-3', 1, 3), P('3-3', 3, 3), P('2-3', 3, 2),
    P('2-4', 2, 4), P('3-4', 4, 3), P('3-5', 3, 5), P('5-6', 5, 6), P('3-6', 6, 3),
  ];
  const s = custom({ hands: [['0-0', '0-2', '1-1'], []], board, stock: [], restSeat: 1, current: 0, target: 200 });
  const bPips = s.players[1].hand.reduce((n, t) => n + t.a + t.b, 0);
  let n = applyAction(s, { type: 'pass', playerId: 'p1' });
  n = applyAction(n, { type: 'pass', playerId: 'p2' });
  assert.equal(n.phase, 'round-over');
  assert.equal(n.lastRound!.reason, 'blocked');
  assert.equal(n.lastRound!.winnerId, 'p1');
  assert.equal(n.players[0].score, bPips);
});

test('blocked ties break on fewer tiles, then lowest seat', () => {
  const base = custom({ hands: [['0-6'], ['1-2', '1-3'], ['2-4']], current: 0 });
  assert.equal(blockedWinner(base), 0); // 6 pips/1 tile vs 7 vs 6 pips/1 tile → seat 0
  const fewer = custom({ hands: [['0-2', '0-4'], ['1-5']], current: 0 });
  assert.equal(blockedWinner(fewer), 1);
});

test('reaching the target score ends the match and locks the game', () => {
  const s = custom({ hands: [['1-2'], ['5-6']], board: [P('2-3', 2, 3)], restSeat: 1, stock: [], current: 0, scores: [45, 10], target: 50 });
  const n = applyAction(s, { type: 'play', playerId: 'p1', tileId: '1-2', end: 'left' });
  assert.equal(n.phase, 'match-over');
  assert.equal(n.winnerId, 'p1');
  assert.ok(n.players[0].score >= 50);
  rejects(() => applyAction(n, { type: 'pass', playerId: 'p2' }), 'MATCH_OVER');
  rejects(() => startNextRound(n, mulberry32(1)), 'MATCH_OVER');
});

test('applyAction is pure: rejected and accepted actions never mutate the input', () => {
  const g = createMatch(['a', 'b', 'c'], 100, mulberry32(11));
  const before = JSON.stringify(g);
  try {
    applyAction(g, { type: 'pass', playerId: g.players[(g.current + 1) % 3].id });
  } catch {
    /* expected */
  }
  applyAction(g, simpleAction(g));
  assert.equal(JSON.stringify(g), before);
});

test('invariants catch duplicated, missing or corrupted tiles', () => {
  const g = createMatch(['a', 'b'], 100, mulberry32(4));
  const dup = JSON.parse(JSON.stringify(g)) as GameState;
  dup.players[0].hand.push(dup.players[1].hand[0]);
  rejects(() => assertInvariants(dup), 'INVALID_STATE');
  const missing = JSON.parse(JSON.stringify(g)) as GameState;
  missing.stock.pop();
  rejects(() => assertInvariants(missing), 'INVALID_STATE');
  const negative = JSON.parse(JSON.stringify(g)) as GameState;
  negative.players[0].score = -5;
  rejects(() => assertInvariants(negative), 'INVALID_STATE');
  rejects(() => parseState({ foo: 1 }), 'INVALID_STATE');
  rejects(() => parseState(null), 'INVALID_STATE');
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(g))), g);
});

test('hundreds of random matches terminate and conserve tiles', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const rnd = mulberry32(seed);
    const count = 2 + (seed % 3);
    let g = createMatch(Array.from({ length: count }, (_, i) => `p${i}`), 50, rnd);
    let steps = 0;
    while (g.phase !== 'match-over') {
      assert.ok(++steps < 5000, 'match did not terminate');
      if (g.phase === 'round-over') {
        g = startNextRound(g, rnd);
        continue;
      }
      const moves = legalMoves(g);
      const p = g.players[g.current].id;
      const action: GameAction = moves.length
        ? { type: 'play', playerId: p, ...moves[Math.floor(rnd() * moves.length)] }
        : g.stock.length
          ? { type: 'draw', playerId: p }
          : { type: 'pass', playerId: p };
      g = applyAction(g, action);
      assert.equal(tileCount(g), 28);
    }
    assert.ok(g.players.find((p) => p.id === g.winnerId)!.score >= 50);
  }
});

test('cross-platform engine vectors are up to date (TypeScript ↔ Dart)', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const targets = [`${root}shared/fixtures/engine-vectors.json`, `${root}mobile/test/fixtures/engine_vectors.json`];
  const content = `${JSON.stringify(buildAllVectors())}\n`;
  if (process.env.UPDATE_VECTORS === '1') {
    for (const file of targets) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }
  for (const file of targets) {
    assert.ok(existsSync(file), `${file} missing — run UPDATE_VECTORS=1 npm test -w @daeef/game-engine`);
    assert.equal(readFileSync(file, 'utf8'), content, `${file} is stale`);
  }
});
