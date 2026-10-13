// Analytics engine: un objeto inmutable por dataset + configuración de puntaje.
// Todo cálculo numérico de la aplicación sale de aquí; la IA solo recibe sus resultados.

import type {
  AdvisorSummary, Anomaly, ApaAdvisor, CompanyProfile, CompanyRec, CompanySummary, DatasetSummary, Dist, EventFilter, EventRec, EventsPage,
  HeatmapData, Insight, Overview, Pattern, PeriodInfo, RiskLevel, ScoringConfig, TrendsData,
} from '../../shared/types.ts';
import { mean, percentileRank, poissonLower, poissonUpper, quantile } from '../lib/stats.ts';
import { fold } from '../lib/text.ts';
import { daysBetween, monthLabel, monthOf } from '../pipeline/dates.ts';
import { contactDone, CARE_RANK_LABEL } from '../pipeline/taxonomy.ts';
import {
  buildPeriod, dist, eventTime, informativeMech, inPeriod, makeTrend, mechLabel, monthly, trendOf, weekdayDist,
} from './base.ts';
import { detectPatterns, findClusters } from './patterns.ts';
import { scoreCompany } from './scoring.ts';
import { buildInsights } from './insights.ts';
import { yearCompare, yearOverYear } from './yoy.ts';

export interface Dataset {
  summary: DatasetSummary;
  events: EventRec[];
  companies: CompanyRec[];
}

const LEVEL_ORDER: RiskLevel[] = ['critico', 'prioritario', 'atencion', 'controlado'];

export class Analysis {
  readonly ds: Dataset;
  readonly cfg: ScoringConfig;
  readonly period: PeriodInfo;
  readonly at: EventRec[];
  readonly el: EventRec[];
  readonly byId = new Map<string, EventRec>();
  readonly companies = new Map<string, CompanyRec>();
  readonly byCompany = new Map<string, EventRec[]>();       // AT por empresa
  readonly elByCompany = new Map<string, EventRec[]>();
  readonly summaries = new Map<string, CompanySummary>();
  readonly anomaliesByCompany = new Map<string, Anomaly[]>();
  readonly patterns: Pattern[];
  readonly insights: Insight[];
  readonly globalDaysPerEvent: number;
  readonly globalAnomalies: Anomaly[];
  readonly spanDays: number;

