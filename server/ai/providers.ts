// Proveedores gratuitos: Google Gemini (principal) y Groq (respaldo rápido).
// Ambos por HTTP directo; la clave vive solo en el servidor.
// Mismo contrato que Claude: el modelo recibe el paquete de evidencia y responde JSON validado con Zod.

import * as z from 'zod';
import { config } from '../config.ts';
import { AiError } from './client.ts';

/* ───────────────────────── Esquemas ───────────────────────── */

/** JSON Schema limpio a partir de Zod. `strict` = todas las propiedades requeridas y sin extras (Groq). */
export function jsonSchemaOf(schema: z.ZodType, strict: boolean): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$schema') continue;
      if (!strict && k === 'additionalProperties') continue;
      out[k] = walk(v);
    }
    if (out.type === 'object' && out.properties && strict) {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties as object);
    }
    return out;
  };
  return walk(raw) as Record<string, unknown>;
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  return schema.parse(JSON.parse(cleaned));
}

/* ───────────────────────── Gemini ───────────────────────── */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiPart { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }
export interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

class Retryable extends Error {}

async function geminiCall(model: string, body: Record<string, unknown>, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(`${GEMINI}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Retryable(`${model}: sin respuesta en ${Math.round(timeoutMs / 1000)} s`);
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: number; message: string };
    candidates?: { content?: GeminiContent; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  if (!res.ok || data.error) {
    const code = data.error?.code ?? res.status;
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    if (code === 429 || code === 500 || code === 503 || code === 404) throw new Retryable(`${model}: ${msg.slice(0, 120)}`);
    if (code === 400 && /api key/i.test(msg)) throw new AiError('La clave de Gemini no es válida.', 503);
    throw new AiError(`Gemini rechazó la solicitud: ${msg.slice(0, 200)}`, 502);
  }
  const cand = data.candidates?.[0];
  if (!cand?.content) throw new Retryable(`${model}: respuesta vacía (${cand?.finishReason ?? 'sin motivo'})`);
  return {
    content: cand.content,
    finish: cand.finishReason ?? 'STOP',
    usage: { input: data.usageMetadata?.promptTokenCount ?? 0, output: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0) },
  };
}

// Cortacircuitos: si Gemini falló por saturación hace poco, no se le vuelve a esperar durante un rato.
let geminiPausedUntil = 0;
const PAUSE_MS = 3 * 60_000;

export function geminiAvailable(): boolean {
  return !!config.geminiKey && Date.now() >= geminiPausedUntil;
}

/**
 * Recorre los modelos configurados dentro de un presupuesto total de tiempo.
 * Ante saturación (503/429) o tiempo agotado prueba el siguiente; si ninguno responde, pausa Gemini.
 */
async function withGeminiModels<T>(fn: (model: string, timeoutMs: number) => Promise<T>, budgetMs: number): Promise<{ result: T; model: string }> {
  if (!geminiAvailable()) throw new AiError('Gemini está en pausa por saturación reciente; se usa el respaldo.', 503);
  const deadline = Date.now() + budgetMs;
  const errors: string[] = [];
  for (const model of config.geminiModels) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) break;
    try {
      // Ningún modelo se queda con todo el presupuesto: así hay tiempo para probar el siguiente.
      return { result: await fn(model, Math.min(remaining, Math.max(budgetMs * 0.55, 8000))), model };
    } catch (err) {
      if (!(err instanceof Retryable)) throw err;
      errors.push(err.message);
    }
  }
  geminiPausedUntil = Date.now() + PAUSE_MS;
  throw new AiError(`Gemini no está disponible ahora (${errors.slice(-2).join(' · ') || 'sin respuesta a tiempo'}).`, 503);
}

const textOf = (c: GeminiContent) => c.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');

export async function geminiJson<T>(system: string, user: string, schema: z.ZodType<T>) {
  const responseJsonSchema = jsonSchemaOf(schema, false);
  return withGeminiModels(async (model, timeoutMs) => {
    const r = await geminiCall(model, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema, maxOutputTokens: 16000, thinkingConfig: { thinkingLevel: 'medium' } },
    }, timeoutMs);
    try {
      return { data: parseJson(textOf(r.content), schema), usage: r.usage };
    } catch {
      throw new Retryable(`${model}: JSON fuera del esquema`);
    }
  }, 75_000);
}

export interface GeminiTool { name: string; description: string; parameters: Record<string, unknown> }

/** Un paso de conversación con herramientas. Devuelve el contenido del modelo tal cual (con firmas de pensamiento). */
export async function geminiStep(system: string, contents: GeminiContent[], tools: GeminiTool[], model?: string) {
  const run = (m: string, timeoutMs: number) => geminiCall(m, {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
    generationConfig: { maxOutputTokens: 8000, thinkingConfig: { thinkingLevel: 'low' } },
  }, timeoutMs);
  // Pasos siguientes de una conversación ya iniciada: mismo modelo, más tiempo (ya demostró que responde).
  if (model) return { result: await run(model, 45_000), model };
  return withGeminiModels(run, 25_000);
}

export function geminiText(c: GeminiContent): string { return textOf(c); }
export function geminiCalls(c: GeminiContent) { return c.parts.filter((p) => p.functionCall).map((p) => p.functionCall!); }

/* ───────────────────────── Groq ───────────────────────── */

const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const TPM = 7600; // plan gratuito: 8.000 tokens por minuto; se deja margen

// Regulador: registra los tokens usados en la última ventana de 60 s y espera si la siguiente solicitud no cabe.
const window: { at: number; tokens: number }[] = [];
/** Aparta cupo en la ventana de 60 s. Devuelve el registro para corregirlo con el consumo real que reporta Groq. */
async function reserve(tokens: number, onWait?: (seconds: number) => void) {
  for (;;) {
    const now = Date.now();
    while (window.length && now - window[0]!.at > 60_000) window.shift();
    const used = window.reduce((a, w) => a + w.tokens, 0);
    if (used + tokens <= TPM || !window.length) { const slot = { at: now, tokens }; window.push(slot); return slot; }
    const wait = 60_000 - (now - window[0]!.at) + 250;
    if (wait > 65_000) throw new AiError('El plan gratuito de Groq alcanzó su límite por minuto. Intenta de nuevo en un momento.', 429);
    onWait?.(Math.ceil(wait / 1000));
    await new Promise((r) => setTimeout(r, wait));
  }
}
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.2);

export type GroqMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

async function groqFetch(body: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GROQ, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqKey}` },
      body: JSON.stringify({ model: config.groqModel, reasoning_effort: 'low', include_reasoning: false, ...body }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) return res;
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = err.error?.message ?? `HTTP ${res.status}`;
    // Límite por minuto: Groq dice cuánto esperar. Se espera y se reintenta (hasta dos veces, máximo 30 s cada una).
    if (res.status === 429 && attempt < 2) {
      const after = Number(res.headers.get('retry-after')) || Number(msg.match(/try again in ([\d.]+)s/i)?.[1]) || 8;
      if (after <= 30) {
        window.length = 0;
        await new Promise((r) => setTimeout(r, (after + 0.5) * 1000));
        continue;
      }
    }
    if (res.status === 413) throw new AiError('La solicitud supera el límite del plan gratuito de Groq.', 413);
    if (res.status === 429) throw new AiError('Groq alcanzó su límite por minuto. Intenta de nuevo en un momento.', 429);
    if (res.status === 401) throw new AiError('La clave de Groq no es válida.', 503);
    throw new AiError(`Groq rechazó la solicitud: ${msg.slice(0, 200)}`, 502);
  }
}

