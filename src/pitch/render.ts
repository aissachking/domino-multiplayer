/**
 * رسم المشهد: مدرجات، عشب، خطوط، مرميان، ومجسمات اللاعبين.
 * طبقة مستقلة يمكن استبدالها لاحقًا بمحرك WebGL دون لمس بقية التطبيق.
 */
import type { PitchDims } from '../core/match';
import type { Pos, TeamId, TeamInfo } from '../core/types';
import { project, type Camera } from './camera';

export const FONT = '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif';
export const DISPLAY_FONT = '"Reem Kufi", "IBM Plex Sans Arabic", "Noto Kufi Arabic", Tahoma, sans-serif';

export interface ScenePlayer {
  id: string;
  name: string;
  number: number;
  team: TeamId;
  line: Pos;
  x: number;
  z: number;
  lift: number; // 0..1 أثناء السحب
  selected: boolean;
  locked: boolean;
  target: boolean; // هدف التبديل تحت اللاعب المسحوب
}

export interface SceneState {
  dims: PitchDims;
  teams: Record<TeamId, TeamInfo>;
  players: ScenePlayer[];
  showNumbers: boolean;
}

/* ---------- ألوان ---------- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function dist(a: string, b: string) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const KEEPER = ['#2FBF71', '#FFB000', '#00B8D4', '#E040FB', '#C6E03A'];
export function keeperColor(team: TeamId, teams: Record<TeamId, TeamInfo>): string {
  const ok = KEEPER.filter((c) => dist(c, teams.A.color) > 140 && dist(c, teams.B.color) > 140);
  const list = ok.length >= 2 ? ok : KEEPER;
  // حارسا الفريقين بلونين مختلفين دائمًا
  return team === 'A' ? list[0] : list[1];
}

const SKINS = ['#E8B98F', '#C99366', '#A8754D', '#8A5A3B', '#F0C8A2', '#B98457'];
const HAIR = ['#17110d', '#2b1d14', '#3d2b1d', '#0f0d0c'];
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* ---------- خلفية ثابتة (تُخزَّن مؤقتًا) ---------- */

let grassPattern: CanvasPattern | null = null;
function grass(ctx: CanvasRenderingContext2D) {
  if (grassPattern) return grassPattern;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 160;
    const y = rnd() * 160;
    const l = rnd();
    g.fillStyle = l > 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.08})` : `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
    g.fillRect(x, y, 1 + rnd() * 1.4, 1 + rnd() * 2.6);
  }
  grassPattern = ctx.createPattern(c, 'repeat');
  return grassPattern;
}

function poly(ctx: CanvasRenderingContext2D, cam: Camera, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, z], i) => {
    const p = project(cam, x, 0, z);
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  });
  ctx.closePath();
}