  constructor(ds: Dataset, cfg: ScoringConfig, onStep?: (step: 'empresas' | 'anomalias' | 'patrones' | 'insights', ms: number) => void) {
    let mark = performance.now();
    const step = (id: 'empresas' | 'anomalias' | 'patrones' | 'insights') => {
      const now = performance.now();
      onStep?.(id, Math.round(now - mark));
      mark = now;
    };
    this.ds = ds;
    this.cfg = cfg;
    for (const c of ds.companies) this.companies.set(c.key, c);
    for (const e of ds.events) {
      // "N/A" en la columna de asesor APA significa que no hay asesor APA.
      if (e.advisorSecondary && /^n\s*\/?\s*a$/i.test(e.advisorSecondary.trim())) e.advisorSecondary = null;
      if (e.advisor && /^n\s*\/?\s*a$/i.test(e.advisor.trim())) e.advisor = null;
      this.byId.set(e.id, e);
    }
    this.at = ds.events.filter((e) => e.cls === 'AT');
    this.el = ds.events.filter((e) => e.cls === 'EL');
    for (const e of this.at) push(this.byCompany, e.company, e);
    for (const e of this.el) push(this.elByCompany, e.company, e);
    this.period = buildPeriod(this.at);
    this.spanDays = this.period.dataStart && this.period.dataEnd ? daysBetween(this.period.dataStart, this.period.dataEnd) + 1 : 365;
    this.globalDaysPerEvent = this.at.length ? this.at.reduce((a, e) => a + (e.daysLost ?? 0), 0) / this.at.length : 0;

    const counts = [...this.byCompany.values()].map((a) => a.length).sort((a, b) => a - b);
    const pRef = quantile(counts, 0.95);
    const months = this.period.completeMonths;
    const lastThree = new Set(months.slice(-3));

    for (const [key, evts] of this.byCompany) this.anomaliesByCompany.set(key, monthlyAnomalies(monthly(evts, months).map((p) => p.count), months, 3, 0.005));

    const ranked = [...this.byCompany.entries()].sort((a, b) => b[1].length - a[1].length);
    const rankOf = new Map(ranked.map(([k], i) => [k, i + 1]));
    const keys = new Set([...this.byCompany.keys(), ...this.elByCompany.keys()]);
    for (const key of keys) {
      const evts = this.byCompany.get(key) ?? [];
      const els = this.elByCompany.get(key) ?? [];
      const co = this.companies.get(key)!;
      const trend = trendOf(evts, this.period);
      const clusters = findClusters(evts, this.spanDays);
      const workerCount = new Map<string, number>();
      for (const e of evts) if (e.worker) workerCount.set(e.worker, (workerCount.get(e.worker) ?? 0) + 1);
      const repeatWorkers = [...workerCount.values()].filter((n) => n >= 2).length;
      const anomalies = this.anomaliesByCompany.get(key) ?? [];
      const score = scoreCompany({
        at: evts,
        el: els.length,
        trend,
        recentSpike: anomalies.some((a) => a.kind === 'spike' && a.month && lastThree.has(a.month)),
        clusters: clusters.length,
        repeatWorkers,
        period: this.period,
        pRef,
        globalDaysPerEvent: this.globalDaysPerEvent,
      }, cfg);
      const mechs = dist(evts.filter((e) => informativeMech(e.mechGroup)), (e) => e.mechGroup, mechLabel);
      const statuses = dist(evts, (e) => e.contactStatus);
      const done = evts.filter((e) => contactDone(e.contactStatus)).length;
      const dates = evts.map((e) => e.date).filter((d): d is string => !!d).sort();
      this.summaries.set(key, {
        key,
        name: co.name,
        nit: co.nit,
        events: evts.length + els.length,
        eventsAT: evts.length,
        eventsEL: els.length,
        daysLost: evts.reduce((a, e) => a + (e.daysLost ?? 0), 0),
        severe: evts.filter((e) => e.severe).length,
        workers: workerCount.size,
        repeatWorkers,
        first: dates[0] ?? null,
        last: dates[dates.length - 1] ?? null,
        topMechanism: mechs[0]?.label ?? null,
        topMechanismShare: mechs[0] && evts.length ? mechs[0].count / evts.length : 0,
        trend,
        score,
        advisor: dist(evts.length ? evts : els, (e) => e.advisor ?? e.advisorSecondary)[0]?.label ?? null,
        contactStatus: statuses[0]?.label ?? null,
        contactGap: evts.length > 0 && statuses.length > 0 && done / evts.length < 0.5,
        sparkline: monthly(evts, months).map((p) => p.count),
        municipality: dist(evts, (e) => e.municipality)[0]?.label ?? null,
        share: this.at.length ? evts.length / this.at.length : 0,
        rank: rankOf.get(key) ?? keys.size,
        yoy: yearOverYear(evts, this.period),
        advisors: uniq([...evts, ...els].map((e) => e.advisor)),
        apaAdvisors: uniq([...evts, ...els].map((e) => e.advisorSecondary)),
      });
    }

    step('empresas');
    this.globalAnomalies = monthlyAnomalies(monthly(this.at, months).map((p) => p.count), months, 1, 0.01);
    step('anomalias');
    this.patterns = detectPatterns({ at: this.at, byCompany: this.byCompany, companies: this.companies, period: this.period });
    step('patrones');
    this.insights = buildInsights(this);
    step('insights');
  }

  companyName(key: string): string {
    return this.companies.get(key)?.name ?? key;
  }

  list(): CompanySummary[] {
    return [...this.summaries.values()].sort((a, b) => b.score.score - a.score.score || b.eventsAT - a.eventsAT);
  }

  levels(): Record<RiskLevel, number> {
    const out = { critico: 0, prioritario: 0, atencion: 0, controlado: 0 } as Record<RiskLevel, number>;
    for (const s of this.summaries.values()) out[s.score.level]++;
    return out;
  }

