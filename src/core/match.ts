import { fit, pickStarters } from './balance';
import { resolveFormation } from './formations';
import type { Match, MatchPlayer, Player, Pos, Slot, TeamId, TeamInfo, Vec2 } from './types';

export interface PitchDims {
  w: number; // العرض بالأمتار
  l: number; // الطول بالأمتار
  kind: 'futsal' | 'seven' | 'full';
}

/** مقاس الملعب يتبع عدد اللاعبين: خماسي، سباعي، أو ملعب كامل */
export function pitchFor(teamSize: number): PitchDims {
  if (teamSize <= 5) return { w: 22, l: 40, kind: 'futsal' };
  if (teamSize <= 8) return { w: 42, l: 64, kind: 'seven' };
  return { w: 68, l: 105, kind: 'full' };
}

export function slotToWorld(slot: Slot, team: TeamId, dims: PitchDims): Vec2 {
  const half = dims.l / 2;
  const x = slot.lateral * (dims.w / 2) * 0.92;
  const depth = slot.depth * half * 0.96;
  // الفريق أ يدافع عن المرمى القريب (z سالب)، والفريق ب عن البعيد
  return team === 'A' ? { x, z: -half + depth } : { x: -x, z: half - depth };
}

export function clampToPitch(p: Vec2, dims: PitchDims, margin = 1.5): Vec2 {
  return {
    x: Math.max(-dims.w / 2 - margin, Math.min(dims.w / 2 + margin, p.x)),
    z: Math.max(-dims.l / 2 - margin, Math.min(dims.l / 2 + margin, p.z)),
  };
}

type Member = { id: string; name: string; pos: Player['pos']; rating: number; number?: number };

/** يرتّب أعضاء فريق على التشكيل ويحسب المواقع الأصلية والأرقام */
export function layoutTeam(members: Member[], team: TeamId, teamSize: number, pref: string): MatchPlayer[] {
  const dims = pitchFor(teamSize);
  const n = Math.min(members.length, teamSize);
  if (n === 0) return [];
  const fm = resolveFormation(n, pref);
  const { starters, bench } = pickStarters(members, fm);
  const taken = new Set<number>(members.map((m) => m.number).filter((x): x is number => !!x));
  let next = 1;
  const nextNum = () => {
    while (taken.has(next)) next++;
    taken.add(next);
    return next;
  };
  const out: MatchPlayer[] = [];
  for (const { p, slot } of starters) {
    const home = slotToWorld(slot, team, dims);
    out.push({
      id: p.id,
      name: p.name,
      pos: p.pos,
      rating: p.rating,
      number: p.number || nextNum(),
      team,
      bench: false,
      line: slot.line,
      home,
      at: { ...home },
    });
  }
  for (const p of bench) {
    out.push({
      id: p.id,
      name: p.name,
      pos: p.pos,
      rating: p.rating,
      number: p.number || nextNum(),
      team,
      bench: true,
      line: p.pos,
      home: { x: 0, z: 0 },
      at: { x: 0, z: 0 },
    });
  }
  return out;
}

export function buildMatch(
  roster: Player[],
  teams: Record<TeamId, string[]>,
  teamSize: number,
  formationId: string,
  info: Record<TeamId, TeamInfo>,
): Match {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  return {
    teamSize,
    formationId,
    teams: { A: { ...info.A }, B: { ...info.B } },
    players: [
      ...layoutTeam(pick(teams.A), 'A', teamSize, formationId),
      ...layoutTeam(pick(teams.B), 'B', teamSize, formationId),
    ],
    createdAt: Date.now(),
  };
}

/** إعادة ترتيب التشكيل مع الإبقاء على أعضاء كل فريق (بعد تغيير التشكيل أو النقل اليدوي) */
export function relayout(m: Match, formationId = m.formationId): Match {
  const team = (t: TeamId) => m.players.filter((p) => p.team === t);
  return {
    ...m,
    formationId,
    players: [
      ...layoutTeam(team('A'), 'A', m.teamSize, formationId),
      ...layoutTeam(team('B'), 'B', m.teamSize, formationId),
    ],
  };
}

export function resetPositions(m: Match): Match {
  return { ...m, players: m.players.map((p) => ({ ...p, at: { ...p.home } })) };
}

export interface TeamStrength {
  score: number; // من 100
  total: number;
  starters: number;
  lines: { DEF: number; MID: number; ATT: number; GK: number };
}

export function teamStrength(m: Match, t: TeamId): TeamStrength {
  const st = m.players.filter((p) => p.team === t && !p.bench);
  const lines = { DEF: 0, MID: 0, ATT: 0, GK: 0 };
  let total = 0;
  for (const p of st) {
    const v = p.rating * fit(p.pos, p.line);
    total += v;
    lines[p.line] += v;
  }
  // القوة على مقام مشترك (عدد أكبر الفريقين) حتى تتسق مع نسبة الفارق إذا اختلف العدد
  const other = m.players.filter((p) => p.team !== t && !p.bench).length;
  const denom = Math.max(st.length, other, 1);
  return { score: st.length ? Math.round((total / denom) * 10) : 0, total, starters: st.length, lines };
}

export function balanceVerdict(a: TeamStrength, b: TeamStrength) {
  const max = Math.max(a.total, b.total, 0.0001);
  const pct = (Math.abs(a.total - b.total) / max) * 100;
  const label = pct < 3 ? 'متوازن تمامًا' : pct < 8 ? 'متقارب' : 'فارق واضح';
  const tone: 'good' | 'ok' | 'warn' = pct < 3 ? 'good' : pct < 8 ? 'ok' : 'warn';
  return { pct, label, tone };
}