function strokeGround(ctx: CanvasRenderingContext2D, cam: Camera, pts: [number, number][], close = false, width = 0.12) {
  // عرض الخط يتبع العمق ليبدو مرسومًا على الأرض
  const mid = pts[Math.floor(pts.length / 2)];
  const k = project(cam, mid[0], 0, mid[1]).k;
  ctx.lineWidth = Math.max(1, width * k);
  ctx.beginPath();
  pts.forEach(([x, z], i) => {
    const p = project(cam, x, 0, z);
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 40): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

function markings(dims: PitchDims) {
  const W = dims.w / 2;
  const L = dims.l / 2;
  const s = dims.l / 105;
  const sw = dims.w / 68;
  const lines: [number, number][][] = [];
  const closed: [number, number][][] = [];
  closed.push([
    [-W, -L],
    [W, -L],
    [W, L],
    [-W, L],
  ]);
  lines.push([
    [-W, 0],
    [W, 0],
  ]);
  const cr = dims.kind === 'futsal' ? 3 : 9.15 * s;
  closed.push(arc(0, 0, cr, 0, Math.PI * 2, 64));
  for (const side of [-1, 1]) {
    const gl = side * L;
    const pa = dims.kind === 'futsal' ? { d: 6, w: 7 } : { d: 16.5 * s, w: 20.15 * sw };
    const ga = dims.kind === 'futsal' ? null : { d: 5.5 * s, w: 9.16 * sw };
    lines.push([
      [-pa.w, gl],
      [-pa.w, gl - side * pa.d],
      [pa.w, gl - side * pa.d],
      [pa.w, gl],
    ]);
    if (ga)
      lines.push([
        [-ga.w, gl],
        [-ga.w, gl - side * ga.d],
        [ga.w, gl - side * ga.d],
        [ga.w, gl],
      ]);
    if (dims.kind !== 'futsal') {
      const spot = gl - side * 11 * s;
      const r = 9.15 * s;
      const edge = gl - side * pa.d;
      const dz = Math.abs(edge - spot);
      if (dz < r) {
        const ang = Math.acos(dz / r);
        const base = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        lines.push(arc(0, spot, r, base - ang, base + ang, 24));
      }
    }
    // أقواس الركنيات
    for (const sx of [-1, 1]) {
      const a0 = Math.atan2(-side, -sx);
      lines.push(arc(sx * W, gl, 1 * s + 0.4, a0 - Math.PI / 4, a0 + Math.PI / 4, 8));
    }
  }
  return { lines, closed, spots: [0, -(L - 11 * s), L - 11 * s] };
}

function goalSize(dims: PitchDims) {
  if (dims.kind === 'full') return { w: 7.32, h: 2.44, d: 2 };
  if (dims.kind === 'seven') return { w: 5, h: 2, d: 1.5 };
  return { w: 3, h: 2, d: 1.2 };
}

function drawGoal(ctx: CanvasRenderingContext2D, cam: Camera, dims: PitchDims, side: -1 | 1) {
  const g = goalSize(dims);
  const z0 = (side * dims.l) / 2;
  const z1 = z0 + side * g.d;
  const hw = g.w / 2;
  const P = (x: number, y: number, z: number) => project(cam, x, y, z);
  const k = P(0, 0, z0).k;
  // ظل المرمى على العشب
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  for (const [x, z] of [
    [-hw, z0],
    [hw, z0],
    [hw + 0.6, z1],
    [-hw + 0.6, z1],
  ] as [number, number][]) {
    const p = P(x, 0, z);
    ctx.lineTo(p.sx, p.sy);
  }
  ctx.fill();
  // الشباك
  ctx.strokeStyle = 'rgba(235,240,236,0.22)';
  ctx.lineWidth = Math.max(0.6, 0.03 * k);
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const x = -hw + (g.w * i) / N;
    const a = P(x, g.h, z0);
    const b = P(x, g.h * 0.85, z1);
    const c = P(x, 0, z1);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.stroke();
  }
  for (let j = 0; j <= 5; j++) {
    const y = (g.h * 0.85 * j) / 5;
    ctx.beginPath();
    const a = P(-hw, y, z1);
    const b = P(hw, y, z1);
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  // القائمان والعارضة
  ctx.strokeStyle = '#F6F7F2';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 0.16 * k);
  ctx.beginPath();
  const bl = P(-hw, 0, z0);
  const tl = P(-hw, g.h, z0);
  const tr = P(hw, g.h, z0);
  const br = P(hw, 0, z0);
  ctx.moveTo(bl.sx, bl.sy);
  ctx.lineTo(tl.sx, tl.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.lineTo(br.sx, br.sy);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

export function drawStatic(ctx: CanvasRenderingContext2D, cam: Camera, dims: PitchDims) {
  const { x, y, w, h } = cam.rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // ليل الملعب
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#0B1411');
  bg.addColorStop(0.5, '#0A1412');
  bg.addColorStop(1, '#060A09');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // المدرجات وجمهور خافت
  const W = dims.w / 2;
  const L = dims.l / 2;
  const st = Math.max(14, dims.l * 0.45);
  poly(ctx, cam, [
    [-W - st, -L - st],
    [W + st, -L - st],
    [W + st, L + st],
    [-W - st, L + st],
  ]);
  ctx.fillStyle = '#0D1714';
  ctx.fill();
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const crowd = ['rgba(215,38,61,0.22)', 'rgba(27,127,224,0.22)', 'rgba(240,236,220,0.14)', 'rgba(242,184,75,0.18)'];
  for (let i = 0; i < 1600; i++) {
    const side = Math.floor(rnd() * 4);
    const t = rnd() * 2 - 1;
    const d = 1.5 + Math.pow(rnd(), 1.6) * (st - 2);
    let px: number;
    let pz: number;
    if (side === 0) [px, pz] = [t * (W + st), -L - d];
    else if (side === 1) [px, pz] = [t * (W + st), L + d];
    else if (side === 2) [px, pz] = [-W - d, t * (L + st)];
    else [px, pz] = [W + d, t * (L + st)];
    const p = project(cam, px, 0, pz);
    if (p.sx < x || p.sx > x + w || p.sy < y || p.sy > y + h) continue;
    ctx.fillStyle = crowd[Math.floor(rnd() * crowd.length)];
    const r = Math.max(0.8, 0.28 * p.k);
    ctx.fillRect(p.sx - r / 2, p.sy - r, r, r * 1.6);
  }

  // محيط العشب
  const m = Math.max(2.5, dims.l * 0.035);
  poly(ctx, cam, [
    [-W - m, -L - m],
    [W + m, -L - m],
    [W + m, L + m],
    [-W - m, L + m],
  ]);
  ctx.fillStyle = '#1E5A33';
  ctx.fill();

  // خطوط القص المتناوبة
  const bands = dims.kind === 'full' ? 14 : dims.kind === 'seven' ? 10 : 8;
  for (let i = 0; i < bands; i++) {
    const z0 = -L + (dims.l * i) / bands;
    const z1 = -L + (dims.l * (i + 1)) / bands;
    poly(ctx, cam, [
      [-W, z0],
      [W, z0],
      [W, z1],
      [-W, z1],
    ]);
    ctx.fillStyle = i % 2 ? '#2B7A42' : '#25703C';
    ctx.fill();
  }
  // ملمس العشب
  poly(ctx, cam, [
    [-W - m, -L - m],
    [W + m, -L - m],
    [W + m, L + m],
    [-W - m, L + m],
  ]);
  ctx.save();
  ctx.clip();
  const pat = grass(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
  // إضاءة الكشافات
  const near = project(cam, 0, 0, cam.portrait ? -L : 0);
  const far = project(cam, 0, 0, cam.portrait ? L : 0);
  const depthGrad = ctx.createLinearGradient(0, far.sy - h * 0.1, 0, near.sy);
  depthGrad.addColorStop(0, 'rgba(4,10,8,0.45)');
  depthGrad.addColorStop(0.55, 'rgba(4,10,8,0.05)');
  depthGrad.addColorStop(1, 'rgba(4,10,8,0.2)');
  ctx.fillStyle = depthGrad;
  ctx.fillRect(x, y, w, h);
  const c = project(cam, 0, 0, 0);
  const glow = ctx.createRadialGradient(c.sx, c.sy, 0, c.sx, c.sy, Math.max(w, h) * 0.55);
  glow.addColorStop(0, 'rgba(255,246,214,0.16)');
  glow.addColorStop(1, 'rgba(255,246,214,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // الخطوط
  const mk = markings(dims);
  ctx.strokeStyle = 'rgba(244,248,240,0.82)';
  ctx.lineJoin = 'round';
  for (const pts of mk.closed) strokeGround(ctx, cam, pts, true);
  for (const pts of mk.lines) strokeGround(ctx, cam, pts);
  ctx.fillStyle = 'rgba(244,248,240,0.9)';
  for (const z of mk.spots) {
    const p = project(cam, 0, 0, z);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, Math.max(1.5, 0.22 * p.k), Math.max(1, 0.22 * p.k * cam.sinT), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // المرمى البعيد (أو كلاهما في الوضع الأفقي)
  drawGoal(ctx, cam, dims, 1);
  if (!cam.portrait) drawGoal(ctx, cam, dims, -1);
  ctx.restore();
}

/* ---------- اللاعبون ---------- */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

interface Placed {
  p: ScenePlayer;
  sx: number;
  sy: number;
  H: number;
  depth: number;
}

export function placePlayers(cam: Camera, players: ScenePlayer[]): Placed[] {
  return players
    .map((p) => {
      const pr = project(cam, p.x, 0, p.z);
      return { p, sx: pr.sx, sy: pr.sy, H: cam.unit * pr.k, depth: pr.depth };
    })
    .sort((a, b) => b.depth - a.depth);
}

function drawShadow(ctx: CanvasRenderingContext2D, q: Placed) {
  const { sx, sy, H } = q;
  const lift = q.p.lift;
  const spread = 1 + lift * 0.5;
  ctx.save();
  ctx.translate(sx + H * 0.1, sy + H * 0.01);
  ctx.scale(1, 0.32);
  const r = H * 0.34 * spread;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(0,0,0,${0.55 - lift * 0.25})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** مجسم نصفي: قاعدة دائرية بلون الفريق، وعليها الكتفان بالقميص والرقم ثم الرأس */
function drawFigure(ctx: CanvasRenderingContext2D, q: Placed, st: SceneState) {
  const { p, sx, H } = q;
  const u = H * 1.22; // المجسم النصفي أقصر، فنكبّره ليبقى واضحًا
  const lift = p.lift * H * 0.16;
  const team = st.teams[p.team];
  const kit = p.line === 'GK' ? keeperColor(p.team, st.teams) : team.color;
  const light = luminance(kit) > 0.62;
  const hs = hash(p.id);
  const skin = SKINS[hs % SKINS.length];
  const hair = HAIR[(hs >>> 4) % HAIR.length];

  // القاعدة على العشب
  const bx = sx;
  const by = q.sy - lift;
  const rx = u * 0.3;
  const ry = rx * 0.36;
  const th = u * 0.06; // سماكة القاعدة
  ctx.save();
  ctx.fillStyle = shade(team.color, -0.55);
  ctx.beginPath();
  ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(bx - rx, by - th);
  ctx.ellipse(bx, by - th, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  const top = ctx.createLinearGradient(bx - rx, 0, bx + rx, 0);
  top.addColorStop(0, shade(team.color, 0.15));
  top.addColorStop(1, shade(team.color, -0.3));
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(bx, by - th, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(6,10,9,0.55)';
  ctx.beginPath();
  ctx.ellipse(bx, by - th, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // حلقة التحديد حول القاعدة
  if (p.selected || p.target) {
    ctx.save();
    ctx.strokeStyle = p.target ? '#FFFFFF' : '#F2B84B';
    ctx.lineWidth = Math.max(2, u * 0.045);
    ctx.shadowColor = p.target ? 'rgba(255,255,255,0.8)' : 'rgba(242,184,75,0.9)';
    ctx.shadowBlur = u * 0.25;
    ctx.beginPath();
    ctx.ellipse(bx, by - th / 2, rx * 1.18, ry * 1.25, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // الكتفان والصدر
  const base = by - th - ry * 0.2;
  const sh = base - u * 0.36; // ارتفاع الكتفين
  const w = u * 0.27;
  const bust = () => {
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.92, base);
    ctx.lineTo(sx - w, sh + u * 0.1);
    ctx.quadraticCurveTo(sx - w, sh, sx - w * 0.62, sh - u * 0.015);
    ctx.lineTo(sx - u * 0.06, sh - u * 0.03);
    ctx.lineTo(sx + u * 0.06, sh - u * 0.03);
    ctx.lineTo(sx + w * 0.62, sh - u * 0.015);
    ctx.quadraticCurveTo(sx + w, sh, sx + w, sh + u * 0.1);
    ctx.lineTo(sx + w * 0.92, base);
    ctx.quadraticCurveTo(sx, base + ry * 0.5, sx - w * 0.92, base);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(sx - w, 0, sx + w, 0);
  g.addColorStop(0, shade(kit, 0.25));
  g.addColorStop(0.45, kit);
  g.addColorStop(1, shade(kit, -0.4));
  ctx.fillStyle = g;
  bust();
  ctx.fill();
  // ظل خفيف أسفل الصدر لإحساس الحجم
  const v = ctx.createLinearGradient(0, sh, 0, base);
  v.addColorStop(0, 'rgba(255,255,255,0.10)');
  v.addColorStop(0.6, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = v;
  bust();
  ctx.fill();
  // خطوط الأكمام
  ctx.strokeStyle = shade(kit, light ? -0.35 : 0.4);
  ctx.lineWidth = Math.max(1, u * 0.018);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx + side * w * 0.66, sh + u * 0.005);
    ctx.quadraticCurveTo(sx + side * w * 0.6, sh + u * 0.12, sx + side * w * 0.72, base - u * 0.02);
    ctx.stroke();
  }

  // الرقبة والياقة
  ctx.fillStyle = shade(skin, -0.18);
  ctx.beginPath();
  ctx.roundRect(sx - u * 0.055, sh - u * 0.1, u * 0.11, u * 0.12, u * 0.03);
  ctx.fill();
  ctx.fillStyle = shade(kit, light ? -0.45 : 0.5);
  ctx.beginPath();
  ctx.moveTo(sx - u * 0.07, sh - u * 0.03);
  ctx.lineTo(sx, sh + u * 0.06);
  ctx.lineTo(sx + u * 0.07, sh - u * 0.03);
  ctx.lineTo(sx + u * 0.045, sh - u * 0.03);
  ctx.lineTo(sx, sh + u * 0.03);
  ctx.lineTo(sx - u * 0.045, sh - u * 0.03);
  ctx.closePath();
  ctx.fill();

  // الرقم
  if (st.showNumbers && u > 20) {
    ctx.fillStyle = light ? 'rgba(20,24,30,0.92)' : 'rgba(255,255,255,0.96)';
    ctx.font = `700 ${Math.round(u * 0.2)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), sx, sh + u * 0.19);
  }

  // الرأس
  const hr = u * 0.13;
  const hy = sh - u * 0.17;
  for (const side of [-1, 1]) {
    ctx.fillStyle = shade(skin, -0.12);
    ctx.beginPath();
    ctx.ellipse(sx + side * hr * 0.98, hy + hr * 0.1, hr * 0.2, hr * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const hg = ctx.createRadialGradient(sx - hr * 0.35, hy - hr * 0.35, hr * 0.1, sx, hy, hr * 1.05);
  hg.addColorStop(0, shade(skin, 0.2));
  hg.addColorStop(1, shade(skin, -0.25));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(sx, hy, hr * 0.92, hr, 0, 0, Math.PI * 2);
  ctx.fill();
  // الشعر: الجزء العلوي من الرأس مقصوص بشكله
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(sx, hy, hr * 0.94, hr * 1.02, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(sx - hr, hy - hr * 1.1);
  ctx.lineTo(sx + hr, hy - hr * 1.1);
  ctx.lineTo(sx + hr, hy - hr * 0.05);
  ctx.quadraticCurveTo(sx + hr * 0.55, hy - hr * 0.5, sx, hy - hr * 0.42);
  ctx.quadraticCurveTo(sx - hr * 0.55, hy - hr * 0.5, sx - hr, hy - hr * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, q: Placed, st: SceneState, dpr: number) {
  const { p, sx, H } = q;
  const top = q.sy - p.lift * H * 0.16 - H * 1.02;
  const fs = Math.round(Math.max(10.5 * dpr, Math.min(H * 0.2, 15 * dpr)));
  ctx.font = `600 ${fs}px ${FONT}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name;
  const tw = ctx.measureText(name).width;
  const padX = fs * 0.55;
  const bw = tw + padX * 2;
  const bh = fs * 1.55;
  const bx = sx - bw / 2;
  const by = top - bh;
  ctx.fillStyle = 'rgba(6,10,9,0.78)';
  rr(ctx, bx, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = st.teams[p.team].color;
  rr(ctx, bx + bh * 0.28, by + bh * 0.28, bh * 0.16, bh * 0.44, bh * 0.08);
  ctx.fill();
  ctx.fillStyle = '#F4F7F2';
  ctx.fillText(name, sx + bh * 0.06, by + bh / 2 + fs * 0.04);
  if (p.locked) {
    ctx.fillStyle = '#F2B84B';
    ctx.beginPath();
    ctx.arc(bx + bw - bh * 0.1, by + bh * 0.1, bh * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1206';
    ctx.fillRect(bx + bw - bh * 0.1 - bh * 0.06, by + bh * 0.02, bh * 0.12, bh * 0.16);
  }
  ctx.direction = 'ltr';
}

export function drawDynamic(ctx: CanvasRenderingContext2D, cam: Camera, st: SceneState, dpr: number): Placed[] {
  const placed = placePlayers(cam, st.players);
  ctx.save();
  const { x, y, w, h } = cam.rect;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (const q of placed) drawShadow(ctx, q);
  for (const q of placed) drawFigure(ctx, q, st);
  if (cam.portrait) drawGoal(ctx, cam, st.dims, -1);
  for (const q of placed) drawLabel(ctx, q, st, dpr);
  // تعتيم الأطراف بلمسة سينمائية
  const vg = ctx.createRadialGradient(x + w / 2, y + h * 0.55, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  return placed;
}

/** أي لاعب تحت المؤشر؟ الأقرب إلى الكاميرا أولًا */
export function hitTest(placed: Placed[], px: number, py: number, exclude?: string): string | null {
  for (let i = placed.length - 1; i >= 0; i--) {
    const q = placed[i];
    if (q.p.id === exclude) continue;
    const { sx, sy, H } = q;
    if (px >= sx - H * 0.38 && px <= sx + H * 0.38 && py >= sy - H * 1.2 && py <= sy + H * 0.12) return q.p.id;
  }
  return null;
}