  overview(): Overview {
    const p = this.period;
    const recent = this.at.filter((e) => inPeriod(e, p.recent)).length;
    const previous = this.at.filter((e) => inPeriod(e, p.previous)).length;
    const t = makeTrend(recent, previous);
    let ytd: Overview['kpis']['ytd'] = null;
    if (p.ytd) {
      const cur = this.at.filter((e) => inPeriod(e, p.ytd!.current)).length;
      const prev = this.at.filter((e) => inPeriod(e, p.ytd!.previousYear)).length;
      ytd = { current: cur, previous: prev, change: prev ? (cur - prev) / prev : null, label: `${p.ytd.current.label} vs. ${p.ytd.previousYear.label}` };
    }
    const list = this.list();
    const byEvents = [...list].sort((a, b) => b.eventsAT - a.eventsAT);
    const mechs = dist(this.at, (e) => e.mechGroup, mechLabel);
    const topMech = mechs.find((m) => informativeMech(m.key));
    const levels = this.levels();
    const sortedCounts = byEvents.map((s) => s.eventsAT);
    const total = this.at.length || 1;
    const pareto: { companies: number; share: number }[] = [];
    let acc = 0;
    sortedCounts.forEach((c, i) => {
      acc += c;
      if ([1, 3, 5, 10, 20, 50, 100].includes(i + 1)) pareto.push({ companies: i + 1, share: acc / total });
    });
    const repeat = list.reduce((a, s) => a + s.repeatWorkers, 0);
    return {
      dataset: this.ds.summary,
      period: p,
      kpis: {
        companies: this.summaries.size,
        companiesWithEvents: this.byCompany.size,
        eventsAT: this.at.length,
        eventsEL: this.el.length,
        daysLost: this.at.reduce((a, e) => a + (e.daysLost ?? 0), 0),
        severe: this.at.filter((e) => e.severe).length,
        recentEvents: recent,
        previousEvents: previous,
        recentChange: t.change,
        recentPValue: t.pValue,
        ytd,
        topCompany: byEvents[0] ? { key: byEvents[0].key, name: byEvents[0].name, events: byEvents[0].eventsAT, share: byEvents[0].share } : null,
        topMechanism: topMech ? { label: topMech.label, count: topMech.count, share: topMech.share } : null,
        criticalCompanies: levels.critico,
        priorityCompanies: levels.prioritario,
        recurringPatterns: this.patterns.filter((x) => x.kind === 'company' || x.kind === 'cluster').length,
        repeatWorkers: repeat,
        daysPerEvent: this.globalDaysPerEvent,
        top10Share: sortedCounts.slice(0, 10).reduce((a, b) => a + b, 0) / total,
      },
      levels,
      monthly: monthly(this.at, p.completeMonths),
      mechanisms: mechs,
      weekdays: weekdayDist(this.at),
      careLevels: dist(this.at, (e) => e.careLevel),
      eventTypes: dist(this.at, (e) => e.eventType),
      municipalities: dist(this.at, (e) => e.municipality),
      contactStatuses: dist(this.at, (e) => e.contactStatus),
      advisors: dist(this.at, (e) => e.advisor, (k) => k, { includeNull: 'Sin asesor asignado' }),
      attention: list.filter((s) => s.score.level === 'critico' || s.score.level === 'prioritario'),
      topPatterns: this.patterns.slice(0, 12),
      insights: this.insights,
      pareto,
    };
  }