export async function groqJson<T>(system: string, user: string, schema: z.ZodType<T>, maxTokens = 3000) {
  const messages: GroqMessage[] = [{ role: 'system', content: system }, { role: 'user', content: user }];
  // Groq valida el esquema del lado del servidor; si el modelo se equivoca en un campo, se le devuelve el error una vez.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slot = await reserve(estimateTokens(system + user) + maxTokens);
    try {
      const res = await groqFetch({
        messages,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'respuesta', strict: true, schema: jsonSchemaOf(schema, true) } },
      });
      const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
      if (data.usage) slot.tokens = data.usage.prompt_tokens + data.usage.completion_tokens;
      return { data: parseJson(data.choices[0]!.message.content, schema), usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 }, model: config.groqModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (attempt === 0 && /schema|esquema|Expected|invalid/i.test(msg)) {
        messages.push({ role: 'user', content: `Tu respuesta anterior no cumplió el esquema JSON (${msg.slice(0, 300)}). Respeta exactamente los tipos: cada campo de texto es una cadena (los ids de evidencia van dentro del texto o en los campos "evidence", que son listas de cadenas).` });
        continue;
      }
      if (err instanceof AiError) throw err;
      throw new AiError('Groq devolvió una respuesta fuera del esquema esperado.', 502);
    }
  }
  throw new AiError('Groq devolvió una respuesta fuera del esquema esperado.', 502);
}

export interface GroqTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

/** Paso de conversación con streaming: emite el texto a medida que llega y devuelve las llamadas a herramientas. */
export async function groqStep(messages: GroqMessage[], tools: GroqTool[], onText: (d: string) => void, signal: AbortSignal, onWait?: (seconds: number) => void) {
  const slot = await reserve(estimateTokens(JSON.stringify(messages) + JSON.stringify(tools)) + 900, onWait);
  const res = await groqFetch({ messages, tools, stream: true, max_completion_tokens: 1500 });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
  const calls = new Map<number, { id: string; name: string; args: string }>();
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      const chunk = JSON.parse(line.slice(5)) as { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]; x_groq?: { usage?: { prompt_tokens: number; completion_tokens: number } } };
      if (chunk.x_groq?.usage) slot.tokens = chunk.x_groq.usage.prompt_tokens + chunk.x_groq.usage.completion_tokens;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) { content += delta.content; onText(delta.content); }
      for (const tc of delta?.tool_calls ?? []) {
        const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(tc.index, cur);
      }
    }
  }
  return { content, calls: [...calls.values()] };
}
