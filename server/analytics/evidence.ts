// Paquetes de evidencia: la única información que recibe la IA.
// Cada hecho tiene un id (F1, F2…) que la IA debe citar, y un enlace a los registros que lo producen.
// El verificador comprueba que toda cifra que la IA escriba exista en el paquete.

import type { FactRef, UnverifiedNumber } from '../../shared/types.ts';
import type { Analysis } from './engine.ts';
import { fmtNum, fmtPct } from '../lib/text.ts';
import { informativeMech, inPeriod, isWeekend, mechLabel } from './base.ts';
import { FACTOR_DOCS } from './scoring.ts';
import { monthLabel } from '../pipeline/dates.ts';

export interface FactPack {
  subject: string;
  facts: FactRef[];
  sections: { title: string; ids: string[] }[];
  unavailable: string[];
}

class Builder {
  facts: FactRef[] = [];
  sections: { title: string; ids: string[] }[] = [];
  private current: { title: string; ids: string[] } | null = null;
  private prefix: string;
  constructor(prefix = 'F') { this.prefix = prefix; }
  section(title: string) { this.current = { title, ids: [] }; this.sections.push(this.current); }
  add(label: string, value: string, link: { eventIds?: string[]; filter?: FactRef['filter'] } = {}): string {
    const id = `${this.prefix}${this.facts.length + 1}`;
    const eventIds = link.eventIds && link.eventIds.length > 400 ? undefined : link.eventIds;
    this.facts.push({ id, label, value, ...(eventIds ? { eventIds } : {}), ...(link.filter ? { filter: link.filter } : {}) });
    this.current?.ids.push(id);
    return id;
  }
}

function unavailableDims(a: Analysis): string[] {
  const has = (k: string) => a.at.some((e) => (e.extra as Record<string, unknown>)[k]);
  const out: string[] = [];
  if (!has('jobTitle')) out.push('cargo u ocupación del trabajador');
  if (!has('bodyPart')) out.push('parte del cuerpo afectada');
  if (!has('injuryType')) out.push('tipo de lesión o diagnóstico');
  if (!has('eventTime')) out.push('hora del accidente');
  if (!has('area')) out.push('área o sección (solo existe "centro de trabajo", que mezcla sedes, grupos de riesgo y áreas)');
  if (!has('process')) out.push('proceso o actividad que se realizaba');
  out.push('descripción narrativa del accidente', 'causas inmediatas y básicas de la investigación', 'número de trabajadores expuestos (no se pueden calcular tasas de frecuencia)');
  return out;
}

