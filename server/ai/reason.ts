// AI reasoning: genera "¿Qué está pasando?", planes de choque, comparaciones y la lectura ejecutiva.
// Flujo: paquete de evidencia (código) → Claude con salida estructurada → verificación de cifras → caché.
// Sin clave de API, el mismo flujo usa el motor de reglas y se etiqueta como tal.

import { createHash, randomUUID } from 'node:crypto';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z from 'zod';
import type { AiEngine, AiMeta, AiResult, Comparison, ExecutiveReading, ShockPlan, WhatsHappening } from '../../shared/types.ts';
import type { Analysis } from '../analytics/engine.ts';
import { compactPack, companyFacts, overviewFacts, packNumbers, packToText, verifyNumbers, type FactPack } from '../analytics/evidence.ts';
import { audit, db } from '../db.ts';
import { config } from '../config.ts';
import { AiError, claude, describeApiError, engineChain } from './client.ts';
import { geminiJson, groqJson } from './providers.ts';
import { ComparisonSchema, ExecutiveSchema, ShockPlanSchema, WhatsHappeningSchema } from './schemas.ts';
import { knowledgeDigest, SYSTEM_ANALYST, SYSTEM_COMPACT, TASK_COMPARE, TASK_EXECUTIVE, TASK_SHOCK_PLAN, TASK_WHATS_HAPPENING } from './prompts.ts';
import { rulesCompare, rulesExecutive, rulesShockPlan, rulesWhatsHappening } from './rules.ts';

export type Kind = 'whats' | 'plan' | 'compare' | 'executive';

type ContentOf<K extends Kind> = K extends 'whats' ? WhatsHappening : K extends 'plan' ? ShockPlan : K extends 'compare' ? Comparison : ExecutiveReading;

const inflight = new Map<string, Promise<AiResult<unknown>>>();

/** Sube cuando cambia el cálculo del motor; invalida los análisis guardados con cifras de otra versión. */
const ENGINE_VERSION = '2026.10.4';

export function versionOf(a: Analysis): string {
  return `${ENGINE_VERSION}|${createHash('sha256').update(JSON.stringify(a.cfg)).digest('hex').slice(0, 10)}`;
}

export function cached<K extends Kind>(a: Analysis, kind: K, subject: string): AiResult<ContentOf<K>> | null {
  const row = db.prepare(`SELECT content_json, meta_json FROM ai_outputs WHERE dataset_id = ? AND kind = ? AND subject = ?
    ORDER BY created_at DESC LIMIT 1`).get(a.ds.summary.id, kind, subject) as { content_json: string; meta_json: string } | undefined;
  if (!row) return null;
  const meta = JSON.parse(row.meta_json) as AiMeta;
  if (meta.version !== versionOf(a)) return null;
  return { content: JSON.parse(row.content_json), meta };
}

export function listOutputs(a: Analysis, kind: Kind) {
  const v = versionOf(a);
  return (db.prepare(`SELECT subject, engine, created_at, meta_json FROM ai_outputs WHERE dataset_id = ? AND kind = ? ORDER BY created_at DESC`)
    .all(a.ds.summary.id, kind) as { subject: string; engine: string; created_at: string; meta_json: string }[])
    .filter((r) => (JSON.parse(r.meta_json) as AiMeta).version === v);
}

function save(datasetId: string, kind: Kind, subject: string, result: AiResult<unknown>, userId: string | null) {
  db.prepare(`INSERT INTO ai_outputs (id, dataset_id, kind, subject, engine, content_json, meta_json, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    randomUUID(), datasetId, kind, subject, result.meta.engine, JSON.stringify(result.content), JSON.stringify(result.meta),
    result.meta.generatedAt, userId,
  );
}

async function runClaude<T>(task: string, packText: string, schema: z.ZodType<T>): Promise<{ data: T; usage: { input: number; output: number } }> {
  const client = claude();
  if (!client) throw new AiError('IA no configurada.', 503);
  try {
    const stream = client.beta.messages.stream({
      model: config.model,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_ANALYST, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${task}\n\n${packText}` }],
      output_config: { effort: config.effort, format: betaZodOutputFormat(schema) },
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new AiError('Claude declinó responder esta solicitud. Usa el motor de reglas o reformula.', 422);
    if (msg.stop_reason === 'max_tokens') throw new AiError('La respuesta de Claude quedó incompleta (límite de tokens). Intenta de nuevo.', 502);
    const data = msg.parsed_output as T | null;
    if (!data) throw new AiError('Claude no devolvió una respuesta con la estructura esperada.', 502);
    return { data, usage: { input: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0), output: msg.usage.output_tokens } };
  } catch (err) {
    throw describeApiError(err);
  }
}

function fieldsFor(kind: Kind, c: unknown): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const add = (field: string, text: string | undefined) => { if (text) out.push({ field, text }); };
  if (kind === 'whats') {
    const w = c as WhatsHappening;
    add('headline', w.headline); add('summary', w.summary); add('where', w.where); add('when', w.when);
    add('whatRepeats', w.whatRepeats); add('howSevere', w.howSevere);
    w.findings.forEach((f, i) => { add(`findings.${i}`, `${f.title} ${f.body}`); });
    w.hypotheses.forEach((h, i) => add(`hypotheses.${i}`, h.basis));
  } else if (kind === 'plan') {
    const p = c as ShockPlan;
    add('context', p.context);
    p.problems.forEach((pr, i) => { add(`problems.${i}.problem`, pr.problem); add(`problems.${i}.evidenceText`, pr.evidenceText); add(`problems.${i}.rationale`, pr.rationale); });
  } else if (kind === 'compare') {
    const p = c as Comparison;
    add('conclusion', p.conclusion); add('sharedRisks', p.sharedRisks);
    p.differences.forEach((d, i) => add(`differences.${i}`, d.detail));
  } else {
    const e = c as ExecutiveReading;
    add('headline', e.headline); add('state', e.state);
    e.priorities.forEach((p, i) => add(`priorities.${i}`, p.why));
    e.nonObvious.forEach((n, i) => add(`nonObvious.${i}`, `${n.title} ${n.body}`));
  }
  return out;
}

