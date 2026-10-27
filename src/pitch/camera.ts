/**
 * كاميرا منظور حقيقية بسيطة: تُسقط نقاط الملعب ثلاثية الأبعاد على الشاشة
 * وتعكس الإسقاط (من الشاشة إلى أرض الملعب) لدعم السحب.
 * في الوضع العمودي يمتد طول الملعب نحو عمق الشاشة، وفي الأفقي يمتد عرضيًا.
 */
import type { PitchDims } from '../core/match';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Camera {
  portrait: boolean;
  tilt: number;
  cosT: number;
  sinT: number;
  cy0: number; // ارتفاع الكاميرا
  cz0: number; // موقعها على محور العمق
  scale: number;
  ox: number;
  oy: number;
  unit: number; // ارتفاع اللاعب بالأمتار "المضخَّمة" ليظهر بحجم مريح
  rect: Rect;
}

export interface Projected {
  sx: number;
  sy: number;
  depth: number;
  k: number; // بكسل لكل متر عند هذه النقطة
}

/** تحويل إحداثيات الملعب إلى إحداثيات المشهد المحلية */
function local(x: number, z: number, portrait: boolean): [number, number] {
  // في الوضع الأفقي يكون الفريق أ يمينًا ليتطابق مع لوحة النتيجة العربية
  return portrait ? [x, z] : [-z, x];
}

export function project(cam: Camera, x: number, y: number, z: number): Projected {
  const [X, Z] = local(x, z, cam.portrait);
  const py = y - cam.cy0;
  const pz = Z - cam.cz0;
  const cy = py * cam.cosT + pz * cam.sinT;
  const cz = -py * cam.sinT + pz * cam.cosT;
  const d = Math.max(cz, 0.01);
  return { sx: cam.ox + (X / d) * cam.scale, sy: cam.oy + (-cy / d) * cam.scale, depth: d, k: cam.scale / d };
}

/** من نقطة على الشاشة إلى نقطة على أرض الملعب */
export function unproject(cam: Camera, px: number, py: number): { x: number; z: number } | null {
  const sx = (px - cam.ox) / cam.scale;
  const sy = (py - cam.oy) / cam.scale;
  const dy = -sy * cam.cosT - cam.sinT;
  const dz = -sy * cam.sinT + cam.cosT;
  if (dy >= -1e-6) return null;
  const t = -cam.cy0 / dy;
  const X = sx * t;
  const Z = cam.cz0 + dz * t;
  return cam.portrait ? { x: X, z: Z } : { x: Z, z: -X };
}

export interface CameraOpts {
  tiltBoost?: number; // زيادة الميل أثناء حركة الافتتاح
  padTop?: number;
  padBottom?: number;
  padSide?: number;
  forcePortrait?: boolean;
}

export function makeCamera(rect: Rect, dims: PitchDims, opts: CameraOpts = {}): Camera {
  const portrait = opts.forcePortrait ?? rect.h > rect.w * 0.95;
  const depthLen = portrait ? dims.l : dims.w;
  const latLen = portrait ? dims.w : dims.l;
  const tilt = ((portrait ? 56 : 44) + (opts.tiltBoost ?? 0)) * (Math.PI / 180);
  const dist = portrait ? Math.max(depthLen * 1.7, latLen * 1.6) : Math.max(depthLen * 1.35, latLen * 0.78);
  const cam: Camera = {
    portrait,
    tilt,
    cosT: Math.cos(tilt),
    sinT: Math.sin(tilt),
    cy0: dist * Math.sin(tilt),
    cz0: -dist * Math.cos(tilt),
    scale: 1,
    ox: 0,
    oy: 0,
    unit: 1,
    rect,
  };
  // ملاءمة حدود الملعب (مع هامش للمدرجات والمرميين) داخل المساحة المتاحة
  const m = Math.max(2.5, dims.l * 0.035);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, z] of [
    [-dims.w / 2 - m, -dims.l / 2 - m],
    [dims.w / 2 + m, -dims.l / 2 - m],
    [-dims.w / 2 - m, dims.l / 2 + m],
    [dims.w / 2 + m, dims.l / 2 + m],
  ]) {
    const p = project(cam, x, 0, z);
    xs.push(p.sx);
    ys.push(p.sy);
  }
  const minDim = Math.min(rect.w, rect.h);
  const padTop = opts.padTop ?? minDim * 0.12;
  const padBottom = opts.padBottom ?? minDim * 0.04;
  const padSide = opts.padSide ?? minDim * 0.03;
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min((rect.w - padSide * 2) / bw, (rect.h - padTop - padBottom) / bh);
  cam.scale = scale;
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  cam.ox = rect.x + rect.w / 2 - midX * scale;
  cam.oy = rect.y + padTop + (rect.h - padTop - padBottom - bh * scale) / 2 - Math.min(...ys) * scale;
  // حجم اللاعب في مركز الملعب بالبكسل
  const center = project(cam, 0, 0, 0);
  const target = Math.max(28, portrait ? minDim * 0.105 : rect.h * 0.11);
  cam.unit = target / center.k;
  return cam;
}