export function companyFacts(a: Analysis, key: string, prefix = 'F'): FactPack | null {
  const prof = a.profile(key);
  if (!prof) return null;
  const s = prof.summary;
  const b = new Builder(prefix);
  const evts = a.byCompany.get(key) ?? [];
  const p = a.period;

  b.section('Identificación y volumen');
  b.add('Empresa', `${s.name}${s.nit ? ` (NIT ${s.nit})` : ''}`);
  b.add('Período de datos', `${p.dataStart} a ${p.dataEnd}; meses completos: ${p.completeMonths.length}`);
  b.add('Accidentes de trabajo de la empresa', `${s.eventsAT}`, { eventIds: prof.eventIds });
  b.add('Participación en el total del portafolio', `${fmtPct(s.share, 1)}; posición ${s.rank} de ${a.byCompany.size} empresas por número de accidentes`);
  b.add('Percentil de la empresa por número de accidentes', fmtPct(prof.peers.percentileEvents, 0));
  if (s.eventsEL) b.add('Enfermedades laborales calificadas', `${s.eventsEL}`, { eventIds: prof.elEvents.map((e) => e.id) });
  b.add('Primer y último accidente', `${s.first ?? 'sin fecha'} y ${s.last ?? 'sin fecha'}`);

  b.section('Evolución');
  const t = s.trend;
  b.add('Accidentes últimos 6 meses completos vs 6 anteriores', `${t.recent} (${p.recent.label}) vs ${t.previous} (${p.previous.label})${t.change !== null ? `; cambio ${t.change > 0 ? '+' : ''}${fmtPct(t.change, 0)}` : ''}; prueba binomial p = ${fmtNum(t.pValue ?? 1, 3)}${t.significant ? ' (significativo)' : ' (no significativo)'}`,
    { eventIds: evts.filter((e) => inPeriod(e, p.recent)).map((e) => e.id) });
  const y = s.yoy;
  if (y) {
    b.add(`Año contra año, mismos meses (${y.currentLabel} vs ${y.previousLabel})`,
      `${y.current} vs ${y.previous} accidentes${y.change !== null ? ` (${y.change > 0 ? '+' : ''}${fmtPct(y.change, 0)})` : ''}; graves ${y.severeCurrent} vs ${y.severePrevious}; días de incapacidad ${fmtNum(y.daysCurrent)} vs ${fmtNum(y.daysPrevious)}; prueba binomial p = ${fmtNum(y.pValue ?? 1, 3)}${y.significant ? ' (significativo)' : ' (no significativo)'}; año ${y.previousYear} completo: ${y.previousFullYear}`);
    const yc = prof.yearCompare;
    if (yc) {
      const moved = yc.mechanisms.filter((m) => m.current !== m.previous).slice(0, 6).map((m) => `${m.label} ${m.previous}→${m.current}`).join('; ');
      if (moved) b.add(`Mecanismos ${y.previousYear} → ${y.currentYear} (mismos meses)`, moved);
      if (yc.newMechanisms.length) b.add(`Mecanismos nuevos en ${y.currentYear}`, yc.newMechanisms.join(', '));
    }
  }
  const series = prof.monthly.filter((m) => m.count > 0).map((m) => `${monthLabel(m.month)}: ${m.count}`).join(', ');
  b.add('Accidentes por mes (meses con eventos)', series || 'ninguno');
  for (const an of prof.anomalies) b.add(`Mes anómalo (${an.kind === 'spike' ? 'pico' : 'caída'})`, `${an.label}; p = ${fmtNum(an.pValue, 4)}`);

  b.section('Mecanismos');
  const inf = evts.filter((e) => informativeMech(e.mechGroup)).length;
  for (const m of prof.mechanisms.slice(0, 8)) {
    const sub = evts.filter((e) => e.mechGroup === m.key);
    const r = sub.filter((e) => inPeriod(e, p.recent)).length;
    const pr = sub.filter((e) => inPeriod(e, p.previous)).length;
    b.add(`Mecanismo: ${m.label}`, `${m.count} accidentes (${fmtPct(m.share, 1)} de la empresa); ${m.severe ?? 0} graves; ${fmtNum(m.days ?? 0)} días de incapacidad; últimos 6 meses ${r} vs ${pr} anteriores`, { eventIds: sub.map((e) => e.id) });
  }
  b.add('Accidentes con mecanismo informado', `${inf} de ${s.eventsAT}`);
  const detail = prof.mechanismDetail.slice(0, 6).map((d) => `${d.label} (${d.count})`).join('; ');
  if (detail) b.add('Descripción detallada del mecanismo según la ARL', detail);

  b.section('Dónde');
  for (const w of prof.workCenters.slice(0, 6)) b.add(`Centro de trabajo: ${w.label}`, `${w.count} accidentes (${fmtPct(w.share, 1)})`, { eventIds: evts.filter((e) => e.workCenter === w.key).map((e) => e.id) });
  for (const m of prof.municipalities.slice(0, 4)) b.add(`Municipio: ${m.label}`, `${m.count} accidentes`);
  for (const d of prof.extraDims) for (const v of d.dist.slice(0, 5)) b.add(`${d.label}: ${v.label}`, `${v.count} accidentes (${fmtPct(v.share, 1)})`);

  b.section('Cuándo');
  const we = evts.filter(isWeekend).length;
  b.add('Accidentes en fin de semana', `${we} de ${s.eventsAT} (${fmtPct(s.eventsAT ? we / s.eventsAT : 0, 0)}); portafolio: ${fmtPct(a.at.filter(isWeekend).length / (a.at.length || 1), 0)}`);
  const wd = prof.weekdays.filter((d) => d.count).map((d) => `${d.label} ${d.count}`).join(', ');
  b.add('Accidentes por día de la semana', wd || 'sin datos');

  b.section('Severidad');
  b.add('Eventos graves (quirúrgico, hospitalario, UCI, ≥30 días o PCL>0)', `${s.severe}`, { eventIds: prof.severeEvents.map((e) => e.id) });
  b.add('Días de incapacidad', `${fmtNum(s.daysLost)} en total; ${fmtNum(prof.peers.daysPerEvent, 1)} por accidente; portafolio ${fmtNum(prof.peers.globalDaysPerEvent, 1)} por accidente`);
  for (const c of prof.careLevels.slice(0, 6)) b.add(`Nivel de atención: ${c.label}`, `${c.count}`);
  const pcl = evts.filter((e) => (e.pcl ?? 0) > 0);
  if (pcl.length) b.add('Pérdida de capacidad laboral calificada', pcl.map((e) => `${fmtNum(e.pcl!, 2)} %`).join(', '), { eventIds: pcl.map((e) => e.id) });
  for (const e of prof.severeEvents.slice(0, 5)) {
    b.add(`Evento grave ${e.eventNo ?? e.id}`, `${e.date}; ${mechLabel(e.mechGroup ?? 'sin-info')}; ${e.careLevel ?? 'atención sin dato'}; ${e.daysLost ?? 0} días${e.workCenter ? `; ${e.workCenter}` : ''}`, { eventIds: [e.id] });
  }

  b.section('Recurrencia');
  b.add('Trabajadores distintos accidentados', `${s.workers}`);
  b.add('Trabajadores con 2 o más accidentes', `${s.repeatWorkers}`, { eventIds: prof.repeatWorkers.flatMap((w) => w.eventIds) });
  for (const w of prof.repeatWorkers.slice(0, 4)) b.add(`Trabajador ${w.worker}`, `${w.count} accidentes: ${w.mechGroups.join(', ')}`, { eventIds: w.eventIds });
  for (const c of prof.clusters.slice(0, 4)) b.add(`Racha de ${mechLabel(c.mechGroup).toLowerCase()}`, `${c.count} accidentes entre ${c.start} y ${c.end} (${c.days} días)`, { eventIds: c.eventIds });
  for (const pt of prof.patterns.filter((x) => x.kind === 'company').slice(0, 5)) {
    b.add(`Patrón: ${pt.path.map((x) => x.value).join(' → ')}`, `${pt.explanation} Confianza ${pt.confidence}; p = ${fmtNum(pt.pValue, 4)}`, { eventIds: pt.eventIds });
  }

  b.section('Gestión SOC y comparación');
  for (const c of prof.contactStatuses.slice(0, 4)) b.add(`Estado de gestión: ${c.label}`, `${c.count} eventos`);
  if (s.advisor) b.add('Asesor SOC asignado', s.advisor);
  b.add('Tipo de afiliado', prof.affiliateTypes.map((d) => `${d.label} ${d.count}`).join(', ') || 'sin dato');
  b.add('Percentil de severidad media frente al portafolio', fmtPct(prof.peers.percentileSeverity, 0));

  b.section('Puntaje de riesgo SOC AI');
  b.add('Puntaje y nivel', `${s.score.score}/100, nivel ${s.score.level}`);
  for (const f of s.score.factors) b.add(`Factor ${f.label}`, `+${f.points} de ${f.weight}: ${f.reason}`);
  for (const c of s.score.caps) b.add('Regla aplicada', c);

  return { subject: s.name, facts: b.facts, sections: b.sections, unavailable: unavailableDims(a) };
}

