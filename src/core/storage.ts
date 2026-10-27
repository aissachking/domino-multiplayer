import type { Match, Player, SavedLineup, TeamId, TeamInfo } from './types';

const KEY = 'mizan.v1';

export interface Settings {
  teamSize: number;
  formationPref: Record<number, string>; // التشكيل المفضل لكل عدد
  teams: Record<TeamId, TeamInfo>;
  showNumbers: boolean;
}

export interface AppData {
  players: Player[];
  locks: Record<string, TeamId>;
  settings: Settings;
  match: Match | null;
  saved: SavedLineup[];
}

export const TEAM_COLORS = ['#D7263D', '#1B7FE0', '#F2F0E8', '#F4C430', '#FF7A1A', '#7B4DD8', '#1E1E22', '#12A38A'];

export const DEFAULT_SETTINGS: Settings = {
  teamSize: 7,
  formationPref: {},
  teams: {
    A: { name: 'الأحمر', color: '#D7263D' },
    B: { name: 'الأزرق', color: '#1B7FE0' },
  },
  showNumbers: true,
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

const SAMPLE: [string, Player['pos'], number][] = [
  ['ياسين', 'GK', 7],
  ['عمر', 'GK', 6],
  ['رياض', 'DEF', 8],
  ['سفيان', 'DEF', 6],
  ['نبيل', 'DEF', 7],
  ['كريم', 'DEF', 5],
  ['إسماعيل', 'MID', 9],
  ['أنيس', 'MID', 7],
  ['هشام', 'MID', 6],
  ['بلال', 'MID', 8],
  ['إسلام', 'ATT', 9],
  ['يوسف', 'ATT', 7],
  ['مهدي', 'ATT', 6],
  ['زكريا', 'ATT', 5],
];

export function samplePlayers(): Player[] {
  return SAMPLE.map(([name, pos, rating]) => ({ id: uid(), name, pos, rating, active: true, example: true }));
}

export function loadData(): AppData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<AppData>;
    if (!d || !Array.isArray(d.players)) return null;
    return {
      players: d.players,
      locks: d.locks ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), teams: { ...DEFAULT_SETTINGS.teams, ...(d.settings?.teams ?? {}) } },
      match: d.match ?? null,
      saved: Array.isArray(d.saved) ? d.saved : [],
    };
  } catch {
    return null;
  }
}

export function saveData(d: AppData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
