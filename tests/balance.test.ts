import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceTeams, evalTeam, rng, type BalanceInput } from '../src/core/balance';
import { buildMatch, teamStrength, balanceVerdict, matchKey } from '../src/core/match';
import { samplePlayers, DEFAULT_SETTINGS } from '../src/core/storage';
import type { Pos } from '../src/core/types';

const mk = (spec: [Pos, number][]): BalanceInput[] => spec.map(([pos, rating], i) => ({ id: `p${i}`, pos, rating }));

const POOL14 = mk([
  ['GK', 7], ['GK', 6],
  ['DEF', 8], ['DEF', 6], ['DEF', 7], ['DEF', 5],
  ['MID', 9], ['MID', 7], ['MID', 6], ['MID', 8],
  ['ATT', 9], ['ATT', 7], ['ATT', 6], ['ATT', 5],
]);

test('كل اللاعبين موزعون بلا تكرار وبحجمين متقاربين', () => {
  const r = balanceTeams(POOL14, { teamSize: 7, seed: 1 });
  const all = [...r.teams.A, ...r.teams.B];
  assert.equal(all.length, 14);
  assert.equal(new Set(all).size, 14);
  assert.equal(r.teams.A.length, 7);
  assert.equal(r.teams.B.length, 7);
});

test('الحارسان في فريقين مختلفين', () => {
  for (let s = 1; s <= 20; s++) {
    const r = balanceTeams(POOL14, { teamSize: 7, seed: s });
    const gkA = r.teams.A.filter((id) => POOL14.find((p) => p.id === id)!.pos === 'GK').length;
    assert.equal(gkA, 1, `seed ${s}`);
  }
});

test('الفارق أقل بكثير من التوزيع العشوائي', () => {
  const r = balanceTeams(POOL14, { teamSize: 7, seed: 3 });
  const get = (ids: string[]) => ids.map((id) => POOL14.find((p) => p.id === id)!);
  const diff = Math.abs(evalTeam(get(r.teams.A), 7).total - evalTeam(get(r.teams.B), 7).total);
  const rand = rng(99);
  let sum = 0;
  for (let k = 0; k < 200; k++) {
    const sh = [...POOL14].sort(() => rand() - 0.5);
    sum += Math.abs(evalTeam(sh.slice(0, 7), 7).total - evalTeam(sh.slice(7), 7).total);
  }
  const avgRandom = sum / 200;
  assert.ok(diff < 1, `diff=${diff}`);
  assert.ok(diff < avgRandom / 4, `diff=${diff} random=${avgRandom}`);
});

test('توزيع خطوط الهجوم بالتساوي', () => {
  const pool = mk([['ATT', 10], ['ATT', 10], ['ATT', 10], ['ATT', 10], ['DEF', 5], ['DEF', 5], ['DEF', 5], ['DEF', 5]]);
  const r = balanceTeams(pool, { teamSize: 4, seed: 5 });
  const attA = r.teams.A.filter((id) => pool.find((p) => p.id === id)!.pos === 'ATT').length;
  assert.equal(attA, 2);
});

test('التثبيت في فريق محترم', () => {
  const locks = { p6: 'A', p10: 'A', p0: 'B' } as const;
  for (let s = 1; s <= 10; s++) {
    const r = balanceTeams(POOL14, { teamSize: 7, seed: s, locks });
    assert.ok(r.teams.A.includes('p6') && r.teams.A.includes('p10') && r.teams.B.includes('p0'));
  }
});

test('إعادة التوزيع تعطي توزيعًا مختلفًا ومتوازنًا', () => {
  const first = balanceTeams(POOL14, { teamSize: 7, seed: 7 });
  const second = balanceTeams(POOL14, { teamSize: 7, seed: 8, avoidKey: first.key });
  assert.notEqual(second.key, first.key);
  assert.ok(second.cost < first.cost + 2.5, `${first.cost} -> ${second.cost}`);
});

test('عند زيادة العدد عن الحد يظهر احتياط والأساسيون بالعدد المطلوب', () => {
  const roster = samplePlayers();
  const r = balanceTeams(roster, { teamSize: 5, seed: 2 });
  const m = buildMatch(roster, r.teams, 5, 'auto', DEFAULT_SETTINGS.teams);
  for (const t of ['A', 'B'] as const) {
    const st = m.players.filter((p) => p.team === t && !p.bench);
    assert.equal(st.length, 5);
    assert.equal(st.filter((p) => p.line === 'GK').length, 1);
    const nums = m.players.filter((p) => p.team === t).map((p) => p.number);
    assert.equal(new Set(nums).size, nums.length, 'أرقام غير مكررة');
  }
  const v = balanceVerdict(teamStrength(m, 'A'), teamStrength(m, 'B'));
  assert.ok(v.pct < 8, `pct=${v.pct}`);
  assert.equal(matchKey(m, true), r.key);
});

test('عدد فردي ولاعب واحد لكل فريق', () => {
  const pool = mk([['MID', 5], ['ATT', 9], ['DEF', 4]]);
  const r = balanceTeams(pool, { teamSize: 1, seed: 1 });
  assert.equal(r.teams.A.length + r.teams.B.length, 3);
});

import { emptyMatch, inferLine, movePlayer, placePlayer, unplacePlayer } from '../src/core/match';
import { pitchFor } from '../src/core/match';

test('الوضع اليدوي: الفريق يتحدد بنصف الملعب ويتغير عند العبور', () => {
  const teams = DEFAULT_SETTINGS.teams;
  let m = emptyMatch(7, teams);
  const pl = { id: 'x', name: 'س', pos: 'MID' as const, rating: 7, number: undefined };
  m = placePlayer(m, pl, { x: 0, z: 10 });
  assert.equal(m.players[0].team, 'B');
  m = movePlayer(m, 'x', { x: 3, z: -12 });
  assert.equal(m.players[0].team, 'A');
  assert.deepEqual(m.players[0].home, { x: 3, z: -12 });
  m = unplacePlayer(m, 'x');
  assert.equal(m.players.length, 0);
});

test('كل لاعب يوضع في خط مركزه الحقيقي، والموقع يطابق الخط', () => {
  const pool = samplePlayers();
  for (const size of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    for (const seed of [1, 2, 3]) {
      const r = balanceTeams(pool, { teamSize: size, seed });
      const m = buildMatch(pool, r.teams, size, 'auto', DEFAULT_SETTINGS.teams);
      for (const t of ['A', 'B'] as const) {
        const st = m.players.filter((p) => p.team === t && !p.bench);
        assert.ok(st.length <= size);
        assert.ok(st.filter((p) => p.line === 'GK').length <= 1);
        for (const p of st) {
          if (!(p.pos === 'GK' && p.line === 'DEF')) assert.equal(p.line, p.pos, `${size} ${p.name}`);
          assert.equal(inferLine(p.home, p.team, pitchFor(size)), p.line, `موقع ${size} ${p.name}`);
        }
      }
    }
  }
});

test('مهاجمون كثر ومدافع واحد: لا أحد يُنقل من مركزه', () => {
  const pool = mk([['ATT', 9], ['ATT', 8], ['ATT', 8], ['ATT', 7], ['DEF', 5], ['DEF', 4], ['MID', 6], ['MID', 6]]);
  const r = balanceTeams(pool, { teamSize: 4, seed: 9 });
  const roster = pool.map((p) => ({ ...p, name: p.id, active: true }));
  const m = buildMatch(roster, r.teams, 4, 'auto', DEFAULT_SETTINGS.teams);
  for (const p of m.players.filter((q) => !q.bench)) assert.equal(p.line, p.pos);
});
