// Comparación año contra año por empresa sobre el mismo tramo de meses.
// Si el año en curso no ha terminado, comparar con el año anterior completo sesgaría el resultado,
// así que se usa el período `ytd` (p. ej. ene–sep 2026 frente a ene–sep 2025).

import type { EventRec, PeriodInfo, YearCompare, YearCompareRow, YearOverYear } from '../../shared/types.ts';
import { monthLabel } from '../pipeline/dates.ts';
import { informativeMech, inPeriod, makeTrend, mechLabel } from './base.ts';

function split(events: EventRec[], period: PeriodInfo) {
  const y = period.ytd!;
  return {
    cur: events.filter((e) => e.cls === 'AT' && inPeriod(e, y.current)),
    prev: events.filter((e) => e.cls === 'AT' && inPeriod(e, y.previousYear)),
  };
}

const days = (evts: EventRec[]) => evts.reduce((a, e) => a + (e.daysLost ?? 0), 0);

export function yearOverYear(events: EventRec[], period: PeriodInfo): YearOverYear | null {
  const y = period.ytd;
  if (!y) return null;
  const { cur, prev } = split(events, period);
  const t = makeTrend(cur.length, prev.length);
  const prevYear = Number(y.previousYear.start.slice(0, 4));
  return {
    currentLabel: y.current.label,
    previousLabel: y.previousYear.label,
    currentYear: Number(y.current.start.slice(0, 4)),
    previousYear: prevYear,
    current: cur.length,
    previous: prev.length,
    change: t.change,
    pValue: t.pValue,
    significant: t.pValue !== null && t.pValue < 0.05 && cur.length + prev.length >= 6,
    direction: t.direction,
    severeCurrent: cur.filter((e) => e.severe).length,
    severePrevious: prev.filter((e) => e.severe).length,
    daysCurrent: days(cur),
    daysPrevious: days(prev),
    previousFullYear: events.filter((e) => e.cls === 'AT' && e.date?.startsWith(String(prevYear))).length,
  };
}

function compareBy(cur: EventRec[], prev: EventRec[], key: (e: EventRec) => string | null, label: (k: string) => string): YearCompareRow[] {
  const m = new Map<string, { current: number; previous: number }>();
  for (const [list, field] of [[cur, 'current'], [prev, 'previous']] as const) {
    for (const e of list) {
      const k = key(e);
      if (!k) continue;
      const v = m.get(k) ?? { current: 0, previous: 0 };
      v[field]++;
      m.set(k, v);
    }
  }
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, label: label(k), ...v }))
    .sort((a, b) => b.current + b.previous - (a.current + a.previous));
}

export function yearCompare(events: EventRec[], period: PeriodInfo): YearCompare | null {
  const yoy = yearOverYear(events, period);
  if (!yoy || !period.ytd) return null;
  const { cur, prev } = split(events, period);
  const monthsCur = period.completeMonths.filter((m) => m >= period.ytd!.current.start && m <= period.ytd!.current.end);
  const count = (list: EventRec[], mm: string) => list.filter((e) => e.date?.slice(5, 7) === mm).length;
  const workers = (list: EventRec[]) => {
    const n = new Map<string, number>();
    for (const e of list) if (e.worker) n.set(e.worker, (n.get(e.worker) ?? 0) + 1);
    return { total: n.size, repeat: [...n.values()].filter((x) => x >= 2).length };
  };
  const wc = workers(cur);
  const wp = workers(prev);
  const mechanisms = compareBy(cur, prev, (e) => (informativeMech(e.mechGroup) ? e.mechGroup : null), mechLabel);
  return {
    yoy,
    monthly: monthsCur.map((m) => ({ month: m.slice(5, 7), label: monthLabel(m).split(' ')[0]!, current: count(cur, m.slice(5, 7)), previous: count(prev, m.slice(5, 7)) })),
    mechanisms,
    workCenters: compareBy(cur, prev, (e) => e.workCenter, (k) => k).slice(0, 10),
    careLevels: compareBy(cur, prev, (e) => e.careLevel, (k) => k),
    workers: { current: wc.total, previous: wp.total, repeatCurrent: wc.repeat, repeatPrevious: wp.repeat },
    newMechanisms: mechanisms.filter((m) => m.previous === 0 && m.current > 0).map((m) => m.label),
    goneMechanisms: mechanisms.filter((m) => m.current === 0 && m.previous > 0).map((m) => m.label),
  };
}