export function overviewFacts(a: Analysis): FactPack {
  const o = a.overview();
  const k = o.kpis;
  const p = a.period;
  const b = new Builder('F');

  b.section('Portafolio');
  b.add('Período de datos', `${p.dataStart} a ${p.dataEnd}${p.partialMonth ? `; ${monthLabel(p.partialMonth)} incompleto y excluido de tendencias` : ''}`);
  b.add('Empresas con eventos', `${k.companies}`);
  b.add('Accidentes de trabajo', `${k.eventsAT}`, { filter: { cls: 'AT' } });
  b.add('Enfermedades laborales calificadas', `${k.eventsEL}`, { filter: { cls: 'EL' } });
  b.add('Días de incapacidad', `${fmtNum(k.daysLost)}; ${fmtNum(k.daysPerEvent, 1)} por accidente`);
  b.add('Accidentes graves', `${k.severe} (${fmtPct(k.severe / (k.eventsAT || 1), 1)})`, { filter: { cls: 'AT', severe: true } });
  b.add('Último semestre vs anterior', `${k.recentEvents} (${p.recent.label}) vs ${k.previousEvents} (${p.previous.label})${k.recentChange !== null ? `; ${k.recentChange > 0 ? '+' : ''}${fmtPct(k.recentChange, 1)}` : ''}; p = ${fmtNum(k.recentPValue ?? 1, 3)}`);
  if (k.ytd) b.add('Año contra año (mismos meses)', `${k.ytd.current} vs ${k.ytd.previous}${k.ytd.change !== null ? ` (${k.ytd.change > 0 ? '+' : ''}${fmtPct(k.ytd.change, 1)})` : ''}; ${k.ytd.label}`);
  b.add('Concentración', `las 10 empresas con más accidentes suman ${fmtPct(k.top10Share, 1)}; ${o.pareto.map((x) => `top ${x.companies}: ${fmtPct(x.share, 1)}`).join(', ')}`);
  b.add('Niveles de riesgo', `crítico ${o.levels.critico}, prioritario ${o.levels.prioritario}, atención ${o.levels.atencion}, controlado ${o.levels.controlado}`);
  b.add('Trabajadores con 2 o más accidentes', `${k.repeatWorkers}`);

  b.section('Mecanismos');
  for (const m of o.mechanisms.filter((x) => informativeMech(x.key)).slice(0, 10)) {
    const sub = a.at.filter((e) => e.mechGroup === m.key);
    const r = sub.filter((e) => inPeriod(e, p.recent)).length;
    const pr = sub.filter((e) => inPeriod(e, p.previous)).length;
    b.add(`Mecanismo: ${m.label}`, `${m.count} (${fmtPct(m.share, 1)}); ${m.severe ?? 0} graves; últimos 6 meses ${r} vs ${pr}`, { filter: { mechGroup: m.key, cls: 'AT' } });
  }

  b.section('Empresas bajo atención');
  for (const s of o.attention.slice(0, 15)) {
    b.add(`Empresa: ${s.name} [${s.key}]`, `${s.score.score}/100 ${s.score.level}; ${s.eventsAT} accidentes; semestre ${s.trend.previous}→${s.trend.recent}; ${s.severe} graves; ${s.repeatWorkers} reincidentes; mecanismo principal ${s.topMechanism ?? 'sin dato'}; gestión: ${s.contactStatus ?? 'sin dato'}${s.contactGap ? ' (sin cita ejecutada en la mayoría)' : ''}; razones: ${s.score.factors.filter((f) => f.points > 0).slice(0, 3).map((f) => `+${f.points} ${f.reason}`).join(' | ')}`,
      { filter: { company: s.key } });
  }

  b.section('Patrones');
  for (const pt of a.patterns.filter((x) => x.kind !== 'worker').slice(0, 14)) {
    b.add(`Patrón (${pt.kind}): ${pt.title}`, `${pt.explanation} Confianza ${pt.confidence}.`, { eventIds: pt.eventIds });
  }

  b.section('Insights calculados');
  for (const i of o.insights) b.add(`Insight: ${i.title}`, i.finding, { eventIds: i.eventIds.length ? i.eventIds : undefined, filter: i.filter });

  b.section('Gestión SOC');
  for (const c of o.contactStatuses.slice(0, 6)) b.add(`Estado de gestión: ${c.label}`, `${c.count} eventos (${fmtPct(c.share, 1)})`);

  return { subject: 'Portafolio SOC', facts: b.facts, sections: b.sections, unavailable: unavailableDims(a) };
}

