/**
 * خوارزمية موازنة الفريقين.
 *
 * الفكرة: نبحث عن تقسيم للاعبين يقلّل "تكلفة" عدم التوازن، وتشمل:
 *  - فارق القوة الفعلية للأساسيين (تقييم اللاعب × مدى ملاءمته للخط الذي يلعب فيه)
 *  - فارق القوة في كل خط: دفاع، وسط، هجوم
 *  - فارق مستوى حراسة المرمى
 *  - فارق عدد اللاعبين من كل مركز
 *  - فارق قوة الاحتياط
 * نبدأ من عدة توزيعات أولية (سحب متناوب مع عشوائية مضبوطة) ثم نحسّن كلًا منها
 * بتبديل لاعبين بين الفريقين حتى لا يبقى تبديل مفيد. نحتفظ بأفضل الحلول المختلفة
 * لنقدّم بديلًا متوازنًا عند الضغط على «إعادة التوزيع».
 */
import { resolveFormation, slotsOf } from './formations';
import type { Formation, Pos, Slot, TeamId } from './types';

export interface BalanceInput {
  id: string;
  pos: Pos;
  rating: number;
}

export interface BalanceOptions {
  teamSize: number;
  formationPref?: string;
  locks?: Record<string, TeamId>;
  seed?: number;
  avoidKey?: string; // مفتاح التوزيع الحالي لتجنّب تكراره
  restarts?: number;
}

export interface BalanceResult {
  teams: Record<TeamId, string[]>;
  cost: number;
  key: string;
}

/** مدى ملاءمة لاعب لمركز معيّن */
export function fit(pos: Pos, line: Pos): number {
  if (pos === line) return 1;
  if (line === 'GK') return 0.45;
  if (pos === 'GK') return 0.6;
  const order: Pos[] = ['DEF', 'MID', 'ATT'];
  const d = Math.abs(order.indexOf(pos) - order.indexOf(line));
  return d === 1 ? 0.85 : 0.7;
}

export interface Assigned<T extends BalanceInput> {
  starters: { p: T; slot: Slot }[];
  bench: T[];
}

/** يوزّع أعضاء فريق على خانات التشكيل لتعظيم القوة الفعلية */
export function pickStarters<T extends BalanceInput>(members: T[], fm: Formation): Assigned<T> {
  const slots = slotsOf(fm);
  const pairs: { pi: number; si: number; v: number }[] = [];
  members.forEach((p, pi) =>
    slots.forEach((s, si) => {
      // مكافأة صغيرة للمركز الطبيعي حتى يُفضَّل عند التعادل
      pairs.push({ pi, si, v: p.rating * fit(p.pos, s.line) + (p.pos === s.line ? 0.01 : 0) });
    }),
  );
  pairs.sort((a, b) => b.v - a.v || a.pi - b.pi || a.si - b.si);
  const usedP = new Set<number>();
  const usedS = new Set<number>();
  const starters: { p: T; slot: Slot; si: number }[] = [];
  for (const pr of pairs) {
    if (usedP.has(pr.pi) || usedS.has(pr.si)) continue;
    usedP.add(pr.pi);
    usedS.add(pr.si);
    starters.push({ p: members[pr.pi], slot: slots[pr.si], si: pr.si });
  }
  starters.sort((a, b) => a.si - b.si);
  const bench = members.filter((_, i) => !usedP.has(i)).sort((a, b) => b.rating - a.rating);
  return { starters: starters.map(({ p, slot }) => ({ p, slot })), bench };
}

export interface TeamEval {
  total: number;
  lines: Record<'DEF' | 'MID' | 'ATT', number>;
  gk: number;
  counts: Record<Pos, number>;
  bench: number;
  starters: number;
}

export function evalTeam(members: BalanceInput[], teamSize: number, pref = 'auto'): TeamEval {
  const n = Math.min(members.length, teamSize);
  const ev: TeamEval = {
    total: 0,
    lines: { DEF: 0, MID: 0, ATT: 0 },
    gk: 0,
    counts: { GK: 0, DEF: 0, MID: 0, ATT: 0 },
    bench: 0,
    starters: n,
  };
  for (const m of members) ev.counts[m.pos]++;
  if (n === 0) return ev;
  const fm = resolveFormation(n, pref);
  const { starters, bench } = pickStarters(members, fm);
  for (const { p, slot } of starters) {
    const v = p.rating * fit(p.pos, slot.line);
    ev.total += v;
    if (slot.line === 'GK') ev.gk = v;
    else ev.lines[slot.line] += v;
  }
  ev.bench = bench.reduce((s, p) => s + p.rating, 0);
  return ev;
}

export function costOf(a: TeamEval, b: TeamEval): number {
  let c = Math.abs(a.total - b.total) * 1.0;
  c += Math.abs(a.lines.DEF - b.lines.DEF) * 0.3;
  c += Math.abs(a.lines.MID - b.lines.MID) * 0.3;
  c += Math.abs(a.lines.ATT - b.lines.ATT) * 0.3;
  c += Math.abs(a.gk - b.gk) * 0.5;
  for (const k of ['GK', 'DEF', 'MID', 'ATT'] as Pos[]) {
    const d = Math.abs(a.counts[k] - b.counts[k]);
    // وجود حارسين في فريق واحد وغياب الحارس عن الآخر عقوبة كبيرة
    c += k === 'GK' ? Math.max(0, d - 0) * 1.6 : Math.max(0, d - 1) * 0.6;
  }
  c += Math.abs(a.bench - b.bench) * 0.25;
  return c;
}