  profile(key: string): CompanyProfile | null {
    const summary = this.summaries.get(key);
    if (!summary) return null;
    const evts = this.byCompany.get(key) ?? [];
    const months = this.period.completeMonths;
    const byWorker = new Map<string, EventRec[]>();
    for (const e of evts) if (e.worker) push(byWorker, e.worker, e);
    const counts = [...this.byCompany.values()].map((a) => a.length).sort((a, b) => a - b);
    const sevs = [...this.byCompany.values()].map((a) => mean(a.map((e) => e.severity))).sort((a, b) => a - b);
    const extraDims: CompanyProfile['extraDims'] = [];
    const extraLabels = { jobTitle: 'Cargo', bodyPart: 'Parte del cuerpo', injuryType: 'Tipo de lesión', area: 'Área', process: 'Proceso' } as const;
    for (const d of Object.keys(extraLabels) as (keyof typeof extraLabels)[]) {
      const dd = dist(evts, (e) => e.extra[d] ?? null);
      if (dd.length) extraDims.push({ dim: d, label: extraLabels[d], dist: dd });
    }
    return {
      summary,
      yearCompare: yearCompare(evts, this.period),
      monthly: monthly(evts, months),
      mechanisms: dist(evts, (e) => e.mechGroup, mechLabel),
      mechanismDetail: dist(evts, (e) => e.mechanism),
      workCenters: dist(evts, (e) => e.workCenter),
      careLevels: dist(evts, (e) => e.careLevel),
      eventTypes: dist(evts, (e) => e.eventType),
      municipalities: dist(evts, (e) => e.municipality),
      affiliateTypes: dist(evts, (e) => e.affiliateType),
      contactStatuses: dist(evts, (e) => e.contactStatus),
      weekdays: weekdayDist(evts),
      extraDims,
      anomalies: this.anomaliesByCompany.get(key) ?? [],
      clusters: findClusters(evts, this.spanDays),
      repeatWorkers: [...byWorker.entries()].filter(([, a]) => a.length >= 2).map(([worker, a]) => ({
        worker, count: a.length, mechGroups: [...new Set(a.map((e) => mechLabel(e.mechGroup ?? 'sin-info')))], eventIds: a.map((e) => e.id),
      })).sort((a, b) => b.count - a.count),
      patterns: this.patterns.filter((p) => p.company === key),
      peers: {
        percentileEvents: percentileRank(counts, evts.length),
        percentileSeverity: percentileRank(sevs, mean(evts.map((e) => e.severity))),
        daysPerEvent: evts.length ? summary.daysLost / evts.length : 0,
        globalDaysPerEvent: this.globalDaysPerEvent,
      },
      elEvents: this.elByCompany.get(key) ?? [],
      severeEvents: evts.filter((e) => e.severe).sort((a, b) => b.severity - a.severity),
      eventIds: evts.map((e) => e.id),
    };
  }

