// أنواع البيانات الأساسية — مستقلة تمامًا عن الواجهة

export type Pos = 'GK' | 'DEF' | 'MID' | 'ATT';
export type TeamId = 'A' | 'B';

export const POS_LABEL: Record<Pos, string> = {
  GK: 'حارس',
  DEF: 'دفاع',
  MID: 'وسط',
  ATT: 'هجوم',
};

export const POS_SHORT: Record<Pos, string> = {
  GK: 'ح',
  DEF: 'د',
  MID: 'و',
  ATT: 'هـ',
};

/** لاعب في القائمة الدائمة */
export interface Player {
  id: string;
  name: string;
  pos: Pos;
  rating: number; // 1..10
  number?: number; // رقم القميص (اختياري)
  strengths?: string;
  weaknesses?: string;
  active: boolean; // حاضر في مباراة اليوم
  example?: boolean; // لاعب تجريبي
}

/** نقطة على أرض الملعب بالأمتار. x عرضيًا، z طوليًا (سالب = مرمى الفريق أ) */
export interface Vec2 {
  x: number;
  z: number;
}

/** لاعب داخل تشكيلة (نسخة مستقلة حتى تبقى التشكيلات المحفوظة سليمة) */
export interface MatchPlayer {
  id: string;
  name: string;
  pos: Pos;
  rating: number;
  number: number;
  team: TeamId;
  bench: boolean;
  line: Pos; // الخط الذي يلعب فيه فعليًا في التشكيل
  home: Vec2; // الموقع الأصلي في التشكيل
  at: Vec2; // الموقع الحالي بعد السحب
}

export interface TeamInfo {
  name: string;
  color: string;
}

export interface Match {
  teamSize: number;
  formationId: string; // 'auto' أو معرّف تشكيل
  teams: Record<TeamId, TeamInfo>;
  players: MatchPlayer[];
  createdAt: number;
}

export interface SavedLineup {
  id: string;
  name: string;
  savedAt: number;
  match: Match;
}

export interface FormationRow {
  line: Exclude<Pos, 'GK'>;
  count: number;
  depth: number; // 0 = خط المرمى، 1 = خط المنتصف
}

export interface Formation {
  id: string;
  label: string;
  size: number;
  gk: boolean;
  rows: FormationRow[];
}

export interface Slot {
  line: Pos;
  lateral: number; // -1..1
  depth: number; // 0..1
}
