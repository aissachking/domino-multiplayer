import { useState } from 'react';
import { POS_LABEL, type Player, type Pos, type TeamId } from '../core/types';
import { IconEdit, IconMinus, IconPin, IconPlus, IconTrash } from './icons';

const POSITIONS: Pos[] = ['GK', 'DEF', 'MID', 'ATT'];

interface Draft {
  name: string;
  pos: Pos;
  rating: number;
  number: string;
  strengths: string;
  weaknesses: string;
}

const emptyDraft = (pos: Pos = 'MID'): Draft => ({ name: '', pos, rating: 6, number: '', strengths: '', weaknesses: '' });

function PlayerForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  idPrefix,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => void;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [more, setMore] = useState(!!(initial.number || initial.strengths || initial.weaknesses));
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="pform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!d.name.trim()) {
          setErr('اكتب اسم اللاعب أولًا');
          return;
        }
        setErr('');
        onSubmit(d);
        if (!onCancel) setD(emptyDraft(d.pos));
      }}
    >
      <div className="pform-row">
        <input
          id={`${idPrefix}-name`}
          className="input"
          value={d.name}
          maxLength={24}
          placeholder="اسم اللاعب"
          aria-label="اسم اللاعب"
          autoComplete="off"
          onChange={(e) => set('name', e.target.value)}
        />
        <button type="submit" className="btn btn-brass">
          {submitLabel}
        </button>
      </div>
      {err && <p className="form-err">{err}</p>}
      <div className="seg" role="radiogroup" aria-label="المركز">
        {POSITIONS.map((p) => (
          <button
            type="button"
            key={p}
            role="radio"
            aria-checked={d.pos === p}
            className={`seg-btn pos-${p}`}
            onClick={() => set('pos', p)}
          >
            {POS_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="rating-row">
        <span className="label">المستوى</span>
        <button type="button" className="icon-btn" aria-label="إنقاص المستوى" onClick={() => set('rating', Math.max(1, d.rating - 1))}>
          <IconMinus size={16} />
        </button>
        <input
          id={`${idPrefix}-rating`}
          type="range"
          min={1}
          max={10}
          value={d.rating}
          aria-label="المستوى من 1 إلى 10"
          onChange={(e) => set('rating', Number(e.target.value))}
          className="range"
          style={{ ['--v' as string]: `${((d.rating - 1) / 9) * 100}%` }}
        />
        <button type="button" className="icon-btn" aria-label="زيادة المستوى" onClick={() => set('rating', Math.min(10, d.rating + 1))}>
          <IconPlus size={16} />
        </button>
        <output className="rating-val">{d.rating}</output>
      </div>
      <button type="button" className="link-btn" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        {more ? 'إخفاء التفاصيل الاختيارية' : 'رقم القميص ونقاط القوة والضعف (اختياري)'}
      </button>
      {more && (
        <div className="pform-more">
          <input
            id={`${idPrefix}-num`}
            className="input input-num"
            inputMode="numeric"
            placeholder="الرقم"
            aria-label="رقم القميص"
            value={d.number}
            onChange={(e) => set('number', e.target.value.replace(/[^\d٠-٩]/g, '').slice(0, 2))}
          />
          <input
            id={`${idPrefix}-str`}
            className="input"
            placeholder="نقاط القوة: سرعة، تسديد…"
            aria-label="نقاط القوة"
            maxLength={60}
            value={d.strengths}
            onChange={(e) => set('strengths', e.target.value)}
          />
          <input
            id={`${idPrefix}-weak`}
            className="input"
            placeholder="نقاط الضعف"
            aria-label="نقاط الضعف"
            maxLength={60}
            value={d.weaknesses}
            onChange={(e) => set('weaknesses', e.target.value)}
          />
        </div>
      )}
      {onCancel && (
        <button type="button" className="link-btn" onClick={onCancel}>
          إلغاء التعديل
        </button>
      )}
    </form>
  );
}

const toNum = (s: string) => {
  const n = Number(s.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))));
  return n > 0 && n < 100 ? n : undefined;
};

