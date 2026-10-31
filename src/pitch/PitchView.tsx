import { useEffect, useRef, useState } from 'react';
import { clampToPitch, inferLine, pitchFor, teamAt } from '../core/match';
import type { Match, Player, TeamId, Vec2 } from '../core/types';
import { makeCamera, unproject, type Camera } from './camera';
import { NEUTRAL, drawDynamic, drawStatic, hitTest, type ScenePlayer } from './render';

export type PoolPlayer = Pick<Player, 'id' | 'name' | 'pos' | 'rating' | 'number'>;

interface Props {
  match: Match | null;
  pool: PoolPlayer[]; // اللاعبون على الدكة المحايدة بجانب الملعب
  teamSize: number;
  showNumbers: boolean;
  selectedId: string | null;
  locks: Record<string, string>;
  animKey: number; // يتغير عند توزيع جديد لتشغيل حركة الدخول
  onSelect: (id: string | null) => void;
  onMove: (id: string, pos: Vec2) => void;
  onSwap: (dragged: string, target: string) => void;
  onPlace: (id: string, pos: Vec2) => void;
  onUnplace: (id: string) => void;
}

interface Drag {
  id: string;
  pointerId: number;
  sx: number;
  sy: number;
  moved: boolean;
  pos: Vec2 | null; // null = خارج الملعب
  target: string | null;
  fromPool: boolean;
  overTray: boolean;
}

const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** أيقونة نصفية صغيرة للدكة */
function MiniBust({ color = NEUTRAL }: { color?: string }) {
  return (
    <svg className="mini-bust" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="21.5" rx="9" ry="2.2" fill="rgba(0,0,0,.35)" />
      <path d="M4 21c0-4.6 2.2-7.6 8-7.6s8 3 8 7.6Z" fill={color} />
      <circle cx="12" cy="8" r="4.2" fill="#C99366" />
      <path d="M7.8 7.4c.2-2.6 2-4 4.2-4s4 1.4 4.2 4c-1.2-1-2.6-1.4-4.2-1.4S9 6.4 7.8 7.4Z" fill="#2b1d14" />
    </svg>
  );
}

