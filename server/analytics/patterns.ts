// Pattern detection: búsqueda exploratoria de combinaciones con significancia estadística.
// Cada patrón trae el conteo, la proporción esperada, el lift, un p-valor exacto, su tendencia
// y los ids de los eventos que lo componen (para "Ver evidencia").

import type { Cluster, CompanyRec, EventRec, Pattern, PatternStep, PeriodInfo } from '../../shared/types.ts';
import { binomUpper, benjaminiHochberg, poissonUpper } from '../lib/stats.ts';
import { daysBetween, monthLabel, monthOf } from '../pipeline/dates.ts';
import { CARE_BAND_LABEL, careBand, informativeMech, isWeekend, makeTrend, mechLabel, inPeriod } from './base.ts';
import { fmtNum, fmtPct } from '../lib/text.ts';

const GENERIC_CENTERS = /^(principal|principal atlantico|sede principal|unica|unico|riesgo \d|r\d|riesgo n \d)$/i;

function confidence(k: number, p: number): Pattern['confidence'] {
  if (k >= 8 && p < 0.01) return 'alta';
  if (k >= 4 && p < 0.05) return 'media';
  return 'baja';
}

function stepCompany(name: string): PatternStep { return { dim: 'company', dimLabel: 'Empresa', value: name }; }
function stepMech(k: string): PatternStep { return { dim: 'mechGroup', dimLabel: 'Mecanismo', value: mechLabel(k) }; }

function dominant<T>(items: T[], key: (t: T) => string | null, min = 0.5): { value: string; count: number; share: number } | null {
  const m = new Map<string, number>();
  let n = 0;
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
    n++;
  }
  if (!n) return null;
  const [value, count] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const share = count / items.length;
  return share >= min ? { value, count, share } : null;
}

function sumDays(evts: EventRec[]): number { return evts.reduce((a, e) => a + (e.daysLost ?? 0), 0); }

/**
 * Rachas: ≥ 3 eventos del mismo mecanismo en ≤ 60 días que son inusuales frente al ritmo propio
 * de la empresa para ese mecanismo (Poisson, p < 0,01). Así una empresa grande no acumula
 * "rachas" que solo reflejan su volumen normal.
 */