function buildPacks(a: Analysis, kind: Kind, subject: string): FactPack[] {
  if (kind === 'executive') return [overviewFacts(a)];
  if (kind === 'compare') {
    const keys = subject.split(',');
    return keys.map((k, i) => {
      const p = companyFacts(a, k, 'ABCD'[i]!);
      if (!p) throw new AiError('Una de las empresas no existe en el dataset activo.', 404);
      return p;
    });
  }
  const p = companyFacts(a, subject);
  if (!p) throw new AiError('La empresa no existe en el dataset activo.', 404);
  return [p];
}

export async function generate<K extends Kind>(
  a: Analysis, kind: K, subject: string, opts: { force?: boolean; userId: string | null; engine?: 'auto' | 'reglas' },
): Promise<AiResult<ContentOf<K>>> {
  const datasetId = a.ds.summary.id;
  if (!opts.force) {
    const hit = cached(a, kind, subject);
    if (hit) return hit;
  }
  const flightKey = `${datasetId}|${kind}|${subject}|${opts.engine ?? 'auto'}`;
  const running = inflight.get(flightKey);
  if (running) return running as Promise<AiResult<ContentOf<K>>>;

  const job = (async () => {
    const t0 = Date.now();
    const fullPacks = buildPacks(a, kind, subject);
    let packs = fullPacks;
    const [task, schema] = kind === 'whats' ? [TASK_WHATS_HAPPENING, WhatsHappeningSchema]
      : kind === 'plan' ? [TASK_SHOCK_PLAN, ShockPlanSchema]
        : kind === 'compare' ? [TASK_COMPARE, ComparisonSchema]
          : [TASK_EXECUTIVE, ExecutiveSchema];
    let content: unknown = null;
    let usage: AiMeta['usage'] = null;
    let engine: AiEngine = 'reglas';
    let model: string | null = null;
    const failures: string[] = [];

    // Cadena de motores: el primero que responda con la estructura válida gana; si todos fallan, reglas.
    for (const eng of opts.engine === 'reglas' ? [] : engineChain()) {
      try {
        if (eng === 'claude') {
          const r = await runClaude(task, fullPacks.map(packToText).join('\n\n'), schema as z.ZodType<unknown>);
          content = r.data; usage = r.usage; model = config.model;
        } else if (eng === 'gemini') {
          const r = await geminiJson(SYSTEM_ANALYST, `${task}\n\n${fullPacks.map(packToText).join('\n\n')}`, schema as z.ZodType<unknown>);
          content = r.result.data; usage = r.result.usage; model = r.model;
        } else {
          // Groq gratuito: ~8.000 tokens por minuto, así que evidencia compacta y solo la biblioteca relevante.
          const compact = fullPacks.map((p) => compactPack(p, Math.floor(9000 / fullPacks.length)));
          const system = `${SYSTEM_COMPACT}\n\nBiblioteca técnica SOC relevante:\n${knowledgeDigest(relevantKnowledge(a, kind, subject))}`;
          const r = await groqJson(system, `${task}\n\n${compact.map(packToText).join('\n\n')}`, schema as z.ZodType<unknown>, kind === 'compare' ? 2000 : 3200);
          content = r.data; usage = r.usage; model = r.model; packs = compact;
        }
        engine = eng;
        break;
      } catch (err) {
        failures.push(`${eng}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    if (!content) {
      content = kind === 'whats' ? rulesWhatsHappening(a, subject, fullPacks[0]!)
        : kind === 'plan' ? rulesShockPlan(a, subject, fullPacks[0]!)
          : kind === 'compare' ? rulesCompare(a, subject.split(','), fullPacks)
            : rulesExecutive(a, fullPacks[0]!);
      packs = fullPacks;
    }
    const allowed = packs.flatMap(packNumbers);
    const unverified = verifyNumbers(fieldsFor(kind, content), allowed);
    const meta: AiMeta = {
      engine,
      model,
      generatedAt: new Date().toISOString(),
      ms: Date.now() - t0,
      verified: unverified.length === 0,
      unverified,
      facts: packs.flatMap((p) => p.facts),
      usage,
      version: versionOf(a),
      ...(failures.length ? { note: failures.join(' | ') } : {}),
    };
    const result = { content, meta } as AiResult<ContentOf<K>>;
    save(datasetId, kind, subject, result, opts.userId);
    audit(opts.userId, `ai.${kind}`, { subject, engine: meta.engine, ms: meta.ms, unverified: unverified.length });
    return result;
  })();
  inflight.set(flightKey, job as Promise<AiResult<unknown>>);
  try {
    return await job;
  } finally {
    inflight.delete(flightKey);
  }
}

/** Familias de la biblioteca SST que importan para este análisis (para no gastar tokens en el resto). */
function relevantKnowledge(a: Analysis, kind: Kind, subject: string): string[] {
  const keys = kind === 'executive'
    ? a.overview().mechanisms.filter((m) => m.key !== 'sin-info' && m.key !== 'otro').slice(0, 3).map((m) => m.key)
    : subject.split(',').flatMap((k) => (a.profile(k)?.mechanisms ?? []).filter((m) => m.key !== 'sin-info' && m.key !== 'otro').slice(0, 2).map((m) => m.key));
  return [...new Set(keys), 'aumento', 'reincidencia', 'severidad'];
}
