import { formationsFor } from '../core/formations';
import { TEAM_COLORS, type Settings } from '../core/storage';
import type { TeamId } from '../core/types';
import { IconMinus, IconPlus } from './icons';

export function MatchPanel({
  settings,
  activeCount,
  onTeamSize,
  onFormation,
  onTeam,
  onShowNumbers,
}: {
  settings: Settings;
  activeCount: number;
  onTeamSize: (n: number) => void;
  onFormation: (id: string) => void;
  onTeam: (t: TeamId, patch: { name?: string; color?: string }) => void;
  onShowNumbers: (v: boolean) => void;
}) {
  const n = settings.teamSize;
  const list = formationsFor(n);
  const pref = settings.formationPref[n] ?? 'auto';
  const need = n * 2;
  const hint =
    activeCount < need
      ? `الحاضرون ${activeCount} فقط، فسيلعب كل فريق بـ ${Math.ceil(activeCount / 2)} أو أقل ويُعدَّل التشكيل تلقائيًا.`
      : activeCount > need
        ? `الحاضرون ${activeCount}، فسيبقى ${activeCount - need} في الاحتياط موزّعين بالتساوي.`
        : `الحاضرون ${activeCount}: العدد مكتمل للفريقين.`;

  return (
    <div className="panel-body">
      <section className="field">
        <div className="field-label" id="size-label">
          عدد اللاعبين في كل فريق
        </div>
        <div className="stepper" role="group" aria-labelledby="size-label">
          <button className="icon-btn big" aria-label="إنقاص" disabled={n <= 1} onClick={() => onTeamSize(n - 1)}>
            <IconMinus />
          </button>
          <output className="stepper-val num" aria-live="polite">
            {n}
            <small>ضد</small>
            {n}
          </output>
          <button className="icon-btn big" aria-label="زيادة" disabled={n >= 11} onClick={() => onTeamSize(n + 1)}>
            <IconPlus />
          </button>
        </div>
        <div className="quick-sizes">
          {[5, 7, 9, 11].map((q) => (
            <button key={q} className={`chip ${q === n ? 'on' : ''}`} onClick={() => onTeamSize(q)}>
              {q === 5 ? 'خماسي' : q === 7 ? 'سباعي' : q === 9 ? 'تساعي' : 'ملعب كامل'}
            </button>
          ))}
        </div>
        <p className="hint">{hint}</p>
      </section>

      <section className="field">
        <label className="field-label" htmlFor="formation">
          التشكيلة
        </label>
        <select id="formation" className="input select" value={pref} onChange={(e) => onFormation(e.target.value)}>
          <option value="auto">تلقائي ({list[0].label})</option>
          {list.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
              {f.gk ? '' : ''}
            </option>
          ))}
        </select>
        <p className="hint">الأرقام تخص لاعبي الدفاع ثم الوسط ثم الهجوم، والحارس يُضاف تلقائيًا.</p>
      </section>

      {(['A', 'B'] as TeamId[]).map((t) => (
        <section className="field team-field" key={t}>
          <label className="field-label" htmlFor={`team-${t}`}>
            {t === 'A' ? 'الفريق الأول' : 'الفريق الثاني'}
          </label>
          <input
            id={`team-${t}`}
            className="input"
            value={settings.teams[t].name}
            maxLength={18}
            onChange={(e) => onTeam(t, { name: e.target.value })}
          />
          <div className="swatches" role="radiogroup" aria-label={`لون ${settings.teams[t].name}`}>
            {TEAM_COLORS.map((c) => {
              const other = settings.teams[t === 'A' ? 'B' : 'A'].color;
              return (
                <button
                  key={c}
                  role="radio"
                  aria-checked={settings.teams[t].color === c}
                  aria-label={`اللون ${c}`}
                  disabled={other === c}
                  className="swatch"
                  style={{ ['--c' as string]: c }}
                  onClick={() => onTeam(t, { color: c })}
                />
              );
            })}
          </div>
        </section>
      ))}

      <label className="toggle">
        <input id="show-numbers" type="checkbox" checked={settings.showNumbers} onChange={(e) => onShowNumbers(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        إظهار أرقام القمصان
      </label>
    </div>
  );
}