export function methodologyText(): string {
  return FACTOR_DOCS.map((f) => `- ${f.label}: ${f.doc}`).join('\n');
}

/**
 * Versión reducida de un paquete para modelos con poco presupuesto de tokens: recorta valores largos
 * y descarta los últimos hechos de cada sección hasta caber. La verificación usa este mismo subconjunto.
 */
export function compactPack(pack: FactPack, maxChars: number): FactPack {
  const facts = pack.facts.map((f) => ({ ...f, value: f.value.length > 210 ? `${f.value.slice(0, 207)}...` : f.value }));
  const byId = new Map(facts.map((f) => [f.id, f]));
  const sections = pack.sections.map((s) => ({ title: s.title, ids: [...s.ids] }));
  const size = () => sections.reduce((a, s) => a + s.title.length + s.ids.reduce((b, id) => b + byId.get(id)!.label.length + byId.get(id)!.value.length + 8, 0), 0);
  // Quita de la sección más larga hasta caber, conservando siempre los dos primeros hechos de cada una.
  while (size() > maxChars) {
    const longest = [...sections].filter((s) => s.ids.length > 2).sort((a, b) => b.ids.length - a.ids.length)[0];
    if (!longest) break;
    longest.ids.pop();
  }
  const keep = new Set(sections.flatMap((s) => s.ids));
  return { subject: pack.subject, facts: facts.filter((f) => keep.has(f.id)), sections, unavailable: pack.unavailable.slice(0, 4) };
}