export function findClusters(events: EventRec[], spanDays: number, windowDays = 60, min = 3): Cluster[] {
  const byMech = new Map<string, EventRec[]>();
  for (const e of events) {
    if (e.cls !== 'AT' || !e.date || !informativeMech(e.mechGroup)) continue;
    const arr = byMech.get(e.mechGroup) ?? [];
    arr.push(e);
    byMech.set(e.mechGroup, arr);
  }
  const out: Cluster[] = [];
  for (const [mech, arr] of byMech) {
    if (arr.length < min) continue;
    arr.sort((a, b) => a.date!.localeCompare(b.date!));
    const rate = arr.length / Math.max(30, spanDays);
    let i = 0;
    while (i < arr.length) {
      // la ventana más densa que empieza en i
      let j = i;
      while (j + 1 < arr.length && daysBetween(arr[i]!.date!, arr[j + 1]!.date!) <= windowDays) j++;
      const k = j - i + 1;
      const span = daysBetween(arr[i]!.date!, arr[j]!.date!);
      const expected = rate * Math.max(span, 21);
      if (k >= min && poissonUpper(k, expected) < 0.01) {
        const slice = arr.slice(i, j + 1);
        out.push({ mechGroup: mech, start: slice[0]!.date!, end: slice[k - 1]!.date!, count: k, days: span, eventIds: slice.map((e) => e.id) });
        i = j + 1;
      } else i++;
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface PatternInput {
  at: EventRec[];
  byCompany: Map<string, EventRec[]>;
  companies: Map<string, CompanyRec>;
  period: PeriodInfo;
}

export function detectPatterns({ at, byCompany, companies, period }: PatternInput): Pattern[] {
  const spanDays = period.dataStart && period.dataEnd ? daysBetween(period.dataStart, period.dataEnd) + 1 : 365;
  const informative = at.filter((e) => informativeMech(e.mechGroup));
  const N = informative.length || 1;
  const globalMech = new Map<string, number>();
  for (const e of informative) globalMech.set(e.mechGroup!, (globalMech.get(e.mechGroup!) ?? 0) + 1);
  const globalSevere = at.filter((e) => e.severe).length / (at.length || 1);
  const globalWeekend = at.filter(isWeekend).length / (at.length || 1);

  const raw: (Omit<Pattern, 'confidence' | 'score'> & { q?: number })[] = [];
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;

  /* ── A. Empresa × mecanismo (+ dónde, gravedad, cuándo) ── */
  for (const [key, evts] of byCompany) {
    const co = companies.get(key)!;
    const inf = evts.filter((e) => informativeMech(e.mechGroup));
    if (inf.length < 3) continue;
    const byMech = new Map<string, EventRec[]>();
    for (const e of inf) {
      const arr = byMech.get(e.mechGroup!) ?? [];
      arr.push(e);
      byMech.set(e.mechGroup!, arr);
    }
    for (const [mech, subset] of byMech) {
      const k = subset.length;
      if (k < 3) continue;
      const n = inf.length;
      const p0 = (globalMech.get(mech) ?? 0) / N;
      const share = k / n;
      const lift = p0 ? share / p0 : 0;
      const pValue = binomUpper(k, n, p0);
      const recurrent = k >= 5;
      if (!(recurrent || (lift >= 1.5 && pValue < 0.05))) continue;

      const path: PatternStep[] = [stepCompany(co.name), stepMech(mech)];
      const center = dominant(subset, (e) => e.workCenter, 0.5);
      if (center && !GENERIC_CENTERS.test(center.value) && center.count >= 3) {
        path.push({ dim: 'workCenter', dimLabel: 'Centro de trabajo', value: center.value });
      }
      const extraDims = ['jobTitle', 'area', 'bodyPart', 'injuryType'] as const;
      for (const d of extraDims) {
        const dom = dominant(subset, (e) => e.extra[d] ?? null, 0.5);
        if (dom && dom.count >= 3) path.push({ dim: d, dimLabel: { jobTitle: 'Cargo', area: 'Área', bodyPart: 'Parte del cuerpo', injuryType: 'Lesión' }[d], value: dom.value });
      }
      const band = dominant(subset, careBand, 0.6);
      if (band) path.push({ dim: 'careBand', dimLabel: 'Atención', value: CARE_BAND_LABEL[band.value]! });
      const weekend = subset.filter(isWeekend).length / k;
      if (weekend >= 0.4 && weekend > globalWeekend * 1.8) path.push({ dim: 'weekday', dimLabel: 'Cuándo', value: `Fin de semana (${fmtPct(weekend, 0)})` });

      const trend = makeTrend(subset.filter((e) => inPeriod(e, period.recent)).length, subset.filter((e) => inPeriod(e, period.previous)).length);
      const severe = subset.filter((e) => e.severe).length;
      const parts = [
        `${k} de los ${n} eventos con mecanismo informado de ${co.name} (${fmtPct(share)}) son ${mechLabel(mech).toLowerCase()}`,
        lift >= 1.2 ? `${fmtNum(lift, 1)} veces la proporción del portafolio (${fmtPct(p0)})` : `una proporción similar a la del portafolio (${fmtPct(p0)}), pero repetida ${k} veces`,
      ];
      if (center && path.some((s) => s.dim === 'workCenter')) parts.push(`${center.count} de ellos en ${center.value}`);
      if (trend.direction === 'up' || trend.direction === 'new') parts.push(`con ${trend.recent} casos en los últimos 6 meses frente a ${trend.previous} en los 6 anteriores`);
      raw.push({
        id: id('P'),
        kind: 'company',
        title: `${mechLabel(mech)} en ${co.name}`,
        path,
        company: key,
        companyName: co.name,
        count: k,
        base: n,
        share,
        expectedShare: p0,
        lift,
        pValue,
        trend,
        daysLost: sumDays(subset),
        severe,
        explanation: `${parts.join(', ')}.`,
        eventIds: subset.map((e) => e.id),
      });
    }

    /* Rachas dentro de la empresa */
    for (const c of findClusters(evts, spanDays)) {
      const own = evts.filter((e) => e.mechGroup === c.mechGroup).length;
      const pValue = poissonUpper(c.count, (own / Math.max(30, spanDays)) * Math.max(c.days, 21));
      raw.push({
        id: id('R'),
        kind: 'cluster',
        title: `Racha de ${mechLabel(c.mechGroup).toLowerCase()} en ${co.name}`,
        path: [stepCompany(co.name), stepMech(c.mechGroup), { dim: 'window', dimLabel: 'Ventana', value: `${c.count} eventos en ${c.days} días` }],
        company: key,
        companyName: co.name,
        count: c.count,
        base: evts.length,
        share: c.count / evts.length,
        expectedShare: 0,
        lift: 0,
        pValue,
        trend: null,
        daysLost: sumDays(evts.filter((e) => c.eventIds.includes(e.id))),
        severe: evts.filter((e) => c.eventIds.includes(e.id) && e.severe).length,
        explanation: `${c.count} eventos de ${mechLabel(c.mechGroup).toLowerCase()} entre ${c.start} y ${c.end} (${c.days} días), más de lo que el ritmo habitual de la empresa para ese mecanismo explicaría. Una secuencia así sugiere una causa activa que no se corrigió tras el primer evento.`,
        eventIds: c.eventIds,
      });
    }

    /* Trabajadores reincidentes */
    const byWorker = new Map<string, EventRec[]>();
    for (const e of evts) {
      if (!e.worker || e.cls !== 'AT') continue;
      const arr = byWorker.get(e.worker) ?? [];
      arr.push(e);
      byWorker.set(e.worker, arr);
    }
    const repeaters = [...byWorker.values()].filter((a) => a.length >= 2);
    if (repeaters.length) {
      const ids = repeaters.flat().map((e) => e.id);
      const sameMech = repeaters.filter((a) => new Set(a.map((e) => e.mechGroup)).size < a.length).length;
      raw.push({
        id: id('W'),
        kind: 'worker',
        title: `Trabajadores con accidentes repetidos en ${co.name}`,
        path: [stepCompany(co.name), { dim: 'worker', dimLabel: 'Trabajadores', value: `${repeaters.length} con 2 o más accidentes` }],
        company: key,
        companyName: co.name,
        count: ids.length,
        base: evts.length,
        share: ids.length / evts.length,
        expectedShare: 0,
        lift: 0,
        pValue: 0.01,
        trend: null,
        daysLost: sumDays(repeaters.flat()),
        severe: repeaters.flat().filter((e) => e.severe).length,
        explanation: `${repeaters.length} trabajador(es) acumulan ${ids.length} accidentes${sameMech ? `; en ${sameMech} caso(s) se repite el mismo mecanismo` : ''}. La reincidencia en la misma persona apunta a exposición sostenida en su puesto o a controles que no cambiaron tras el primer evento.`,
        eventIds: ids,
      });
    }
  }

  /* ── B. Patrones globales: mecanismo × gravedad, × municipio, × tipo de afiliado, × fin de semana ── */
  const globalPairs: { dim: string; dimLabel: string; key: (e: EventRec) => string | null; label?: (v: string) => string; min: number }[] = [
    { dim: 'careBand', dimLabel: 'Atención', key: (e) => (e.severe ? 'grave' : null), label: () => 'Evento grave', min: 5 },
    { dim: 'municipality', dimLabel: 'Municipio', key: (e) => e.municipality, min: 6 },
    { dim: 'affiliateType', dimLabel: 'Tipo de afiliado', key: (e) => e.affiliateType, min: 6 },
    { dim: 'weekday', dimLabel: 'Cuándo', key: (e) => (isWeekend(e) ? 'finde' : null), label: () => 'Fin de semana', min: 6 },
  ];
  for (const g of globalPairs) {
    const valCount = new Map<string, number>();
    for (const e of informative) { const v = g.key(e); if (v) valCount.set(v, (valCount.get(v) ?? 0) + 1); }
    for (const [mech, mechN] of globalMech) {
      if (mechN < 10) continue;
      const subset = informative.filter((e) => e.mechGroup === mech);
      const byVal = new Map<string, EventRec[]>();
      for (const e of subset) { const v = g.key(e); if (!v || /^sin informaci/i.test(v)) continue; const arr = byVal.get(v) ?? []; arr.push(e); byVal.set(v, arr); }
      for (const [val, evts] of byVal) {
        const k = evts.length;
        if (k < g.min) continue;
        const p0 = (valCount.get(val) ?? 0) / N;
        const share = k / mechN;
        const lift = p0 ? share / p0 : 0;
        if (lift < 1.6) continue;
        const pValue = binomUpper(k, mechN, p0);
        if (pValue > 0.01) continue;
        const valLabel = g.label ? g.label(val) : val;
        const companiesN = new Set(evts.map((e) => e.company)).size;
        if (companiesN < 3) continue; // con una o dos empresas es un patrón de empresa, no del portafolio
        raw.push({
          id: id('G'),
          kind: 'global',
          title: g.dim === 'careBand'
            ? `${mechLabel(mech)} termina en evento grave con más frecuencia`
            : `${mechLabel(mech)} concentrado en ${g.dimLabel.toLowerCase()} ${valLabel}`,
          path: [stepMech(mech), { dim: g.dim, dimLabel: g.dimLabel, value: valLabel }],
          count: k,
          base: mechN,
          share,
          expectedShare: p0,
          lift,
          pValue,
          trend: makeTrend(evts.filter((e) => inPeriod(e, period.recent)).length, evts.filter((e) => inPeriod(e, period.previous)).length),
          daysLost: sumDays(evts),
          severe: evts.filter((e) => e.severe).length,
          explanation: g.dim === 'careBand'
            ? `${k} de ${mechN} eventos de ${mechLabel(mech).toLowerCase()} (${fmtPct(share)}) fueron graves, frente a ${fmtPct(globalSevere)} en todo el portafolio: ${fmtNum(lift, 1)} veces más. Afecta a ${companiesN} empresas.`
            : `${k} de ${mechN} eventos de ${mechLabel(mech).toLowerCase()} (${fmtPct(share)}) ocurren en ${valLabel}, cuando ese grupo concentra ${fmtPct(p0)} del total: ${fmtNum(lift, 1)} veces lo esperado. Involucra ${companiesN} empresas.`,
          eventIds: evts.map((e) => e.id),
        });
      }
    }
  }

  /* ── C. Entre empresas: un mismo mecanismo que se dispara en un mes en muchas empresas ── */
  const months = period.completeMonths;
  for (const [mech, mechN] of globalMech) {
    const lambda = mechN / Math.max(1, months.length);
    if (lambda < 2) continue;
    const byMonth = new Map<string, EventRec[]>();
    for (const e of informative) {
      if (e.mechGroup !== mech || !e.date) continue;
      const m = monthOf(e.date);
      if (!months.includes(m)) continue;
      const arr = byMonth.get(m) ?? [];
      arr.push(e);
      byMonth.set(m, arr);
    }
    for (const [m, evts] of byMonth) {
      const pValue = poissonUpper(evts.length, lambda);
      const cos = new Set(evts.map((e) => e.company)).size;
      if (pValue < 0.01 && cos >= 4 && evts.length >= lambda * 1.6) {
        raw.push({
          id: id('C'),
          kind: 'cross-company',
          title: `Pico de ${mechLabel(mech).toLowerCase()} en ${monthLabel(m, true)}`,
          path: [stepMech(mech), { dim: 'month', dimLabel: 'Mes', value: monthLabel(m, true) }, { dim: 'companies', dimLabel: 'Empresas', value: `${cos} distintas` }],
          count: evts.length,
          base: mechN,
          share: evts.length / mechN,
          expectedShare: 1 / months.length,
          lift: evts.length / lambda,
          pValue,
          trend: null,
          daysLost: sumDays(evts),
          severe: evts.filter((e) => e.severe).length,
          explanation: `En ${monthLabel(m, true)} hubo ${evts.length} eventos de ${mechLabel(mech).toLowerCase()} en ${cos} empresas distintas, ${fmtNum(evts.length / lambda, 1)} veces su promedio mensual (${fmtNum(lambda, 1)}). Al repartirse entre varias empresas, apunta a un factor común (temporada, clima, operación estacional) más que a una empresa puntual.`,
          eventIds: evts.map((e) => e.id),
        });
      }
    }
  }

  // Control de falsos positivos por pruebas múltiples sobre los patrones con p-valor real.
  const testable = raw.filter((p) => p.kind === 'company' || p.kind === 'global');
  const qs = benjaminiHochberg(testable.map((p) => p.pValue));
  testable.forEach((p, i) => { p.q = qs[i]; });

  return raw
    .filter((p) => p.kind !== 'global' || (p.q ?? 0) < 0.05)
    .map((p) => {
      const conf = p.kind === 'company' && p.lift < 1.2 ? (p.count >= 10 ? 'media' : 'baja') : confidence(p.count, p.q ?? p.pValue);
      const trendBoost = p.trend && (p.trend.direction === 'up' || p.trend.direction === 'new') ? 1.25 : 1;
      const score = p.count * (1 + Math.log2(Math.max(1, p.lift))) * trendBoost * (1 + p.severe / Math.max(1, p.count))
        * (p.kind === 'cluster' ? 1.2 : p.kind === 'worker' ? 1.1 : 1);
      const { q: _q, ...rest } = p;
      return { ...rest, confidence: conf, score: Math.round(score * 10) / 10 } satisfies Pattern;
    })
    .sort((a, b) => b.score - a.score);
}