export function PitchView(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [poolSel, setPoolSel] = useState<string | null>(null);
  const poolSelRef = useRef(poolSel);
  poolSelRef.current = poolSel;

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

  const dimsNow = () => pitchFor(propsRef.current.match?.teamSize ?? propsRef.current.teamSize);

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

    const dims = dimsNow();
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

    const drag = s.drag;
    const players: ScenePlayer[] = [];
    const k = reduce ? 1 : 1 - Math.exp(-dt * 9);
    for (const mp of p.match?.players ?? []) {
      if (mp.bench) continue;
      const dragging = drag?.id === mp.id && drag.moved;
      const target = dragging && drag.pos ? drag.pos : mp.at;
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
      // أثناء السحب يتبع اللون النصف الذي يقف فيه اللاعب مباشرة
      const team: TeamId = dragging ? teamAt(d) : mp.team;
      const leaving = dragging && drag.overTray;
      players.push({
        id: mp.id,
        name: mp.name,
        number: mp.number,
        team,
        line: dragging ? inferLine(d, team, dims) : mp.line,
        x: d.x,
        z: d.z,
        lift: l,
        selected: p.selectedId === mp.id || dragging,
        locked: !!p.locks[mp.id],
        target: drag?.target === mp.id,
        neutral: leaving,
      });
    }
    // لاعب يُسحب من الدكة إلى الملعب
    if (drag?.fromPool && drag.moved && drag.pos) {
      const pp = p.pool.find((x) => x.id === drag.id);
      if (pp) {
        const team = teamAt(drag.pos);
        players.push({
          id: pp.id,
          name: pp.name,
          number: pp.number ?? 0,
          team,
          line: inferLine(drag.pos, team, dims),
          x: drag.pos.x,
          z: drag.pos.z,
          lift: 1,
          selected: true,
          locked: false,
          target: false,
        });
      }
    }
    if (drag?.moved) busy = true;
    const activeHalf = drag?.moved && drag.pos && !drag.overTray && !drag.target ? teamAt(drag.pos) : null;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(s.bg, 0, 0);
    s.placed = drawDynamic(
      ctx,
      cam,
      {
        dims,
        teams: p.match?.teams ?? { A: { name: '', color: '#F4C430' }, B: { name: '', color: '#FF7A1A' } },
        players,
        showNumbers: p.showNumbers,
        activeHalf,
        halfLabels: true,
      },
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

  // إن عاد لاعب إلى الدكة نُلغي موقعه المعروض حتى يدخل من جديد بسلاسة
  useEffect(() => {
    const ids = new Set((props.match?.players ?? []).map((p) => p.id));
    for (const id of [...st.current.disp.keys()]) if (!ids.has(id)) st.current.disp.delete(id);
    if (poolSel && !props.pool.some((p) => p.id === poolSel)) setPoolSel(null);
  }, [props.match, props.pool, poolSel]);

  // إعادة الرسم عند تغيّر البيانات
  useEffect(() => {
    kick();
  });

  /* ---------- أدوات الإحداثيات ---------- */
  const toCanvas = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const dpr = st.current.dpr;
    const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    return { px: (clientX - r.left) * dpr, py: (clientY - r.top) * dpr, inside };
  };
  const overTray = (clientX: number, clientY: number) => {
    const r = trayRef.current?.getBoundingClientRect();
    return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top - 4 && clientY <= r.bottom;
  };
  const groundAt = (px: number, py: number): Vec2 | null => {
    const s = st.current;
    if (!s.cam) return null;
    const g = unproject(s.cam, px, py);
    return g ? clampToPitch(g, dimsNow()) : null;
  };
  const setTrayHot = (on: boolean) => trayRef.current?.classList.toggle('hot', on);

  /* ---------- السحب داخل الملعب ---------- */
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    if (!s.cam || s.drag) return;
    const { px, py } = toCanvas(e.clientX, e.clientY);
    const id = hitTest(s.placed, px, py);
    if (!id) {
      // لاعب محدد من الدكة + نقرة على الملعب = وضعه هناك
      const sel = poolSelRef.current;
      const g = sel ? groundAt(px, py) : null;
      if (sel && g) {
        propsRef.current.onPlace(sel, g);
        setPoolSel(null);
      } else propsRef.current.onSelect(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const mp = propsRef.current.match?.players.find((p) => p.id === id);
    s.drag = {
      id,
      pointerId: e.pointerId,
      sx: px,
      sy: py,
      moved: false,
      pos: mp ? { ...mp.at } : null,
      target: null,
      fromPool: false,
      overTray: false,
    };
  };

  const onMoveP = (e: React.PointerEvent<HTMLElement>) => {
    const s = st.current;
    const d = s.drag;
    if (!d || d.pointerId !== e.pointerId || !s.cam) return;
    const { px, py, inside } = toCanvas(e.clientX, e.clientY);
    if (!d.moved) {
      const dist = d.fromPool ? Math.hypot(e.clientX - d.sx, e.clientY - d.sy) : Math.hypot(px - d.sx, py - d.sy) / s.dpr;
      if (dist < 6) return;
      d.moved = true;
      setPoolSel(null);
    }
    d.overTray = overTray(e.clientX, e.clientY);
    setTrayHot(d.overTray && !d.fromPool);
    if (d.overTray || (d.fromPool && !inside)) {
      if (d.fromPool) d.pos = null;
      d.target = null;
    } else {
      const g = groundAt(px, py);
      if (g) d.pos = g;
      d.target = d.fromPool ? null : hitTest(s.placed, px, py, d.id);
    }
    kick();
  };

  const finish = (e: React.PointerEvent<HTMLElement>) => {
    const s = st.current;
    const d = s.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    s.drag = null;
    setTrayHot(false);
    const p = propsRef.current;
    if (d.fromPool) {
      if (!d.moved) setPoolSel((cur) => (cur === d.id ? null : d.id));
      else if (d.pos) p.onPlace(d.id, d.pos);
    } else if (!d.moved) {
      p.onSelect(p.selectedId === d.id ? null : d.id);
    } else if (d.overTray) {
      p.onUnplace(d.id);
    } else if (d.target) {
      p.onSwap(d.id, d.target);
    } else if (d.pos) {
      p.onMove(d.id, d.pos);
    }
    kick();
  };

  const onCancel = () => {
    st.current.drag = null;
    setTrayHot(false);
    kick();
  };

  /* ---------- السحب من الدكة ---------- */
  const onChipDown = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = st.current;
    if (s.drag || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.drag = {
      id,
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      pos: null,
      target: null,
      fromPool: true,
      overTray: true,
    };
  };

  const { pool, match } = props;

  return (
    <div className="pitch-card">
      <div ref={wrapRef} className="pitch-wrap">
        <canvas
          ref={canvasRef}
          className="pitch-canvas"
          role="img"
          aria-label="ملعب التشكيلة. ضع اللاعب في نصف الملعب العلوي أو السفلي فيأخذ لون ذلك الفريق، واسحبه إلى الدكة لإخراجه."
          onPointerDown={onDown}
          onPointerMove={onMoveP}
          onPointerUp={finish}
          onPointerCancel={onCancel}
          onLostPointerCapture={() => st.current.drag && !st.current.drag.fromPool && onCancel()}
        />
      </div>
      <div ref={trayRef} className="touchline" aria-label="الدكة بجانب الملعب">
        <div className="touchline-head">
          <span>
            الدكة <b className="num">{pool.length}</b>
          </span>
          <small>{poolSel ? 'اضغط على النصف الذي تريده في الملعب' : pool.length ? 'اسحب اللاعب إلى نصف فريقه' : match?.players.length ? 'اسحب لاعبًا إلى هنا لإخراجه من الملعب' : ''}</small>
        </div>
        {pool.length > 0 ? (
          <div className="touchline-list">
            {pool.map((pl) => (
              <button
                key={pl.id}
                type="button"
                className={`pool-chip ${poolSel === pl.id ? 'on' : ''}`}
                aria-pressed={poolSel === pl.id}
                onPointerDown={onChipDown(pl.id)}
                onPointerMove={onMoveP}
                onPointerUp={finish}
                onPointerCancel={onCancel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPoolSel((cur) => (cur === pl.id ? null : pl.id));
                  }
                }}
              >
                <MiniBust />
                <span className="pool-name">{pl.name}</span>
                <span className="pool-rating num">{pl.rating}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="touchline-empty">{match?.players.length ? 'كل الحاضرين في الملعب.' : 'لا يوجد لاعبون حاضرون. أضفهم من تبويب «اللاعبون».'}</p>
        )}
      </div>
    </div>
  );
}