export function packToText(pack: FactPack): string {
  const lines: string[] = [`# Paquete de evidencia: ${pack.subject}`];
  const byId = new Map(pack.facts.map((f) => [f.id, f]));
  for (const s of pack.sections) {
    lines.push(`\n## ${s.title}`);
    for (const id of s.ids) {
      const f = byId.get(id)!;
      lines.push(`[${f.id}] ${f.label}: ${f.value}`);
    }
  }
  lines.push('\n## Datos que NO existen en el archivo (no inferir ni inventar)');
  for (const u of pack.unavailable) lines.push(`- ${u}`);
  return lines.join('\n');
}

/* ───────────────────────── Verificación de cifras ───────────────────────── */

const NUM_RE = /(?<![A-Za-z0-9-])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\d])/g;

function parseNum(tok: string): number {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(tok)) return Number(tok.replace(/\./g, '').replace(',', '.'));
  return Number(tok.replace(',', '.'));
}

export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const n = parseNum(m[1]!);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// Normas y referencias que la IA puede citar sin que sean cifras del dataset.
const NORM_NUMBERS = new Set([1401, 2007, 312, 2019, 1072, 2015, 4272, 2021, 40595, 2022, 1496, 2018, 351, 2014, 1503, 2011, 1562, 2012, 2400, 1979]);

export function allowedNumbers(texts: string[]): number[] {
  const out = new Set<number>();
  for (const t of texts) for (const n of numbersIn(t)) out.add(n);
  return [...out];
}

function isAllowed(x: number, allowed: number[]): boolean {
  if (x >= 2000 && x <= 2100 && Number.isInteger(x)) return true;   // años
  if (NORM_NUMBERS.has(x)) return true;
  if (x === 6 || x === 12) return true;                              // ventanas de comparación del método
  for (const a of allowed) {
    if (a === x) return true;
    if (Number.isInteger(x) && !Number.isInteger(a) && Math.abs(a - x) < 0.5) return true;  // redondeo a entero
    if (!Number.isInteger(x) && Math.abs(a - x) <= 0.051) return true;                       // redondeo a 1 decimal
  }
  return false;
}

/** Revisa los campos analíticos de un resultado de IA y devuelve las cifras sin respaldo. */
export function verifyNumbers(fields: { field: string; text: string }[], allowed: number[]): UnverifiedNumber[] {
  const out: UnverifiedNumber[] = [];
  const seen = new Set<string>();
  for (const { field, text } of fields) {
    const clean = text.replace(/\[?\b[A-DF]\d{1,3}\b\]?/g, ' ').replace(/\bT-[0-9a-f]{6}\b/g, ' ');
    for (const m of clean.matchAll(NUM_RE)) {
      const n = parseNum(m[1]!);
      if (!Number.isFinite(n) || isAllowed(n, allowed)) continue;
      const key = `${field}|${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ field, value: m[1]! });
    }
  }
  return out;
}

export function packNumbers(pack: FactPack): number[] {
  return allowedNumbers(pack.facts.flatMap((f) => [f.label, f.value]));
}
