import type { Formation, FormationRow, Slot } from './types';

const r = (line: FormationRow['line'], count: number, depth: number): FormationRow => ({ line, count, depth });

function f(size: number, label: string, rows: FormationRow[], gk = true): Formation {
  return { id: `${size}:${label}`, label, size, gk, rows };
}

/**
 * التشكيلات المتاحة لكل عدد لاعبين. الأول في كل قائمة هو الاختيار التلقائي.
 * الأرقام تخص اللاعبين في الملعب دون الحارس.
 */
const FORMATIONS: Record<number, Formation[]> = {
  1: [f(1, 'لاعب واحد', [r('MID', 1, 0.55)], false)],
  2: [f(2, '1', [r('MID', 1, 0.6)]), f(2, 'بدون حارس 2', [r('DEF', 1, 0.35), r('ATT', 1, 0.75)], false)],
  3: [f(3, '1-1', [r('DEF', 1, 0.38), r('ATT', 1, 0.78)]), f(3, '2', [r('MID', 2, 0.55)])],
  4: [f(4, '2-1', [r('DEF', 2, 0.36), r('ATT', 1, 0.78)]), f(4, '1-1-1', [r('DEF', 1, 0.32), r('MID', 1, 0.56), r('ATT', 1, 0.82)])],
  5: [
    f(5, '2-1-1', [r('DEF', 2, 0.32), r('MID', 1, 0.56), r('ATT', 1, 0.82)]),
    f(5, '1-2-1', [r('DEF', 1, 0.3), r('MID', 2, 0.55), r('ATT', 1, 0.82)]),
    f(5, '2-2', [r('DEF', 2, 0.36), r('ATT', 2, 0.76)]),
  ],
  6: [
    f(6, '2-2-1', [r('DEF', 2, 0.3), r('MID', 2, 0.56), r('ATT', 1, 0.84)]),
    f(6, '2-1-2', [r('DEF', 2, 0.3), r('MID', 1, 0.54), r('ATT', 2, 0.8)]),
  ],
  7: [
    f(7, '3-2-1', [r('DEF', 3, 0.3), r('MID', 2, 0.56), r('ATT', 1, 0.84)]),
    f(7, '2-3-1', [r('DEF', 2, 0.3), r('MID', 3, 0.56), r('ATT', 1, 0.84)]),
  ],
  8: [
    f(8, '3-3-1', [r('DEF', 3, 0.28), r('MID', 3, 0.55), r('ATT', 1, 0.84)]),
    f(8, '2-3-2', [r('DEF', 2, 0.28), r('MID', 3, 0.54), r('ATT', 2, 0.82)]),
  ],
  9: [
    f(9, '3-3-2', [r('DEF', 3, 0.28), r('MID', 3, 0.54), r('ATT', 2, 0.83)]),
    f(9, '3-4-1', [r('DEF', 3, 0.28), r('MID', 4, 0.55), r('ATT', 1, 0.85)]),
  ],
  10: [
    f(10, '4-3-2', [r('DEF', 4, 0.27), r('MID', 3, 0.54), r('ATT', 2, 0.84)]),
    f(10, '3-4-2', [r('DEF', 3, 0.27), r('MID', 4, 0.54), r('ATT', 2, 0.84)]),
  ],
  11: [
    f(11, '4-3-3', [r('DEF', 4, 0.27), r('MID', 3, 0.54), r('ATT', 3, 0.84)]),
    f(11, '4-4-2', [r('DEF', 4, 0.27), r('MID', 4, 0.54), r('ATT', 2, 0.85)]),
    f(11, '4-2-3-1', [r('DEF', 4, 0.26), r('MID', 2, 0.45), r('MID', 3, 0.65), r('ATT', 1, 0.87)]),
    f(11, '3-5-2', [r('DEF', 3, 0.27), r('MID', 5, 0.55), r('ATT', 2, 0.85)]),
  ],
};

export function formationsFor(size: number): Formation[] {
  const n = Math.max(1, Math.min(11, Math.round(size)));
  return FORMATIONS[n];
}

/** يختار التشكيل المفضل إن كان يناسب العدد، وإلا التشكيل التلقائي */
export function resolveFormation(size: number, preferredId: string): Formation {
  const list = formationsFor(size);
  return list.find((x) => x.id === preferredId) ?? list[0];
}

export function slotsOf(fm: Formation): Slot[] {
  const slots: Slot[] = [];
  if (fm.gk) slots.push({ line: 'GK', lateral: 0, depth: 0.04 });
  for (const row of fm.rows) {
    const c = row.count;
    const spread = c >= 4 ? 0.82 : c === 3 ? 0.68 : c === 2 ? 0.5 : 0;
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0 : (i / (c - 1)) * 2 - 1;
      // انحناء خفيف للأطراف كما في التشكيلات الحقيقية
      const bend = c >= 4 ? Math.abs(t) * 0.03 : 0;
      slots.push({ line: row.line, lateral: t * spread, depth: row.depth + bend });
    }
  }
  return slots;
}