export function PlayersPanel({
  players,
  locks,
  teams,
  onAdd,
  onUpdate,
  onDelete,
  onToggleAll,
  onClearExamples,
}: {
  players: Player[];
  locks: Record<string, TeamId>;
  teams: Record<TeamId, { name: string; color: string }>;
  onAdd: (p: Omit<Player, 'id'>) => void;
  onUpdate: (p: Player) => void;
  onDelete: (id: string) => void;
  onToggleAll: (v: boolean) => void;
  onClearExamples: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const active = players.filter((p) => p.active).length;
  const hasExamples = players.some((p) => p.example);
  const fromDraft = (d: Draft) => ({
    name: d.name.trim(),
    pos: d.pos,
    rating: d.rating,
    number: toNum(d.number),
    strengths: d.strengths.trim() || undefined,
    weaknesses: d.weaknesses.trim() || undefined,
  });

  return (
    <div className="panel-body">
      <PlayerForm idPrefix="add" initial={emptyDraft()} submitLabel="إضافة" onSubmit={(d) => onAdd({ ...fromDraft(d), active: true })} />

      {hasExamples && (
        <div className="note">
          <span>القائمة الحالية أسماء تجريبية لتجربة التطبيق.</span>
          <button className="link-btn" onClick={onClearExamples}>
            امسح الأمثلة
          </button>
        </div>
      )}

      <div className="list-head">
        <span>
          الحاضرون <b className="num">{active}</b> من <span className="num">{players.length}</span>
        </span>
        <button className="link-btn" onClick={() => onToggleAll(active !== players.length)}>
          {active !== players.length ? 'تحديد الكل' : 'إلغاء تحديد الكل'}
        </button>
      </div>

      {players.length === 0 && <p className="empty">أضف أول لاعب من النموذج أعلاه. تحتاج لاعبَين على الأقل لتشكيل فريقين.</p>}

      <ul className="plist">
        {players.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="prow editing">
              <PlayerForm
                idPrefix={`edit-${p.id}`}
                initial={{
                  name: p.name,
                  pos: p.pos,
                  rating: p.rating,
                  number: p.number ? String(p.number) : '',
                  strengths: p.strengths ?? '',
                  weaknesses: p.weaknesses ?? '',
                }}
                submitLabel="حفظ"
                onSubmit={(d) => {
                  onUpdate({ ...p, ...fromDraft(d), example: false });
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={p.id} className={`prow ${p.active ? '' : 'off'}`}>
              <label className="check">
                <input
                  id={`active-${p.id}`}
                  type="checkbox"
                  checked={p.active}
                  onChange={(e) => onUpdate({ ...p, active: e.target.checked })}
                  aria-label={`${p.name} حاضر`}
                />
                <span className="check-box" aria-hidden="true" />
              </label>
              <div className="prow-main">
                <div className="prow-name">
                  {p.name}
                  {p.number ? <span className="pnum num">#{p.number}</span> : null}
                  {locks[p.id] && (
                    <span className="lock-chip" title={`مثبّت في ${teams[locks[p.id]].name}`} style={{ ['--tc' as string]: teams[locks[p.id]].color }}>
                      <IconPin size={12} /> {teams[locks[p.id]].name}
                    </span>
                  )}
                </div>
                {(p.strengths || p.weaknesses) && (
                  <div className="prow-notes">
                    {p.strengths && <span>+ {p.strengths}</span>}
                    {p.weaknesses && <span>− {p.weaknesses}</span>}
                  </div>
                )}
              </div>
              <span className={`pos-chip pos-${p.pos}`}>{POS_LABEL[p.pos]}</span>
              <span className="rating-pill num" aria-label={`المستوى ${p.rating}`}>
                {p.rating}
              </span>
              {confirmDel === p.id ? (
                <span className="confirm">
                  <button className="btn btn-danger btn-xs" onClick={() => onDelete(p.id)}>
                    حذف
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setConfirmDel(null)}>
                    تراجع
                  </button>
                </span>
              ) : (
                <span className="row-actions">
                  <button className="icon-btn" aria-label={`تعديل ${p.name}`} onClick={() => setEditing(p.id)}>
                    <IconEdit size={16} />
                  </button>
                  <button className="icon-btn" aria-label={`حذف ${p.name}`} onClick={() => setConfirmDel(p.id)}>
                    <IconTrash size={16} />
                  </button>
                </span>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
