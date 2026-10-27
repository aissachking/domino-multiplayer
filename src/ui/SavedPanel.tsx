import { useState } from 'react';
import type { SavedLineup } from '../core/types';
import { IconTrash } from './icons';

export function SavedPanel({
  saved,
  canSave,
  onSave,
  onOpen,
  onDelete,
}: {
  saved: SavedLineup[];
  canSave: boolean;
  onSave: (name: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="panel-body">
      <form
        className="pform-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          onSave(name.trim() || `مباراة ${fmt.format(new Date())}`);
          setName('');
        }}
      >
        <input
          id="save-name"
          className="input"
          placeholder="اسم التشكيلة، مثل: مباراة الجمعة"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="اسم التشكيلة"
        />
        <button className="btn btn-brass" disabled={!canSave}>
          حفظ
        </button>
      </form>
      {!canSave && <p className="hint">شكّل الفريقين أولًا ثم احفظ التشكيلة.</p>}

      {saved.length === 0 ? (
        <p className="empty">لا توجد تشكيلات محفوظة بعد. التشكيلة تُحفظ بأسماء اللاعبين ومواقعهم وألوان الفريقين.</p>
      ) : (
        <ul className="slist">
          {saved.map((s) => {
            const a = s.match.teams.A;
            const b = s.match.teams.B;
            return (
              <li key={s.id} className="srow">
                <button className="srow-open" onClick={() => onOpen(s.id)}>
                  <span className="srow-dots" aria-hidden="true">
                    <i style={{ background: a.color }} />
                    <i style={{ background: b.color }} />
                  </span>
                  <span className="srow-text">
                    <b>{s.name}</b>
                    <small>
                      {a.name} ضد {b.name} · <span className="num">{s.match.teamSize}</span> لكل فريق · {fmt.format(new Date(s.savedAt))}
                    </small>
                  </span>
                </button>
                {confirm === s.id ? (
                  <span className="confirm">
                    <button className="btn btn-danger btn-xs" onClick={() => onDelete(s.id)}>
                      حذف
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setConfirm(null)}>
                      تراجع
                    </button>
                  </span>
                ) : (
                  <button className="icon-btn" aria-label={`حذف ${s.name}`} onClick={() => setConfirm(s.id)}>
                    <IconTrash size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