/** نفس صيغة partitionKey في خوارزمية الموازنة */
export function matchKey(m: Match, symmetric: boolean): string {
  const ids = (t: TeamId) =>
    m.players
      .filter((p) => p.team === t)
      .map((p) => p.id)
      .sort()
      .join(',');
  const a = ids('A');
  const b = ids('B');
  if (!symmetric) return `${a}|${b}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/* ---------- تعديلات يدوية بعد التوزيع ---------- */

/** الفريق يتحدد بنصف الملعب: النصف القريب (z سالب) للفريق أ، والبعيد للفريق ب */
export function teamAt(at: Vec2): TeamId {
  return at.z < 0 ? 'A' : 'B';
}

/** يستنتج الخط من موقع اللاعب داخل نصف فريقه */
export function inferLine(at: Vec2, team: TeamId, dims: PitchDims): Pos {
  const half = dims.l / 2;
  const fromGoal = team === 'A' ? at.z + half : half - at.z; // المسافة من مرمى الفريق
  const f = fromGoal / half;
  if (f < 0.1 && Math.abs(at.x) < (dims.w / 2) * 0.4) return 'GK';
  if (f < 0.38) return 'DEF';
  if (f < 0.7) return 'MID';
  return 'ATT';
}

function freeNumber(m: Match, team: TeamId, exceptId?: string): number {
  const used = new Set(m.players.filter((p) => p.team === team && p.id !== exceptId).map((p) => p.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** يحرّك لاعبًا؛ إن عبر خط المنتصف ينتقل تلقائيًا إلى الفريق الآخر */
export function movePlayer(m: Match, id: string, at: Vec2): Match {
  const dims = pitchFor(m.teamSize);
  return {
    ...m,
    players: m.players.map((p) => {
      if (p.id !== id) return p;
      const team = teamAt(at);
      const changed = team !== p.team;
      const taken = changed && m.players.some((o) => o.team === team && o.id !== id && o.number === p.number);
      return {
        ...p,
        team,
        bench: false,
        at: { ...at },
        home: changed || p.bench ? { ...at } : p.home,
        line: inferLine(at, team, dims),
        number: taken ? freeNumber(m, team, id) : p.number,
      };
    }),
  };
}

/** ينقل لاعبًا من الدكة المحايدة إلى الملعب */
export function placePlayer(m: Match, pl: Pick<Player, 'id' | 'name' | 'pos' | 'rating' | 'number'>, at: Vec2): Match {
  if (m.players.some((p) => p.id === pl.id)) return movePlayer(m, pl.id, at);
  const dims = pitchFor(m.teamSize);
  const team = teamAt(at);
  const clash = !pl.number || m.players.some((o) => o.team === team && o.number === pl.number);
  const mp: MatchPlayer = {
    id: pl.id,
    name: pl.name,
    pos: pl.pos,
    rating: pl.rating,
    number: clash ? freeNumber(m, team) : pl.number!,
    team,
    bench: false,
    line: inferLine(at, team, dims),
    home: { ...at },
    at: { ...at },
  };
  return { ...m, players: [...m.players, mp] };
}

/** يعيد اللاعب إلى الدكة المحايدة */
export function unplacePlayer(m: Match, id: string): Match {
  return { ...m, players: m.players.filter((p) => p.id !== id) };
}

export function emptyMatch(teamSize: number, teams: Record<TeamId, TeamInfo>, formationId = 'auto'): Match {
  return { teamSize, formationId, teams: { A: { ...teams.A }, B: { ...teams.B } }, players: [], createdAt: Date.now() };
}

/** تغيير مقاس الملعب مع الحفاظ على مواقع اللاعبين النسبية */
export function resizeMatch(m: Match, teamSize: number): Match {
  const a = pitchFor(m.teamSize);
  const b = pitchFor(teamSize);
  const sc = (v: Vec2) => ({ x: (v.x * b.w) / a.w, z: (v.z * b.l) / a.l });
  return { ...m, teamSize, players: m.players.map((p) => ({ ...p, at: sc(p.at), home: sc(p.home) })) };
}

/** تبديل لاعبين: يتبادلان الفريق والموقع وخانة الاحتياط */
export function swapPlayers(m: Match, a: string, b: string): Match {
  const pa = m.players.find((p) => p.id === a);
  const pb = m.players.find((p) => p.id === b);
  if (!pa || !pb || a === b) return m;
  const take = (x: MatchPlayer) => ({ team: x.team, bench: x.bench, line: x.line, home: x.home, at: x.at });
  const sa = take(pa);
  const sb = take(pb);
  return { ...m, players: m.players.map((p) => (p.id === a ? { ...p, ...sb } : p.id === b ? { ...p, ...sa } : p)) };
}

/** نقل لاعب إلى الفريق الآخر في الموقع المقابل من الملعب */
export function switchTeam(m: Match, id: string): Match {
  return {
    ...m,
    players: m.players.map((p) => {
      if (p.id !== id) return p;
      const team: TeamId = p.team === 'A' ? 'B' : 'A';
      const mirror = (v: Vec2) => ({ x: -v.x, z: -v.z });
      return p.bench ? { ...p, team } : { ...p, team, home: mirror(p.home), at: mirror(p.at) };
    }),
  };
}
