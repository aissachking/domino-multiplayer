import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { balanceTeams } from './core/balance';
import {
  balanceVerdict,
  buildMatch,
  matchKey,
  movePlayer,
  relayout,
  resetPositions,
  swapPlayers,
  switchTeam,
  teamStrength,
} from './core/match';
import { DEFAULT_SETTINGS, loadData, samplePlayers, saveData, uid, type AppData } from './core/storage';
import { POS_LABEL, type Match, type Player, type TeamId } from './core/types';
import { renderMatchImage, tryShare } from './export/exportImage';
import { PitchView } from './pitch/PitchView';
import { IconBalance, IconBench, IconClose, IconImage, IconPin, IconReset, IconSave, IconShuffle, IconSwap } from './ui/icons';
import { LogoMark } from './ui/Logo';
import { MatchPanel } from './ui/MatchPanel';
import { PlayersPanel } from './ui/PlayersPanel';
import { SavedPanel } from './ui/SavedPanel';

type Tab = 'players' | 'match' | 'saved';

function initialData(): AppData {
  const stored = loadData();
  if (stored) return stored;
  const players = samplePlayers();
  const settings = { ...DEFAULT_SETTINGS };
  const r = balanceTeams(players, { teamSize: settings.teamSize, seed: 42 });
  return {
    players,
    locks: {},
    settings,
    match: buildMatch(players, r.teams, settings.teamSize, 'auto', settings.teams),
    saved: [],
  };
}

