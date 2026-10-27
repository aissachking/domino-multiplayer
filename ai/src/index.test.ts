import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createMatch, mulberry32, startNextRound } from '@daeef/game-engine';
import type { Difficulty } from '@daeef/shared';
import { botViewFor, candidateMoves, chooseAction, decideBotAction, sampleWorld } from './index.js';

const LEVELS: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
const fast = { maxSimulations: 60, timeBudgetMs: 10_000 };

test('every difficulty only produces legal actions through whole matches', () => {
  for (const level of LEVELS) {
    for (let seed = 1; seed <= (level === 'expert' ? 3 : 15); seed++) {
      const rnd = mulberry32(seed);
      let g = createMatch(['a', 'b', 'c'], 50, rnd);
      while (g.phase !== 'match-over') {
        if (g.phase === 'round-over') {
          g = startNextRound(g, rnd);
          continue;
        }
        const action = chooseAction(botViewFor(g, g.current), level, { ...fast, random: rnd });
        g = applyAction(g, action); // throws if illegal
      }
    }
  }
});

test('bots draw when they cannot play and pass when the stock is empty', () => {
  const g = createMatch(['a', 'b'], 100, mulberry32(9));
  const view = botViewFor(g, g.current);
  const blocked = { ...view, hand: [{ id: '6-6', a: 6, b: 6 }], board: [{ id: '1-2', a: 1, b: 2, left: 1, right: 2 }], openingTileId: null };
  for (const level of LEVELS) {
    assert.equal(chooseAction(blocked, level, fast).type, 'draw');
    assert.equal(chooseAction({ ...blocked, stockCount: 0 }, level, fast).type, 'pass');
  }
});

test('bot views never contain another player private hand', () => {
  const g = createMatch(['a', 'b', 'c', 'd'], 100, mulberry32(21));
  for (let seat = 0; seat < 4; seat++) {
    const view = JSON.stringify(botViewFor(g, seat));
    for (let other = 0; other < 4; other++) {
      if (other === seat) continue;
      // the required opening tile is public by rule (everyone knows who starts with it)
      for (const t of g.players[other].hand) if (t.id !== g.openingTileId) assert.equal(view.includes(`"${t.id}"`), false);
    }
  }
});

test('bots never mutate the game state they are given', () => {
  const g = createMatch(['a', 'b'], 100, mulberry32(5));
  const before = JSON.stringify(g);
  for (const level of LEVELS) decideBotAction(g, g.current, level, { ...fast, random: mulberry32(1) });
  assert.equal(JSON.stringify(g), before);
});

test('decideBotAction recovers from an invalid internal decision', () => {
  const g = createMatch(['a', 'b'], 100, mulberry32(5));
  const broken = decideBotAction(g, g.current, 'nonsense' as Difficulty);
  assert.equal(broken.next.version, g.version + 1);
  const viaSeat = decideBotAction(g, (g.current + 1) % 2, 'easy'); // not this seat's turn → fallback
  assert.equal(viaSeat.fallback, true);
  assert.equal(viaSeat.next.version, g.version + 1);
});

test('expert respects its time budget', () => {
  const g = createMatch(['a', 'b', 'c', 'd'], 100, mulberry32(77));
  const second = applyAction(g, { type: 'play', playerId: g.players[g.current].id, tileId: g.openingTileId!, end: 'left' });
  const started = performance.now();
  chooseAction(botViewFor(second, second.current), 'expert', { timeBudgetMs: 120, maxSimulations: 100_000 });
  assert.ok(performance.now() - started < 600, 'expert exceeded its budget');
});

test('sampled worlds respect tile counts and known missing values', () => {
  const g = createMatch(['a', 'b', 'c'], 100, mulberry32(12));
  const s = applyAction(g, { type: 'play', playerId: g.players[g.current].id, tileId: g.openingTileId!, end: 'left' });
  const view = botViewFor(s, s.current);
  view.opponents[0].missing = [6];
  for (let i = 0; i < 30; i++) {
    const w = sampleWorld(view, mulberry32(i));
    for (const opp of view.opponents) assert.equal(w.players[opp.seat].hand.length, opp.tileCount);
    assert.equal(w.stock.length, view.stockCount);
    const hand = w.players[view.opponents[0].seat].hand;
    assert.ok(hand.every((t) => t.a !== 6 && t.b !== 6));
  }
});

/** Plays two-player rounds between levels, alternating seats; returns rounds won by `strong`. */
function duel(strong: Difficulty, weak: Difficulty, rounds: number): number {
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    const rnd = mulberry32(1000 + i);
    const ids = i % 2 ? ['strong', 'weak'] : ['weak', 'strong'];
    let g = createMatch(ids, 200, rnd);
    while (g.phase === 'playing') {
      const level = g.players[g.current].id === 'strong' ? strong : weak;
      g = applyAction(g, chooseAction(botViewFor(g, g.current), level, { ...fast, random: rnd }));
    }
    if (g.lastRound!.winnerId === 'strong') wins++;
  }
  return wins;
}

test('difficulty levels are meaningfully different in strength', () => {
  const rounds = 60;
  const hardVsEasy = duel('hard', 'easy', rounds);
  const expertVsEasy = duel('expert', 'easy', rounds);
  assert.ok(hardVsEasy > rounds / 2, `hard won only ${hardVsEasy}/${rounds}`);
  assert.ok(expertVsEasy > rounds / 2, `expert won only ${expertVsEasy}/${rounds}`);
  // easy is random, normal is deterministic greedy
  const g = createMatch(['a', 'b'], 100, mulberry32(2));
  const s = applyAction(g, { type: 'play', playerId: g.players[g.current].id, tileId: g.openingTileId!, end: 'left' });
  const view = botViewFor(s, s.current);
  if (candidateMoves(view).length > 1) {
    const normal = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(chooseAction(view, 'normal', { random: mulberry32(i) }))));
    assert.equal(normal.size, 1);
  }
});
