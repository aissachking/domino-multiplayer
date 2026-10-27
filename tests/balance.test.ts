import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceTeams, evalTeam, rng, type BalanceInput } from '../src/core/balance';
import { formationsFor, slotsOf } from '../src/core/formations';
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

test('كل تشكيل يحتوي عدد الخانات الصحيح', () => {
  for (let n = 1; n <= 11; n++) {
    for (const fm of formationsFor(n)) assert.equal(slotsOf(fm).length, n, fm.id);
  }
});

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
