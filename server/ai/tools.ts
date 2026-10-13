// Herramientas del asistente: consultas sobre el análisis activo que devuelven cifras ya calculadas.
// Claude decide qué consultar; el código hace todos los conteos.

import type Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod';
import type { EventFilter } from '../../shared/types.ts';
import type { Analysis } from '../analytics/engine.ts';
import { compactPack, companyFacts, methodologyText, packToText } from '../analytics/evidence.ts';
import { dist, informativeMech, mechLabel } from '../analytics/base.ts';
import { fold, similarity, fmtPct } from '../lib/text.ts';
import { MECH_FAMILIES } from '../pipeline/taxonomy.ts';

const LEVELS = ['critico', 'prioritario', 'atencion', 'controlado'] as const;
const MECH_KEYS = MECH_FAMILIES.map((f) => f.key);

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: 'get_portfolio_overview',
    description: 'Resumen del portafolio: período, totales, tendencia semestral y anual, niveles de riesgo, mecanismos principales, concentración e insights calculados. Úsala para preguntas generales sobre la accidentalidad de SOC.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: 'search_companies',
    description: 'Busca empresas por nombre o NIT (búsqueda aproximada). Devuelve clave, nombre, puntaje, nivel y accidentes. Úsala antes de get_company_profile cuando el usuario nombre una empresa.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Nombre o parte del nombre o NIT' } }, required: ['query'], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: 'rank_companies',
    description: 'Ranking de empresas por un criterio, opcionalmente filtrado por mecanismo o nivel de riesgo.',
    input_schema: {
      type: 'object',
      properties: {
        by: { type: 'string', enum: ['score', 'events', 'severe', 'days_lost', 'trend_increase', 'repeat_workers', 'year_over_year_increase'], description: 'Criterio de orden. year_over_year_increase compara los mismos meses del año actual y el anterior.' },
        mechanism: { type: 'string', enum: MECH_KEYS, description: 'Clave de familia de mecanismo (opcional)' },
        level: { type: 'string', enum: [...LEVELS], description: 'Nivel de riesgo (opcional)' },
        advisor: { type: 'string', description: 'Nombre del asesor SOC (asignado o APA) para ver solo su cartera (opcional)' },
        limit: { type: 'integer', description: 'Máximo de empresas (por defecto 10, máximo 25)' },
      },
      required: ['by'],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: 'get_company_profile',
    description: 'Paquete de evidencia completo de una empresa: volumen, evolución, mecanismos, dónde, cuándo, severidad, reincidencia, patrones, gestión SOC y desglose del puntaje.',
    input_schema: { type: 'object', properties: { company_key: { type: 'string', description: 'Clave de empresa devuelta por search_companies o rank_companies' } }, required: ['company_key'], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: 'query_events',
    description: 'Cuenta accidentes con filtros y los agrupa por una dimensión. Para preguntas como "¿cuántas caídas hubo en 2026 en Barranquilla?" o "¿qué mecanismos tiene esta empresa en fin de semana?".',
    input_schema: {
      type: 'object',
      properties: {
        company_key: { type: 'string' },
        mechanism: { type: 'string', enum: MECH_KEYS },
        from: { type: 'string', description: 'Fecha inicial yyyy-mm-dd' },
        to: { type: 'string', description: 'Fecha final yyyy-mm-dd' },
        municipality: { type: 'string' },
        advisor: { type: 'string', description: 'Nombre del asesor SOC (asignado o APA)' },
        severe_only: { type: 'boolean' },
        group_by: { type: 'string', enum: ['company', 'mechanism', 'month', 'municipality', 'care_level', 'work_center', 'event_type', 'weekday', 'advisor', 'contact_status'] },
      },
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: 'list_patterns',
    description: 'Patrones detectados por el motor estadístico (recurrencias por empresa, rachas, reincidencia de trabajadores, patrones globales y picos entre empresas), con conteo, lift, p-valor y explicación.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['company', 'cluster', 'worker', 'global', 'cross-company'] },
        company_key: { type: 'string' },
        mechanism: { type: 'string', enum: MECH_KEYS },
        limit: { type: 'integer' },
      },
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: 'compare_companies',
    description: 'Compara de 2 a 4 empresas lado a lado con sus indicadores principales.',
    input_schema: { type: 'object', properties: { company_keys: { type: 'array', items: { type: 'string' } } }, required: ['company_keys'], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: 'get_methodology',
    description: 'Cómo se calcula el puntaje de riesgo, qué es un evento grave y cómo se detectan los patrones.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
];

const Inputs = {
  get_portfolio_overview: z.object({}),
  search_companies: z.object({ query: z.string().min(1) }),
  rank_companies: z.object({
    by: z.enum(['score', 'events', 'severe', 'days_lost', 'trend_increase', 'repeat_workers', 'year_over_year_increase']),
    mechanism: z.string().optional(), level: z.enum(LEVELS).optional(), advisor: z.string().optional(), limit: z.number().int().optional(),
  }),
  get_company_profile: z.object({ company_key: z.string() }),
  query_events: z.object({
    company_key: z.string().optional(), mechanism: z.string().optional(), from: z.string().optional(), to: z.string().optional(),
    municipality: z.string().optional(), advisor: z.string().optional(), severe_only: z.boolean().optional(),
    group_by: z.enum(['company', 'mechanism', 'month', 'municipality', 'care_level', 'work_center', 'event_type', 'weekday', 'advisor', 'contact_status']).optional(),
  }),
  list_patterns: z.object({ kind: z.string().optional(), company_key: z.string().optional(), mechanism: z.string().optional(), limit: z.number().int().optional() }),
  compare_companies: z.object({ company_keys: z.array(z.string()).min(2).max(4) }),
  get_methodology: z.object({}),
};

export const TOOL_LABELS: Record<string, string> = {
  get_portfolio_overview: 'Resumen del portafolio',
  search_companies: 'Búsqueda de empresas',
  rank_companies: 'Ranking de empresas',
  get_company_profile: 'Perfil de empresa',
  query_events: 'Consulta de accidentes',
  list_patterns: 'Patrones detectados',
  compare_companies: 'Comparación de empresas',
  get_methodology: 'Metodología',
};

export function searchCompanies(a: Analysis, query: string, limit = 8) {
  const q = fold(query);
  const digits = query.replace(/\D/g, '');
  return a.list()
    .map((s) => {
      const name = fold(s.name);
      let score = name.includes(q) ? 1 : similarity(name, q);
      if (digits.length >= 5 && s.nit?.includes(digits)) score = 1.1;
      return { s, score };
    })
    .filter((x) => x.score > 0.45)
    .sort((x, y) => y.score - x.score || y.s.score.score - x.s.score.score)
    .slice(0, limit)
    .map(({ s }) => brief(s));
}

function brief(s: ReturnType<Analysis['list']>[number]) {
  return {
    company_key: s.key, name: s.name, score: s.score.score, level: s.score.level, accidents: s.eventsAT,
    severe: s.severe, days_lost: s.daysLost, semester_previous: s.trend.previous, semester_recent: s.trend.recent,
    repeat_workers: s.repeatWorkers, top_mechanism: s.topMechanism, management_status: s.contactStatus,
    year_over_year: s.yoy ? `${s.yoy.previous} (${s.yoy.previousLabel}) → ${s.yoy.current} (${s.yoy.currentLabel})` : null,
    advisors: s.advisors, apa_advisors: s.apaAdvisors,
    link: `/empresas/${s.key}`,
  };
}

export function runTool(a: Analysis, name: string, rawInput: unknown, compact = false): unknown {
  const schema = Inputs[name as keyof typeof Inputs];
  if (!schema) throw new Error(`Herramienta desconocida: ${name}`);
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) throw new Error(`Entrada inválida para ${name}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  const input = parsed.data as Record<string, unknown>;

  switch (name) {
    case 'get_portfolio_overview': {
      const o = a.overview();
      return {
        period: { from: o.period.dataStart, to: o.period.dataEnd, partial_month_excluded: o.period.partialMonth, recent: o.period.recent.label, previous: o.period.previous.label },
        kpis: o.kpis,
        risk_levels: o.levels,
        mechanisms: o.mechanisms.slice(0, 10).map((m) => ({ key: m.key, label: m.label, accidents: m.count, share: fmtPct(m.share), severe: m.severe })),
        insights: o.insights.map((i) => ({ title: i.title, finding: i.finding, severity: i.severity })),
        top_attention: o.attention.slice(0, 10).map(brief),
      };
    }
    case 'search_companies':
      return { results: searchCompanies(a, String(input.query)) };
    case 'rank_companies': {
      const by = String(input.by);
      const limit = Math.min(25, Number(input.limit ?? 10));
      let list = a.list();
      if (input.level) list = list.filter((s) => s.score.level === input.level);
      if (input.advisor) {
        const q = fold(input.advisor);
        list = list.filter((s) => [...s.advisors, ...s.apaAdvisors].some((x) => fold(x).includes(q)));
      }
      if (input.mechanism) {
        const mech = String(input.mechanism);
        const counts = new Map<string, number>();
        const allowed = new Set(list.map((s) => s.key));
        for (const e of a.at) if (e.mechGroup === mech && allowed.has(e.company)) counts.set(e.company, (counts.get(e.company) ?? 0) + 1);
        return {
          mechanism: mechLabel(mech),
          results: [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit)
            .map(([k, n]) => ({ ...brief(a.summaries.get(k)!), accidents_with_mechanism: n })),
        };
      }
      const key = (s: (typeof list)[number]) => by === 'score' ? s.score.score : by === 'events' ? s.eventsAT : by === 'severe' ? s.severe
        : by === 'days_lost' ? s.daysLost : by === 'repeat_workers' ? s.repeatWorkers
          : by === 'year_over_year_increase' ? (s.yoy ? s.yoy.current - s.yoy.previous : -Infinity) : s.trend.recent - s.trend.previous;
      return { results: [...list].sort((x, y) => key(y) - key(x)).slice(0, limit).map(brief) };
    }
    case 'get_company_profile': {
      const pack = companyFacts(a, String(input.company_key));
      if (!pack) return { error: 'No existe esa clave de empresa. Usa search_companies.' };
      return { company_key: input.company_key, link: `/empresas/${input.company_key}`, evidence: packToText(compact ? compactPack(pack, 3400) : pack) };
    }
    case 'query_events': {
      const f: EventFilter = { cls: 'AT' };
      if (input.company_key) f.company = String(input.company_key);
      if (input.mechanism) f.mechGroup = String(input.mechanism);
      if (input.from) f.from = String(input.from);
      if (input.to) f.to = String(input.to);
      if (input.severe_only) f.severe = true;
      let rows = a.filterEvents(f);
      if (input.advisor) {
        const q = fold(input.advisor);
        rows = rows.filter((e) => fold(e.advisor).includes(q) || fold(e.advisorSecondary).includes(q));
      }
      if (input.municipality) {
        const m = fold(input.municipality);
        rows = rows.filter((e) => fold(e.municipality).includes(m));
      }
      const g = input.group_by as string | undefined;
      const grouped = !g ? undefined : dist(rows, (e) => {
        switch (g) {
          case 'company': return e.company;
          case 'mechanism': return e.mechGroup;
          case 'month': return e.date?.slice(0, 7) ?? null;
          case 'municipality': return e.municipality;
          case 'care_level': return e.careLevel;
          case 'work_center': return e.workCenter;
          case 'event_type': return e.eventType;
          case 'weekday': return e.date ? ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][(new Date(`${e.date}T00:00:00Z`).getUTCDay() + 6) % 7]! : null;
          case 'advisor': return e.advisor;
          case 'contact_status': return e.contactStatus;
          default: return null;
        }
      }, (k) => (g === 'company' ? a.companyName(k) : g === 'mechanism' ? mechLabel(k) : k)).slice(0, g === 'month' ? 24 : 15)
        .map((d) => ({ key: g === 'company' ? d.key : undefined, label: d.label, accidents: d.count, share: fmtPct(d.share), severe: d.severe, days_lost: d.days }));
      return {
        accidents: rows.length,
        severe: rows.filter((e) => e.severe).length,
        days_lost: rows.reduce((s, e) => s + (e.daysLost ?? 0), 0),
        informative_mechanism: rows.filter((e) => informativeMech(e.mechGroup)).length,
        groups: grouped,
      };
    }
    case 'list_patterns': {
      let ps = a.patterns;
      if (input.kind) ps = ps.filter((p) => p.kind === input.kind);
      if (input.company_key) ps = ps.filter((p) => p.company === input.company_key);
      if (input.mechanism) ps = ps.filter((p) => p.path.some((s) => s.dim === 'mechGroup' && s.value === mechLabel(String(input.mechanism))));
      return {
        patterns: ps.slice(0, Math.min(20, Number(input.limit ?? 10))).map((p) => ({
          kind: p.kind, title: p.title, path: p.path.map((s) => `${s.dimLabel}: ${s.value}`).join(' → '), company_key: p.company,
          count: p.count, base: p.base, share: fmtPct(p.share), expected_share: fmtPct(p.expectedShare), lift: Math.round(p.lift * 10) / 10,
          p_value: p.pValue < 0.0001 ? '<0,0001' : Math.round(p.pValue * 10000) / 10000, confidence: p.confidence,
          trend: p.trend ? `${p.trend.previous} → ${p.trend.recent}` : null, severe: p.severe, explanation: p.explanation,
        })),
      };
    }
    case 'compare_companies': {
      const keys = (input.company_keys as string[]).filter((k) => a.summaries.has(k));
      return { companies: keys.map((k) => brief(a.summaries.get(k)!)), compare_link: `/comparar?c=${keys.join(',')}` };
    }
    case 'get_methodology':
      return {
        scoring: methodologyText(),
        severe_event: 'Evento grave: atención quirúrgica, hospitalaria o en UCI, 30 o más días de incapacidad, o pérdida de capacidad laboral calificada mayor que 0.',
        patterns: 'Patrón de empresa: mecanismo con 5 o más eventos, o con 3 o más y una proporción 1,5 veces la del portafolio con prueba binomial p < 0,05. Racha: 3 o más eventos del mismo mecanismo en 60 días. Patrones globales con control de falsos positivos (Benjamini-Hochberg). Picos entre empresas con prueba de Poisson p < 0,01 y 4 o más empresas.',
        trend: 'Últimos 6 meses completos frente a los 6 anteriores, prueba binomial exacta. El mes del corte, si está incompleto, se excluye.',
      };
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