  trends(): TrendsData {
    const months = this.period.completeMonths;
    const mechKeys = dist(this.at, (e) => e.mechGroup).filter((d) => informativeMech(d.key)).slice(0, 10);
    const byMechanism = mechKeys.map((d) => {
      const evts = this.at.filter((e) => e.mechGroup === d.key);
      return { key: d.key, label: mechLabel(d.key), series: monthly(evts, months).map((p) => p.count), trend: trendOf(evts, this.period) };
    });
    let yoy: TrendsData['yoy'] = null;
    if (this.period.ytd) {
      const cur = this.period.ytd.current;
      const all = monthly(this.at, months);
      const byMonth = new Map(all.map((p) => [p.month, p.count]));
      yoy = [];
      for (let m = cur.start; m <= cur.end; m = nextMonth(m)) {
        const prev = `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
        yoy.push({ month: m.slice(5), label: monthLabel(m).split(' ')[0]!, current: byMonth.get(m) ?? 0, previous: byMonth.get(prev) ?? 0 });
      }
    }
    const trendsList = this.list().filter((s) => s.trend.recent + s.trend.previous >= 4);
    const risers = trendsList.filter((s) => s.trend.direction === 'up' || s.trend.direction === 'new')
      .sort((a, b) => (b.trend.recent - b.trend.previous) - (a.trend.recent - a.trend.previous)).slice(0, 10)
      .map((s) => ({ key: s.key, name: s.name, trend: s.trend }));
    const fallers = trendsList.filter((s) => s.trend.direction === 'down')
      .sort((a, b) => (a.trend.recent - a.trend.previous) - (b.trend.recent - b.trend.previous)).slice(0, 10)
      .map((s) => ({ key: s.key, name: s.name, trend: s.trend }));
    const lags = this.at.filter((e) => e.date && e.qualDate).map((e) => daysBetween(e.date!, e.qualDate!)).filter((d) => d >= 0).sort((a, b) => a - b);
    return {
      period: this.period,
      monthly: monthly(this.at, months),
      byMechanism,
      months,
      yoy,
      weekdays: weekdayDist(this.at),
      severityMonthly: monthly(this.at, months).map((p) => ({ month: p.month, severe: p.severe, days: p.days, count: p.count })),
      anomalies: this.globalAnomalies,
      risers,
      fallers,
      lag: lags.length ? { median: quantile(lags, 0.5), p90: quantile(lags, 0.9), over15: lags.filter((d) => d > 15).length, n: lags.length } : null,
    };
  }

  heatmap(rowDim: string, colDim: string, limit = 15): HeatmapData {
    const acc = accessor(rowDim, this);
    const cacc = accessor(colDim, this);
    const base = this.at.filter((e) => acc.get(e) && cacc.get(e));
    const rows = dist(base, acc.get, acc.label).slice(0, limit);
    const cols = colDim === 'month'
      ? this.period.completeMonths.map((m) => ({ key: m, label: monthLabel(m), count: base.filter((e) => cacc.get(e) === m).length }))
      : dist(base, cacc.get, cacc.label).slice(0, 12);
    const ri = new Map(rows.map((r, i) => [r.key, i]));
    const ci = new Map(cols.map((c, i) => [c.key, i]));
    const cells = rows.map(() => cols.map(() => 0));
    for (const e of base) {
      const r = ri.get(acc.get(e)!);
      const c = ci.get(cacc.get(e)!);
      if (r !== undefined && c !== undefined) cells[r]![c]!++;
    }
    return {
      rowDim, colDim,
      rows: rows.map((r) => ({ key: r.key, label: r.label, total: r.count })),
      cols: cols.map((c) => ({ key: c.key, label: c.label, total: c.count })),
      cells,
    };
  }

  filterEvents(f: EventFilter): EventRec[] {
    const ids = f.ids ? new Set(f.ids) : null;
    const q = f.q ? fold(f.q) : '';
    return this.ds.events.filter((e) => {
      if (ids && !ids.has(e.id)) return false;
      if (f.cls && e.cls !== f.cls) return false;
      if (f.company && e.company !== f.company) return false;
      const t = eventTime(e);
      if (f.from && (!t || t < f.from)) return false;
      if (f.to && (!t || t > f.to)) return false;
      if (f.mechGroup && e.mechGroup !== f.mechGroup) return false;
      if (f.eventType && e.eventType !== f.eventType) return false;
      if (f.careLevel && e.careLevel !== f.careLevel) return false;
      if (f.municipality && e.municipality !== f.municipality) return false;
      if (f.workCenter && e.workCenter !== f.workCenter) return false;
      if (f.advisor && e.advisor !== f.advisor) return false;
      if (f.advisorSecondary && e.advisorSecondary !== f.advisorSecondary) return false;
      if (f.contactStatus && e.contactStatus !== f.contactStatus) return false;
      if (f.severe !== undefined && e.severe !== f.severe) return false;
      if (q) {
        const hay = fold(`${this.companyName(e.company)} ${e.eventNo ?? ''} ${e.workCenter ?? ''} ${e.mechanism ?? ''} ${e.municipality ?? ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  events(f: EventFilter, offset = 0, limit = 50, sort = '-date'): EventsPage {
    const rows = this.filterEvents(f);
    const desc = sort.startsWith('-');
    const field = sort.replace(/^-/, '') as 'date' | 'daysLost' | 'severity' | 'company';
    rows.sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      if (field === 'company') { va = this.companyName(a.company); vb = this.companyName(b.company); }
      else if (field === 'date') { va = eventTime(a) ?? ''; vb = eventTime(b) ?? ''; }
      else { va = a[field] ?? -1; vb = b[field] ?? -1; }
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return desc ? -r : r;
    });
    const facets: Record<string, Dist[]> = {
      mechGroup: dist(rows, (e) => e.mechGroup, mechLabel),
      eventType: dist(rows, (e) => e.eventType),
      careLevel: dist(rows, (e) => e.careLevel),
      municipality: dist(rows, (e) => e.municipality).slice(0, 30),
      advisor: dist(rows, (e) => e.advisor),
      advisorSecondary: dist(rows, (e) => e.advisorSecondary),
      contactStatus: dist(rows, (e) => e.contactStatus),
      cls: dist(rows, (e) => e.cls),
    };
    return {
      total: rows.length,
      rows: rows.slice(offset, offset + limit).map((e) => ({ ...e, companyName: this.companyName(e.company) })),
      facets,
    };
  }

  /** Opciones de filtro para la interfaz (todas las categorías del dataset). */
  facets(): Record<string, Dist[]> {
    return {
      mechGroup: dist(this.at, (e) => e.mechGroup, mechLabel),
      eventType: dist(this.at, (e) => e.eventType),
      careLevel: dist(this.at, (e) => e.careLevel),
      municipality: dist(this.at, (e) => e.municipality),
      advisor: dist(this.ds.events, (e) => e.advisor),
      advisorSecondary: dist(this.ds.events, (e) => e.advisorSecondary),
      contactStatus: dist(this.at, (e) => e.contactStatus),
      workCenter: dist(this.at, (e) => e.workCenter).slice(0, 200),
    };
  }

  levelRank(level: RiskLevel): number { return LEVEL_ORDER.indexOf(level); }

  /**
   * Cartera de cada asesor (asignado y APA): accidentes de las empresas que atiende, contados
   * evento por evento con el asesor que figura en cada registro.
   */
  /** Vista dedicada a los asesores APA: los mismos totales de advisors() más evolución, mecanismos y gestión. */
  apaAdvisors(): ApaAdvisor[] {
    const months = this.period.completeMonths;
    return this.advisors().filter((a) => a.role === 'apa' && !/^sin asesor/i.test(a.name)).map((a) => {
      const evts = this.at.filter((e) => e.advisorSecondary === a.name);
      const els = this.el.filter((e) => e.advisorSecondary === a.name);
      const workers = new Map<string, number>();
      for (const e of evts) if (e.worker) workers.set(e.worker, (workers.get(e.worker) ?? 0) + 1);
      return {
        ...a,
        months,
        monthly: monthly(evts, months).map((p) => p.count),
        trend: trendOf(evts, this.period),
        daysPerEvent: evts.length ? a.daysLost / evts.length : 0,
        mechanisms: dist(evts, (e) => e.mechGroup, mechLabel),
        careLevels: dist(evts, (e) => e.careLevel),
        contactStatuses: dist(evts, (e) => e.contactStatus),
        elEvents: els.length,
        elCompanies: new Set(els.map((e) => e.company)).size,
        contactGapCompanies: a.companiesList.filter((c) => this.summaries.get(c.key)?.contactGap).length,
        workers: workers.size,
        repeatWorkers: [...workers.values()].filter((n) => n >= 2).length,
      };
    });
  }

  advisors(): AdvisorSummary[] {
    const ytd = this.period.ytd;
    const prevYear = ytd ? ytd.previousYear.start.slice(0, 4) : null;
    const groups = new Map<string, { name: string; role: 'asignado' | 'apa'; evts: EventRec[] }>();
    for (const e of this.at) {
      const roles: [string | null, 'asignado' | 'apa'][] = [[e.advisor ?? 'Sin asesor asignado', 'asignado'], [e.advisorSecondary, 'apa']];
      for (const [name, role] of roles) {
        if (!name) continue;
        const key = `${role === 'asignado' ? 'a' : 'p'}:${name}`;
        const g = groups.get(key) ?? { name, role, evts: [] };
        g.evts.push(e);
        groups.set(key, g);
      }
    }
    const count = (evts: EventRec[]) => ({
      full: prevYear ? evts.filter((e) => e.date?.startsWith(prevYear)).length : 0,
      prev: ytd ? evts.filter((e) => inPeriod(e, ytd.previousYear)).length : 0,
      cur: ytd ? evts.filter((e) => inPeriod(e, ytd.current)).length : 0,
    });
    return [...groups.entries()].map(([key, g]) => {
      const byCo = new Map<string, EventRec[]>();
      for (const e of g.evts) push(byCo, e.company, e);
      const companiesList = [...byCo.entries()].map(([ck, ev]) => {
        const s = this.summaries.get(ck)!;
        const c = count(ev);
        return { key: ck, name: s.name, level: s.score.level, score: s.score.score, events: ev.length, previousFullYear: c.full, yoyPrevious: c.prev, yoyCurrent: c.cur };
      }).sort((a, b) => b.events - a.events);
      const c = count(g.evts);
      return {
        key,
        name: g.name,
        role: g.role,
        companies: byCo.size,
        events: g.evts.length,
        severe: g.evts.filter((e) => e.severe).length,
        daysLost: g.evts.reduce((a, e) => a + (e.daysLost ?? 0), 0),
        previousFullYear: c.full,
        yoyPrevious: c.prev,
        yoyCurrent: c.cur,
        critical: companiesList.filter((x) => x.level === 'critico').length,
        priority: companiesList.filter((x) => x.level === 'prioritario').length,
        contactDone: g.evts.length ? g.evts.filter((e) => contactDone(e.contactStatus)).length / g.evts.length : 0,
        companiesList,
      };
    }).sort((a, b) => b.events - a.events);
  }
}

function uniq(xs: (string | null)[]): string[] {
  return [...new Set(xs.filter((x): x is string => !!x))].sort();
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v); else m.set(k, [v]);
}

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/** Meses anómalos frente a la media de los demás meses (Poisson exacto). */
export function monthlyAnomalies(series: number[], months: string[], minCount: number, alpha: number): Anomaly[] {
  const total = series.reduce((a, b) => a + b, 0);
  if (series.length < 4 || total < 4) return [];
  const out: Anomaly[] = [];
  series.forEach((c, i) => {
    const lambda = (total - c) / (series.length - 1);
    if (c >= Math.max(minCount, 1) && lambda > 0) {
      const p = poissonUpper(c, lambda);
      if (p < alpha && c >= lambda * 1.8) {
        out.push({ kind: 'spike', month: months[i], count: c, expected: lambda, pValue: p, label: `${monthLabel(months[i]!, true)}: ${c} eventos frente a ${lambda.toFixed(1).replace('.', ',')} esperados` });
      }
    }
    if (lambda >= 8) {
      const p = poissonLower(c, lambda);
      if (p < alpha) out.push({ kind: 'drop', month: months[i], count: c, expected: lambda, pValue: p, label: `${monthLabel(months[i]!, true)}: ${c} eventos frente a ${lambda.toFixed(1).replace('.', ',')} esperados` });
    }
  });
  return out;
}

interface Accessor { get: (e: EventRec) => string | null; label: (k: string) => string }

function accessor(dim: string, a: Analysis): Accessor {
  switch (dim) {
    case 'company': return { get: (e) => e.company, label: (k) => a.companyName(k) };
    case 'mechGroup': return { get: (e) => (informativeMech(e.mechGroup) ? e.mechGroup : null), label: mechLabel };
    case 'month': return { get: (e) => (e.date ? monthOf(e.date) : null), label: (k) => monthLabel(k) };
    case 'municipality': return { get: (e) => e.municipality, label: (k) => k };
    case 'careLevel': return { get: (e) => e.careLevel, label: (k) => k };
    case 'careRank': return { get: (e) => (e.careRank ? String(e.careRank) : null), label: (k) => CARE_RANK_LABEL[Number(k)] ?? k };
    case 'eventType': return { get: (e) => e.eventType, label: (k) => k };
    case 'affiliateType': return { get: (e) => e.affiliateType, label: (k) => k };
    case 'advisor': return { get: (e) => e.advisor, label: (k) => k };
    case 'workCenter': return { get: (e) => e.workCenter, label: (k) => k };
    case 'weekday': return { get: (e) => (e.date ? String((new Date(`${e.date}T00:00:00Z`).getUTCDay() + 6) % 7) : null), label: (k) => ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][Number(k)]! };
    default: return { get: (e) => (e.extra as Record<string, string | undefined>)[dim] ?? null, label: (k) => k };
  }
}