export default function App() {
  const [data, setData] = useState<AppData>(initialData);
  const [tab, setTab] = useState<Tab>('players');
  const [selected, setSelected] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [stale, setStale] = useState(false); // تغيّرت الإعدادات منذ آخر توزيع
  const toastTimer = useRef<number>(0);

  const { players, locks, settings, match, saved } = data;

  // حفظ محلي مؤجَّل قليلًا
  useEffect(() => {
    const t = window.setTimeout(() => saveData(data), 250);
    return () => window.clearTimeout(t);
  }, [data]);

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const patch = (p: Partial<AppData>) => setData((d) => ({ ...d, ...p }));
  const setMatch = (fn: (m: Match) => Match) => setData((d) => (d.match ? { ...d, match: fn(d.match) } : d));

  const activeCount = players.filter((p) => p.active).length;

  /* ---------- التوزيع ---------- */
  const form = (alternative: boolean) => {
    const pool = players.filter((p) => p.active);
    if (pool.length < 2) {
      say('حدّد لاعبَين حاضرَين على الأقل');
      setTab('players');
      return;
    }
    setBusy(true);
    setSelected(null);
    // نترك للواجهة فرصة عرض حالة الانتظار قبل الحساب
    window.setTimeout(() => {
      const pref = settings.formationPref[settings.teamSize] ?? 'auto';
      const symmetric = !pool.some((p) => locks[p.id]);
      const avoidKey = alternative && match ? matchKey(match, symmetric) : undefined;
      const r = balanceTeams(pool, { teamSize: settings.teamSize, formationPref: pref, locks, seed: Date.now(), avoidKey });
      const m = buildMatch(pool, r.teams, settings.teamSize, pref, settings.teams);
      setData((d) => ({ ...d, match: m }));
      setAnimKey((k) => k + 1);
      setStale(false);
      setBusy(false);
      if (alternative && avoidKey === r.key) say('لا يوجد توزيع متوازن آخر بهذه الأسماء');
    }, 30);
  };

  /* ---------- اللاعبون ---------- */
  const addPlayer = (p: Omit<Player, 'id'>) => {
    patch({ players: [{ ...p, id: uid() }, ...players] });
    setStale(true);
    say(`أُضيف ${p.name}`);
  };
  const updatePlayer = (p: Player) => {
    setData((d) => ({
      ...d,
      players: d.players.map((x) => (x.id === p.id ? p : x)),
      match: d.match
        ? {
            ...d.match,
            players: d.match.players.map((mp) =>
              mp.id === p.id ? { ...mp, name: p.name, pos: p.pos, rating: p.rating, number: p.number ?? mp.number } : mp,
            ),
          }
        : null,
    }));
    setStale(true);
  };
  const deletePlayer = (id: string) => {
    setData((d) => {
      const { [id]: _, ...rest } = d.locks;
      return {
        ...d,
        players: d.players.filter((x) => x.id !== id),
        locks: rest,
        match: d.match ? { ...d.match, players: d.match.players.filter((p) => p.id !== id) } : null,
      };
    });
    if (selected === id) setSelected(null);
  };

  /* ---------- التعديل على الملعب ---------- */
  const selectedMp = match?.players.find((p) => p.id === selected) ?? null;

  const handleSelect = (id: string | null) => {
    // لاعب احتياط محدد + نقرة على لاعب آخر = تبديل
    if (id && selectedMp && id !== selectedMp.id) {
      const other = match?.players.find((p) => p.id === id);
      if (other && (selectedMp.bench || other.bench) && selectedMp.bench !== other.bench) {
        setMatch((m) => swapPlayers(m, selectedMp.id, id));
        setSelected(null);
        say(`تبديل: ${selectedMp.name} ↔ ${other.name}`);
        return;
      }
    }
    setSelected(id);
  };

  const toggleLock = (id: string) => {
    const mp = match?.players.find((p) => p.id === id);
    if (!mp) return;
    setData((d) => {
      const next = { ...d.locks };
      if (next[id]) delete next[id];
      else next[id] = mp.team;
      return { ...d, locks: next };
    });
    say(locks[id] ? `أُلغي تثبيت ${mp.name}` : `${mp.name} ثابت في ${match!.teams[mp.team].name} عند إعادة التوزيع`);
  };

  const moveToOther = (id: string) => {
    const mp = match?.players.find((p) => p.id === id);
    if (!mp || !match) return;
    setMatch((m) => switchTeam(m, id));
    // إن كان مثبتًا ننقل التثبيت معه
    if (locks[id]) patch({ locks: { ...locks, [id]: mp.team === 'A' ? 'B' : 'A' } });
    say(`${mp.name} انتقل إلى ${match.teams[mp.team === 'A' ? 'B' : 'A'].name}`);
  };

  /* ---------- الإعدادات ---------- */
  const setTeamSize = (n: number) => {
    patch({ settings: { ...settings, teamSize: n } });
    setStale(true);
  };
  const setFormation = (id: string) => {
    patch({ settings: { ...settings, formationPref: { ...settings.formationPref, [settings.teamSize]: id } } });
    if (match && match.teamSize === settings.teamSize) setMatch((m) => relayout(m, id));
  };
  const setTeam = (t: TeamId, p: { name?: string; color?: string }) => {
    setData((d) => {
      const teams = { ...d.settings.teams, [t]: { ...d.settings.teams[t], ...p } };
      return { ...d, settings: { ...d.settings, teams }, match: d.match ? { ...d.match, teams } : null };
    });
  };

  /* ---------- الحفظ ---------- */
  const saveLineup = (name: string) => {
    if (!match) return;
    patch({ saved: [{ id: uid(), name, savedAt: Date.now(), match: structuredClone(match) }, ...saved] });
    say(`حُفظت «${name}»`);
  };
  const openLineup = (id: string) => {
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const m = structuredClone(s.match);
    setData((d) => ({ ...d, match: m, settings: { ...d.settings, teamSize: m.teamSize, teams: { ...m.teams } } }));
    setAnimKey((k) => k + 1);
    setSelected(null);
    setStale(false);
    say(`فُتحت «${s.name}»`);
  };

  /* ---------- التصدير ---------- */
  const exportImage = async () => {
    if (!match) return;
    setBusy(true);
    try {
      const blob = await renderMatchImage(match, settings.showNumbers);
      const name = `tashkila-${match.teams.A.name}-${match.teams.B.name}.png`.replace(/\s+/g, '-');
      const shared = await tryShare(blob, name);
      if (!shared) setPreview({ url: URL.createObjectURL(blob), name });
    } catch {
      say('تعذّر إنشاء الصورة، حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  /* ---------- القيم المعروضة ---------- */
  const strength = useMemo(() => {
    if (!match) return null;
    const a = teamStrength(match, 'A');
    const b = teamStrength(match, 'B');
    return { a, b, v: balanceVerdict(a, b) };
  }, [match]);

  const bench = match?.players.filter((p) => p.bench) ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <LogoMark a={settings.teams.A.color} b={settings.teams.B.color} size={34} />
          <div className="brand-text">
            <span className="brand-name">تشكيلة</span>
            <span className="brand-tag">شكّل فريقين بالعدل</span>
          </div>
        </div>
        <div className="top-actions">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setTab('saved');
              document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <IconSave size={17} /> حفظ
          </button>
          <button className="btn btn-outline" onClick={exportImage} disabled={!match || busy}>
            <IconImage size={17} /> صورة
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="stage" aria-label="الملعب">
          {strength && match && (
            <div className="scoreboard" aria-live="polite">
              <div className="sb-team sb-a" style={{ ['--tc' as string]: match.teams.A.color }}>
                <span className="sb-name">{match.teams.A.name}</span>
                <span className="sb-meta num">
                  {strength.a.starters} لاعبين
                </span>
              </div>
              <div className="sb-center">
                <div className="sb-scores num">
                  <span>{strength.a.score}</span>
                  <i />
                  <span>{strength.b.score}</span>
                </div>
                <div className={`sb-verdict tone-${strength.v.tone}`}>
                  {strength.v.label} · <span className="num">{strength.v.pct.toFixed(1)}٪</span>
                </div>
              </div>
              <div className="sb-team sb-b" style={{ ['--tc' as string]: match.teams.B.color }}>
                <span className="sb-name">{match.teams.B.name}</span>
                <span className="sb-meta num">{strength.b.starters} لاعبين</span>
              </div>
              <div className="sb-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${(strength.a.total / Math.max(0.01, strength.a.total + strength.b.total)) * 100}%`,
                    background: match.teams.A.color,
                  }}
                />
                <span style={{ flex: 1, background: match.teams.B.color }} />
              </div>
            </div>
          )}

          <div className="pitch-area">
            <PitchView
              match={match}
              showNumbers={settings.showNumbers}
              selectedId={selected}
              locks={locks}
              animKey={animKey}
              onSelect={handleSelect}
              onMove={(id, pos) => setMatch((m) => movePlayer(m, id, pos))}
              onSwap={(a, b) => {
                const pa = match?.players.find((p) => p.id === a);
                const pb = match?.players.find((p) => p.id === b);
                setMatch((m) => swapPlayers(m, a, b));
                setSelected(null);
                if (pa && pb) say(`تبديل: ${pa.name} ↔ ${pb.name}`);
              }}
            />
            {!match && (
              <div className="pitch-empty">
                <p>أضف اللاعبين ثم اضغط «شكّل الفريقين»</p>
              </div>
            )}
            {selectedMp && match && (
              <div className="selbar" role="toolbar" aria-label={`خيارات ${selectedMp.name}`}>
                <div className="selbar-who">
                  <i style={{ background: match.teams[selectedMp.team].color }} />
                  <b>{selectedMp.name}</b>
                  <small>
                    {POS_LABEL[selectedMp.pos]} · <span className="num">{selectedMp.rating}</span>
                    {selectedMp.bench ? ' · احتياط' : ''}
                  </small>
                </div>
                {selectedMp.bench && <p className="selbar-hint">اضغط على لاعب في الملعب لإشراكه مكانه</p>}
                <div className="selbar-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => moveToOther(selectedMp.id)}>
                    <IconSwap size={16} /> إلى {match.teams[selectedMp.team === 'A' ? 'B' : 'A'].name}
                  </button>
                  <button className={`btn btn-sm ${locks[selectedMp.id] ? 'btn-brass' : 'btn-ghost'}`} onClick={() => toggleLock(selectedMp.id)}>
                    <IconPin size={16} /> {locks[selectedMp.id] ? 'مثبّت' : 'تثبيت'}
                  </button>
                  <button className="icon-btn" aria-label="إغلاق" onClick={() => setSelected(null)}>
                    <IconClose size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {bench.length > 0 && match && (
            <div className="bench">
              <span className="bench-label">
                <IconBench size={16} /> الاحتياط
              </span>
              {(['A', 'B'] as TeamId[]).map((t) =>
                bench
                  .filter((p) => p.team === t)
                  .map((p) => (
                    <button
                      key={p.id}
                      className={`bench-chip ${selected === p.id ? 'on' : ''}`}
                      style={{ ['--tc' as string]: match.teams[t].color }}
                      onClick={() => handleSelect(selected === p.id ? null : p.id)}
                    >
                      {p.name} <span className="num">{p.rating}</span>
                    </button>
                  )),
              )}
            </div>
          )}

          <div className="actions">
            <button className={`btn btn-brass btn-lg ${stale ? 'pulse' : ''}`} onClick={() => form(false)} disabled={busy}>
              <IconBalance /> {busy ? 'جارٍ الموازنة…' : 'شكّل الفريقين'}
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => form(true)} disabled={busy || !match}>
              <IconShuffle /> إعادة التوزيع
            </button>
            <button
              className="btn btn-ghost btn-lg"
              onClick={() => {
                setMatch(resetPositions);
                say('عاد اللاعبون إلى مواقعهم');
              }}
              disabled={!match}
            >
              <IconReset /> المواقع الأصلية
            </button>
          </div>
          <p className="stage-hint">اسحب اللاعب لتحريكه، وأفلته فوق لاعب آخر لتبديلهما. اضغط عليه لنقله أو تثبيته.</p>
        </section>

        <aside className="panel">
          <div className="tabs" role="tablist">
            {(
              [
                ['players', `اللاعبون`, players.length],
                ['match', 'المباراة', null],
                ['saved', 'المحفوظات', saved.length || null],
              ] as [Tab, string, number | null][]
            ).map(([id, label, count]) => (
              <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
                {label}
                {count !== null && <span className="tab-count num">{count}</span>}
              </button>
            ))}
          </div>
          {tab === 'players' && (
            <PlayersPanel
              players={players}
              locks={locks}
              teams={settings.teams}
              onAdd={addPlayer}
              onUpdate={updatePlayer}
              onDelete={deletePlayer}
              onToggleAll={(v) => patch({ players: players.map((p) => ({ ...p, active: v })) })}
              onClearExamples={() => {
                const keep = players.filter((p) => !p.example);
                setData((d) => ({ ...d, players: keep, match: null, locks: {} }));
                setSelected(null);
                say('مُسحت الأسماء التجريبية');
              }}
            />
          )}
          {tab === 'match' && (
            <MatchPanel
              settings={settings}
              activeCount={activeCount}
              onTeamSize={setTeamSize}
              onFormation={setFormation}
              onTeam={setTeam}
              onShowNumbers={(v) => patch({ settings: { ...settings, showNumbers: v } })}
            />
          )}
          {tab === 'saved' && (
            <SavedPanel
              saved={saved}
              canSave={!!match}
              onSave={saveLineup}
              onOpen={openLineup}
              onDelete={(id) => patch({ saved: saved.filter((s) => s.id !== id) })}
            />
          )}
        </aside>
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {preview && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="صورة التشكيلة">
          <div className="modal-card">
            <div className="modal-head">
              <b>صورة التشكيلة جاهزة</b>
              <button
                className="icon-btn"
                aria-label="إغلاق"
                onClick={() => {
                  URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
              >
                <IconClose />
              </button>
            </div>
            <img src={preview.url} alt="صورة الملعب والفريقين" className="modal-img" />
            <div className="modal-actions">
              <a className="btn btn-brass" href={preview.url} download={preview.name}>
                تنزيل الصورة
              </a>
              <span className="hint">على الهاتف يمكنك أيضًا الضغط مطوّلًا على الصورة لحفظها ومشاركتها عبر واتساب.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
