import { useEffect, useRef } from 'react';
import { clampToPitch, pitchFor } from '../core/match';
import type { Match, Vec2 } from '../core/types';
import { makeCamera, unproject, type Camera } from './camera';
import { drawDynamic, drawStatic, hitTest, type ScenePlayer } from './render';

interface Props {
  match: Match | null;
  showNumbers: boolean;
  selectedId: string | null;
  locks: Record<string, string>;
  animKey: number; // يتغير عند توزيع جديد لتشغيل حركة الدخول
  onSelect: (id: string | null) => void;
  onMove: (id: string, pos: Vec2) => void;
  onSwap: (dragged: string, target: string) => void;
}

interface Drag {
  id: string;
  pointerId: number;
  sx: number;
  sy: number;
  moved: boolean;
  pos: Vec2;
  target: string | null;
}

const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function PitchView(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const st = useRef({
    disp: new Map<string, { x: number; z: number; delay: number }>(),
    lift: new Map<string, number>(),
    drag: null as Drag | null,
    cam: null as Camera | null,
    placed: [] as ReturnType<typeof drawDynamic>,
    bg: null as HTMLCanvasElement | null,
    bgKey: '',
    intro: 1, // 1 → 0
    introStart: 0,
    raf: 0,
    last: 0,
    w: 0,
    h: 0,
    dpr: 1,
    animKey: -1,
  });

  const kick = () => {
    const s = st.current;
    if (!s.raf) {
      s.last = performance.now();
      s.raf = requestAnimationFrame(frame);
    }
  };

  function frame(now: number) {
    const s = st.current;
    s.raf = 0;
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    const canvas = canvasRef.current;
    const p = propsRef.current;
    if (!canvas || !s.w) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = reduceMotion();
    let busy = false;

    const dims = pitchFor(p.match?.teamSize ?? 7);
    if (s.intro > 0) {
      // مبني على الوقت الفعلي حتى ينتهي في موعده حتى على الأجهزة البطيئة
      if (!s.introStart) s.introStart = now;
      s.intro = reduce ? 0 : Math.max(0, 1 - (now - s.introStart) / 1300);
      busy = true;
    }
    const e = 1 - Math.pow(1 - (1 - s.intro), 3);
    const tiltBoost = (1 - e) * 26;

    const rect = { x: 0, y: 0, w: s.w * s.dpr, h: s.h * s.dpr };
    const cam = makeCamera(rect, dims, { tiltBoost });
    s.cam = cam;

    // الطبقة الثابتة مخزنة ولا تُعاد إلا عند تغيّر الحجم أو الكاميرا
    const key = `${rect.w}x${rect.h}:${dims.kind}:${tiltBoost.toFixed(2)}`;
    if (s.bgKey !== key || !s.bg) {
      s.bg = s.bg ?? document.createElement('canvas');
      s.bg.width = rect.w;
      s.bg.height = rect.h;
      drawStatic(s.bg.getContext('2d')!, cam, dims);
      s.bgKey = key;
    }

    const players: ScenePlayer[] = [];
    const k = reduce ? 1 : 1 - Math.exp(-dt * 9);
    for (const mp of p.match?.players ?? []) {
      if (mp.bench) continue;
      const dragging = s.drag?.id === mp.id && s.drag.moved;
      const target = dragging ? s.drag!.pos : mp.at;
      let d = s.disp.get(mp.id);
      if (!d) {
        d = { x: target.x, z: target.z, delay: 0 };
        s.disp.set(mp.id, d);
      }
      if (d.delay > 0) {
        d.delay -= dt;
        busy = true;
      } else if (dragging) {
        d.x = target.x;
        d.z = target.z;
      } else {
        d.x += (target.x - d.x) * k;
        d.z += (target.z - d.z) * k;
        if (Math.abs(target.x - d.x) + Math.abs(target.z - d.z) > 0.02) busy = true;
        else {
          d.x = target.x;
          d.z = target.z;
        }
      }
      const lt = dragging ? 1 : 0;
      let l = s.lift.get(mp.id) ?? 0;
      l += (lt - l) * (reduce ? 1 : 1 - Math.exp(-dt * 14));
      if (Math.abs(lt - l) > 0.01) busy = true;
      else l = lt;
      s.lift.set(mp.id, l);
      players.push({
        id: mp.id,
        name: mp.name,
        number: mp.number,
        team: mp.team,
        line: mp.line,
        x: d.x,
        z: d.z,
        lift: l,
        selected: p.selectedId === mp.id || dragging,
        locked: !!p.locks[mp.id],
        target: s.drag?.target === mp.id,
      });
    }
    if (s.drag?.moved) busy = true;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(s.bg, 0, 0);
    s.placed = drawDynamic(
      ctx,
      cam,
      { dims, teams: p.match?.teams ?? { A: { name: '', color: '#D7263D' }, B: { name: '', color: '#1B7FE0' } }, players, showNumbers: p.showNumbers },
      s.dpr,
    );
    // نقاط اللاعبين على الشاشة (تُستخدم في الاختبارات الآلية)
    (window as unknown as { __mizanPlaced?: unknown }).__mizanPlaced = s.placed.map((q) => ({
      id: q.p.id,
      x: q.sx / s.dpr,
      y: q.sy / s.dpr,
      h: q.H / s.dpr,
    }));
    if (busy) kick();
  }

  // تغيّر الحجم
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const s = st.current;
      const r = wrap.getBoundingClientRect();
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.w = Math.max(1, Math.round(r.width));
      s.h = Math.max(1, Math.round(r.height));
      canvas.width = s.w * s.dpr;
      canvas.height = s.h * s.dpr;
      canvas.style.width = `${s.w}px`;
      canvas.style.height = `${s.h}px`;
      kick();
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(st.current.raf);
      st.current.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // حركة دخول اللاعبين عند توزيع جديد
  useEffect(() => {
    const s = st.current;
    if (s.animKey === props.animKey) return;
    const first = s.animKey === -1;
    s.animKey = props.animKey;
    if (first || reduceMotion()) {
      s.disp.clear();
      kick();
      return;
    }
    const list = (props.match?.players ?? []).filter((p) => !p.bench);
    list.forEach((p, i) => {
      s.disp.set(p.id, { x: (i % 2 ? 1 : -1) * 1.5, z: p.team === 'A' ? -1 : 1, delay: i * 0.03 });
    });
    kick();
  }, [props.animKey, props.match]);

  // إعادة الرسم عند تغيّر البيانات
  useEffect(() => {
    kick();
  });

  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const dpr = st.current.dpr;
    return { px: (e.clientX - r.left) * dpr, py: (e.clientY - r.top) * dpr };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    if (!s.cam || s.drag) return;
    const { px, py } = local(e);
    const id = hitTest(s.placed, px, py);
    if (!id) {
      propsRef.current.onSelect(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const mp = propsRef.current.match?.players.find((p) => p.id === id);
    s.drag = { id, pointerId: e.pointerId, sx: px, sy: py, moved: false, pos: mp ? { ...mp.at } : { x: 0, z: 0 }, target: null };
  };

  const onMoveP = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    const d = s.drag;
    if (!d || d.pointerId !== e.pointerId || !s.cam) return;
    const { px, py } = local(e);
    if (!d.moved && Math.hypot(px - d.sx, py - d.sy) < 6 * s.dpr) return;
    d.moved = true;
    // نرفع نقطة الإمساك قليلًا حتى لا يغطي الإصبع اللاعب
    const g = unproject(s.cam, px, py);
    if (g) d.pos = clampToPitch(g, pitchFor(propsRef.current.match?.teamSize ?? 7));
    d.target = hitTest(s.placed, px, py, d.id);
    kick();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    const d = s.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    s.drag = null;
    const p = propsRef.current;
    if (!d.moved) {
      p.onSelect(p.selectedId === d.id ? null : d.id);
    } else if (d.target) {
      p.onSwap(d.id, d.target);
    } else {
      p.onMove(d.id, d.pos);
    }
    kick();
  };

  const onCancel = () => {
    st.current.drag = null;
    kick();
  };

  return (
    <div ref={wrapRef} className="pitch-wrap">
      <canvas
        ref={canvasRef}
        className="pitch-canvas"
        role="img"
        aria-label="ملعب التشكيلة. اسحب أي لاعب لتغيير موقعه، أو أفلته فوق لاعب آخر لتبديلهما."
        onPointerDown={onDown}
        onPointerMove={onMoveP}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={() => st.current.drag && onCancel()}
      />
    </div>
  );
}
