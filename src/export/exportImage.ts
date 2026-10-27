import { balanceVerdict, pitchFor, teamStrength } from '../core/match';
import type { Match, TeamId } from '../core/types';
import { makeCamera } from '../pitch/camera';
import { DISPLAY_FONT, FONT, drawDynamic, drawStatic, type ScenePlayer } from '../pitch/render';

const W = 1080;
const H = 1350; // نسبة 4:5 مناسبة لواتساب وإنستغرام
const S = 2; // دقة مضاعفة

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, a: string, b: string) {
  // درع منقسم بلوني الفريقين مع نقطة ارتكاز ذهبية — رمز «تشكيلة»
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.86, -s * 0.62);
    ctx.lineTo(s * 0.78, s * 0.28);
    ctx.quadraticCurveTo(s * 0.5, s * 0.78, 0, s);
    ctx.quadraticCurveTo(-s * 0.5, s * 0.78, -s * 0.78, s * 0.28);
    ctx.lineTo(-s * 0.86, -s * 0.62);
    ctx.closePath();
  };
  shield();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(0, -s, s, s * 2);
  ctx.fillStyle = b;
  ctx.fillRect(-s, -s, s, s * 2);
  ctx.restore();
  shield();
  ctx.lineWidth = s * 0.09;
  ctx.strokeStyle = '#F2B84B';
  ctx.stroke();
  ctx.strokeStyle = '#F2B84B';
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.18);
  ctx.lineTo(s * 0.5, -s * 0.18);
  ctx.stroke();
  ctx.fillStyle = '#F2B84B';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.18);
  ctx.lineTo(s * 0.2, s * 0.42);
  ctx.lineTo(-s * 0.2, s * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export async function renderMatchImage(match: Match, showNumbers: boolean, title?: string): Promise<Blob> {
  try {
    await document.fonts?.ready;
  } catch {
    /* الخط الاحتياطي يكفي */
  }
  const c = document.createElement('canvas');
  c.width = W * S;
  c.height = H * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.fillStyle = '#070B0A';
  ctx.fillRect(0, 0, W, H);

  // الترويسة
  const { A, B } = match.teams;
  drawLogo(ctx, W - 92, 78, 70, A.color, B.color);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#EEF4EF';
  ctx.font = `700 46px ${DISPLAY_FONT}`;
  ctx.fillText('تشكيلة', W - 150, 86);
  ctx.fillStyle = '#93A69B';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(title?.trim() || 'مباراة اليوم', W - 150, 122);
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillStyle = '#93A69B';
  ctx.font = `500 22px ${FONT}`;
  const date = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.fillText(date, 64, 104);

  // لوحة النتيجة
  const sa = teamStrength(match, 'A');
  const sb = teamStrength(match, 'B');
  const v = balanceVerdict(sa, sb);
  const boardY = 160;
  rr(ctx, 48, boardY, W - 96, 132, 22);
  ctx.fillStyle = '#101A16';
  ctx.fill();
  ctx.strokeStyle = 'rgba(222,236,228,0.1)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const block = (t: TeamId, side: 'right' | 'left') => {
    const info = match.teams[t];
    const s = t === 'A' ? sa : sb;
    const x = side === 'right' ? W - 88 : 88;
    ctx.fillStyle = info.color;
    rr(ctx, side === 'right' ? W - 60 : 48, boardY + 24, 12, 84, 6);
    ctx.fill();
    ctx.direction = 'rtl';
    ctx.textAlign = side === 'right' ? 'right' : 'left';
    ctx.fillStyle = '#EEF4EF';
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(info.name, x, boardY + 62);
    ctx.fillStyle = '#93A69B';
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(`${s.starters} لاعبين · القوة ${s.score}`, x, boardY + 100);
  };
  block('A', 'right');
  block('B', 'left');
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = `700 40px ${DISPLAY_FONT}`;
  ctx.fillStyle = '#EEF4EF';
  ctx.fillText(`${sa.score} : ${sb.score}`, W / 2, boardY + 66);
  ctx.font = `600 21px ${FONT}`;
  ctx.fillStyle = v.tone === 'good' ? '#5BD08A' : v.tone === 'ok' ? '#F2B84B' : '#FF7A6B';
  ctx.fillText(`${v.label} · فارق ${v.pct.toFixed(1)}٪`, W / 2, boardY + 104);

  // الملعب
  const dims = pitchFor(match.teamSize);
  const bench = match.players.filter((p) => p.bench);
  const pitchTop = boardY + 150;
  const pitchBottom = bench.length ? H - 150 : H - 70;
  const rect = { x: 0, y: pitchTop * S, w: W * S, h: (pitchBottom - pitchTop) * S };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cam = makeCamera(rect, dims, { forcePortrait: true, padTop: rect.h * 0.11, padBottom: rect.h * 0.02 });
  drawStatic(ctx, cam, dims);
  const players: ScenePlayer[] = match.players
    .filter((p) => !p.bench)
    .map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      team: p.team,
      line: p.line,
      x: p.at.x,
      z: p.at.z,
      lift: 0,
      selected: false,
      locked: false,
      target: false,
    }));
  drawDynamic(ctx, cam, { dims, teams: match.teams, players, showNumbers }, S * 1.4);
  ctx.restore();

  // الاحتياط
  if (bench.length) {
    ctx.direction = 'rtl';
    for (const t of ['A', 'B'] as TeamId[]) {
      const list = bench.filter((p) => p.team === t);
      if (!list.length) continue;
      const right = t === 'A';
      const x = right ? W - 64 : 64;
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillStyle = match.teams[t].color;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(`احتياط ${match.teams[t].name}`, x, H - 104);
      ctx.fillStyle = '#C9D6CF';
      ctx.font = `500 22px ${FONT}`;
      const names = list.map((p) => p.name).join('، ');
      ctx.fillText(names.length > 40 ? names.slice(0, 39) + '…' : names, x, H - 70);
    }
  }
  // تذييل
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(147,166,155,0.7)';
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText('صُنعت بتطبيق تشكيلة · فريقان متوازنان', W / 2, H - 26);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذّر إنشاء الصورة'))), 'image/png'));
}

/** يحاول المشاركة مباشرة من الهاتف؛ وإلا يعيد false لعرض المعاينة والتنزيل */
export async function tryShare(blob: Blob, name: string): Promise<boolean> {
  try {
    const file = new File([blob], name, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'تشكيلة المباراة' });
      return true;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return true;
  }
  return false;
}