/** مولّد أرقام عشوائية قابل للتكرار */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function partitionKey(a: string[], b: string[], symmetric: boolean): string {
  const ka = [...a].sort().join(',');
  const kb = [...b].sort().join(',');
  if (!symmetric) return `${ka}|${kb}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function balanceTeams(pool: BalanceInput[], opts: BalanceOptions): BalanceResult {
  const teamSize = Math.max(1, Math.min(11, opts.teamSize));
  const pref = opts.formationPref ?? 'auto';
  const locks = opts.locks ?? {};
  const rand = rng(opts.seed ?? Date.now());
  const restarts = opts.restarts ?? (pool.length <= 14 ? 36 : pool.length <= 22 ? 20 : 12);
  const ids = new Set(pool.map((p) => p.id));
  const activeLocks = Object.fromEntries(Object.entries(locks).filter(([id]) => ids.has(id)));
  const symmetric = Object.keys(activeLocks).length === 0;

  const total = pool.length;
  const lockedA = pool.filter((p) => activeLocks[p.id] === 'A');
  const lockedB = pool.filter((p) => activeLocks[p.id] === 'B');
  let sizeA = Math.ceil(total / 2);
  if (lockedA.length > sizeA) sizeA = lockedA.length;
  if (lockedB.length > total - sizeA) sizeA = total - lockedB.length;
  const sizeB = total - sizeA;

  const free = pool.filter((p) => !activeLocks[p.id]);
  const evalSplit = (A: BalanceInput[], B: BalanceInput[]) =>
    costOf(evalTeam(A, teamSize, pref), evalTeam(B, teamSize, pref));

  const order: Record<Pos, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
  const found = new Map<string, BalanceResult>();

  for (let r = 0; r < restarts; r++) {
    // توزيع أولي: الحراس أولًا ثم بقية المراكز، بسحب متناوب على شكل ثعبان
    const jitter = r === 0 ? 0 : 1.6;
    const sorted = [...free].sort((x, y) => {
      if (order[x.pos] !== order[y.pos] && (x.pos === 'GK' || y.pos === 'GK')) return order[x.pos] - order[y.pos];
      return y.rating + (rand() - 0.5) * jitter - (x.rating + (rand() - 0.5) * jitter);
    });
    const A = [...lockedA];
    const B = [...lockedB];
    let turn = rand() < 0.5 ? 0 : 1;
    let step = 0;
    for (const p of sorted) {
      const wantA = turn === 0;
      if ((wantA && A.length < sizeA) || B.length >= sizeB) A.push(p);
      else B.push(p);
      step++;
      if (step % 2 === 1) turn = 1 - turn; // نمط أ ب ب أ أ ب ...
    }

    // تحسين محلي بالتبديل: أول تبديل مفيد يُطبَّق مباشرة (أسرع على الهاتف)
    let cur = evalSplit(A, B);
    let improved = true;
    for (let iter = 0; iter < 40 && improved; iter++) {
      improved = false;
      const offI = Math.floor(rand() * A.length);
      const offJ = Math.floor(rand() * Math.max(1, B.length));
      for (let ii = 0; ii < A.length && !improved; ii++) {
        const i = (ii + offI) % A.length;
        if (activeLocks[A[i].id]) continue;
        for (let jj = 0; jj < B.length; jj++) {
          const j = (jj + offJ) % B.length;
          if (activeLocks[B[j].id]) continue;
          const a = A[i];
          A[i] = B[j];
          B[j] = a;
          const c = evalSplit(A, B);
          if (c < cur - 1e-9) {
            cur = c;
            improved = true;
            break;
          }
          B[j] = A[i];
          A[i] = a;
        }
      }
    }

    const key = partitionKey(
      A.map((p) => p.id),
      B.map((p) => p.id),
      symmetric,
    );
    if (!found.has(key)) found.set(key, { teams: { A: A.map((p) => p.id), B: B.map((p) => p.id) }, cost: cur, key });
  }

  const sols = [...found.values()].sort((a, b) => a.cost - b.cost);
  let pick = sols[0];
  if (opts.avoidKey) {
    const others = sols.filter((s) => s.key !== opts.avoidKey);
    if (others.length) {
      const limit = sols[0].cost + Math.max(0.8, sols[0].cost * 0.6);
      const good = others.filter((s) => s.cost <= limit).slice(0, 4);
      pick = good.length ? good[Math.floor(rand() * good.length)] : others[0];
    }
  }
  // بلا تثبيت: الفريقان متماثلان، فنبدّل الألوان عشوائيًا للتنويع
  if (symmetric && rand() < 0.5) {
    pick = { ...pick, teams: { A: pick.teams.B, B: pick.teams.A } };
  }
  return pick;
}
