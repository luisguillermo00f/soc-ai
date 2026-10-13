// Primitivas del motor analítico: períodos de comparación, distribuciones, series y tendencias.

import type { Dist, EventRec, MonthPoint, Period, PeriodInfo, Trend } from '../../shared/types.ts';
import { addMonths, lastDayOfMonth, monthLabel, monthOf, monthRange, weekday, WEEKDAYS } from '../pipeline/dates.ts';
import { MECH_LABEL } from '../pipeline/taxonomy.ts';
import { rateChangeP } from '../lib/stats.ts';

/** Fecha que ubica el evento en el tiempo: ocurrencia para AT, calificación para EL. */
export function eventTime(e: EventRec): string | null {
  return e.cls === 'EL' ? e.qualDate ?? e.date : e.date;
}

function period(start: string, end: string): Period {
  const months = monthRange(start, end).length;
  return { start, end, months, label: `${monthLabel(start)} – ${monthLabel(end)}` };
}

export function buildPeriod(at: EventRec[]): PeriodInfo {
  const dates = at.map((e) => e.date).filter((d): d is string => !!d).sort();
  if (!dates.length) {
    const empty = period('2000-01', '2000-01');
    return { dataStart: null, dataEnd: null, completeMonths: [], partialMonth: null, recent: empty, previous: empty, ytd: null };
  }
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const lastMonth = monthOf(last);
  const lastDay = Number(last.slice(8, 10));
  // El mes del corte es incompleto si el último dato no cae en su último día: se excluye de tendencias.
  const partial = lastDay < lastDayOfMonth(lastMonth) ? lastMonth : null;
  const endComplete = partial ? addMonths(lastMonth, -1) : lastMonth;
  const startMonth = monthOf(first);
  const complete = endComplete >= startMonth ? monthRange(startMonth, endComplete) : [];

  const window = complete.length >= 12 ? 6 : Math.max(1, Math.floor(complete.length / 2));
  const recentStart = addMonths(endComplete, -(window - 1));
  const prevEnd = addMonths(recentStart, -1);
  const prevStart = addMonths(prevEnd, -(window - 1));

  let ytd: PeriodInfo['ytd'] = null;
  const year = Number(endComplete.slice(0, 4));
  const prevYearStart = `${year - 1}-01`;
  if (complete.includes(prevYearStart) && endComplete.slice(5) !== '12') {
    ytd = {
      current: period(`${year}-01`, endComplete),
      previousYear: period(prevYearStart, `${year - 1}-${endComplete.slice(5)}`),
    };
  }

  return {
    dataStart: first,
    dataEnd: last,
    completeMonths: complete,
    partialMonth: partial,
    recent: period(recentStart, endComplete),
    previous: period(prevStart, prevEnd),
    ytd,
  };
}

export function inPeriod(e: EventRec, p: Period): boolean {
  const t = eventTime(e);
  if (!t) return false;
  const m = monthOf(t);
  return m >= p.start && m <= p.end;
}

export function trendOf(events: EventRec[], info: PeriodInfo): Trend {
  let recent = 0;
  let previous = 0;
  for (const e of events) {
    if (inPeriod(e, info.recent)) recent++;
    else if (inPeriod(e, info.previous)) previous++;
  }
  return makeTrend(recent, previous);
}

export function makeTrend(recent: number, previous: number): Trend {
  const pValue = recent + previous > 0 ? rateChangeP(recent, previous) : null;
  const change = previous > 0 ? (recent - previous) / previous : null;
  let direction: Trend['direction'] = 'flat';
  if (previous === 0 && recent > 0) direction = 'new';
  else if (change !== null && change > 0.1) direction = 'up';
  else if (change !== null && change < -0.1) direction = 'down';
  return { recent, previous, change, pValue, direction, significant: pValue !== null && pValue < 0.05 && recent + previous >= 6 };
}

export function monthly(events: EventRec[], months: string[]): MonthPoint[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out: MonthPoint[] = months.map((m) => ({ month: m, count: 0, days: 0, severe: 0 }));
  for (const e of events) {
    const t = eventTime(e);
    if (!t) continue;
    const i = idx.get(monthOf(t));
    if (i === undefined) continue;
    const p = out[i]!;
    p.count++;
    p.days += e.daysLost ?? 0;
    if (e.severe) p.severe++;
  }
  return out;
}

export function dist(
  events: EventRec[],
  key: (e: EventRec) => string | null | undefined,
  label: (k: string) => string = (k) => k,
  opts: { includeNull?: string; total?: number } = {},
): Dist[] {
  const m = new Map<string, { count: number; days: number; severe: number }>();
  for (const e of events) {
    let k = key(e);
    if (!k) { if (!opts.includeNull) continue; k = opts.includeNull; }
    const v = m.get(k) ?? { count: 0, days: 0, severe: 0 };
    v.count++;
    v.days += e.daysLost ?? 0;
    if (e.severe) v.severe++;
    m.set(k, v);
  }
  const total = opts.total ?? events.length;
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, label: label(k), count: v.count, share: total ? v.count / total : 0, days: v.days, severe: v.severe }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const mechLabel = (k: string) => MECH_LABEL.get(k) ?? k.replace(/^x-/, '').replace(/-/g, ' ');

/** Mecanismos que no informan nada para patrones. */
export function informativeMech(k: string | null): k is string {
  return !!k && k !== 'sin-info' && k !== 'otro';
}

export function weekdayDist(events: EventRec[]): Dist[] {
  const counts = new Array(7).fill(0) as number[];
  let n = 0;
  for (const e of events) {
    if (e.cls !== 'AT' || !e.date) continue;
    counts[weekday(e.date)]!++;
    n++;
  }
  return counts.map((c, i) => ({ key: String(i), label: WEEKDAYS[i]!, count: c, share: n ? c / n : 0 }));
}

export function careBand(e: EventRec): string | null {
  if (e.careRank === null) return null;
  return e.careRank >= 3 ? 'grave' : e.careRank === 2 ? 'moderado' : 'leve';
}

export const CARE_BAND_LABEL: Record<string, string> = {
  grave: 'Atención quirúrgica, hospitalaria o UCI',
  moderado: 'Atención ambulatoria',
  leve: 'Alta inmediata',
};

export function isWeekend(e: EventRec): boolean {
  return !!e.date && weekday(e.date) >= 5;
}
