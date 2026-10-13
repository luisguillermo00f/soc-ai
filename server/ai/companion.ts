// SOC Companion: orquesta la conversación sobre la cadena de proveedores.
// Claude (si hay clave) → Gemini gratuito → Groq gratuito → motor de reglas.
// Si un proveedor falla antes de escribir nada, la pregunta pasa al siguiente sin que el usuario lo note
// (salvo por la etiqueta del motor que respondió).

import type { Analysis } from '../analytics/engine.ts';
import { allowedNumbers, verifyNumbers } from '../analytics/evidence.ts';
import { audit } from '../db.ts';
import { config } from '../config.ts';
import { engineChain } from './client.ts';
import { rulesAnswer, runClaudeAssistant, type ChatEvent, type ChatTurn } from './assistant.ts';
import { SYSTEM_ASSISTANT, SYSTEM_ASSISTANT_COMPACT } from './prompts.ts';
import { geminiCalls, geminiStep, geminiText, groqStep, type GeminiContent, type GroqMessage, type GroqTool } from './providers.ts';
import { runTool, TOOL_DEFS, TOOL_LABELS } from './tools.ts';

const MAX_STEPS = 6;

/** Error de un proveedor antes de emitir texto: se puede pasar al siguiente. */
class Fallthrough extends Error {}

function toolDefsPlain() {
  return TOOL_DEFS.map((t) => ({ name: t.name, description: t.description ?? '', parameters: t.input_schema as Record<string, unknown> }));
}

/** Herramientas con descripciones de una frase y sin listas largas de valores: menos tokens por paso. */
function compactTools() {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'enum' && Array.isArray(v) && v.length > 8) continue;
      out[k] = k === 'description' && typeof v === 'string' ? v.split('. ')[0] : strip(v);
    }
    return out;
  };
  return toolDefsPlain().map((t) => ({ name: t.name, description: t.description.split('. ')[0]!, parameters: strip(t.parameters) as Record<string, unknown> }));
}

function streamChunks(text: string, emit: (e: ChatEvent) => void) {
  for (const chunk of text.match(/[\s\S]{1,40}/g) ?? []) emit({ type: 'text', delta: chunk });
}

async function geminiLoop(a: Analysis, history: ChatTurn[], prompt: string, emit: (e: ChatEvent) => void, signal: AbortSignal) {
  const contents: GeminiContent[] = history.slice(-12).map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  const toolTexts: string[] = [prompt];
  const tools = toolDefsPlain();
  let model: string | undefined;
  let answer = '';
  for (let step = 0; step < MAX_STEPS && !signal.aborted; step++) {
    let r;
    try {
      // El primer paso elige modelo; los siguientes se quedan en él (las firmas de pensamiento son del modelo).
      r = await geminiStep(SYSTEM_ASSISTANT, contents, tools, model);
    } catch (err) {
      if (!answer && step === 0) throw new Fallthrough(err instanceof Error ? err.message : 'Gemini no respondió');
      throw err;
    }
    model = r.model;
    contents.push(r.result.content);
    const calls = geminiCalls(r.result.content);
    const text = geminiText(r.result.content);
    if (text) { answer += text; streamChunks(text, emit); }
    if (!calls.length) break;
    const responses = calls.map((c) => {
      emit({ type: 'status', text: `Consultando: ${TOOL_LABELS[c.name] ?? c.name}` });
      try {
        const out = runTool(a, c.name, c.args ?? {});
        toolTexts.push(JSON.stringify(out));
        return { functionResponse: { name: c.name, response: { result: out } } };
      } catch (err) {
        return { functionResponse: { name: c.name, response: { error: err instanceof Error ? err.message : 'Error' } } };
      }
    });
    contents.push({ role: 'user', parts: responses });
    if (answer && !answer.endsWith('\n')) { answer += '\n\n'; emit({ type: 'text', delta: '\n\n' }); }
  }
  return { answer, toolTexts, model: model ?? config.geminiModels[0]! };
}

async function groqLoop(a: Analysis, history: ChatTurn[], prompt: string, emit: (e: ChatEvent) => void, signal: AbortSignal) {
  // Presupuesto corto: historial recortado y resultados de herramientas compactos.
  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_ASSISTANT_COMPACT },
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 1200) }) as GroqMessage),
    { role: 'user', content: prompt },
  ];
  const tools: GroqTool[] = compactTools().map((t) => ({ type: 'function', function: t }));
  const toolTexts: string[] = [prompt];
  let answer = '';
  for (let step = 0; step < MAX_STEPS && !signal.aborted; step++) {
    let r;
    try {
      r = await groqStep(messages, tools, (d) => { answer += d; emit({ type: 'text', delta: d }); }, signal,
        (s) => emit({ type: 'status', text: `Esperando cupo del plan gratuito (${s} s)` }));
    } catch (err) {
      if (!answer && step === 0) throw new Fallthrough(err instanceof Error ? err.message : 'Groq no respondió');
      throw err;
    }
    if (!r.calls.length) break;
    messages.push({ role: 'assistant', content: r.content || null, tool_calls: r.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) });
    for (const c of r.calls) {
      emit({ type: 'status', text: `Consultando: ${TOOL_LABELS[c.name] ?? c.name}` });
      let out: string;
      try {
        out = JSON.stringify(runTool(a, c.name, JSON.parse(c.args || '{}'), true));
      } catch (err) {
        out = JSON.stringify({ error: err instanceof Error ? err.message : 'Error' });
      }
      toolTexts.push(out);
      messages.push({ role: 'tool', tool_call_id: c.id, content: out.length > 3800 ? `${out.slice(0, 3800)}…(recortado)` : out });
    }
    if (answer && !answer.endsWith('\n')) { answer += '\n\n'; emit({ type: 'text', delta: '\n\n' }); }
  }
  return { answer, toolTexts, model: config.groqModel };
}

export async function runAssistant(
  a: Analysis, history: ChatTurn[], question: string, context: string | null, userId: string, emit: (e: ChatEvent) => void, signal: AbortSignal,
) {
  const t0 = Date.now();
  const chain = engineChain();
  audit(userId, 'assistant.ask', { chars: question.length, engine: chain[0] ?? 'reglas' });
  if (chain[0] === 'claude') return runClaudeAssistant(a, history, question, context, userId, emit, signal);

  const prompt = `${question}${context ? `\n\n(Contexto de la pantalla: ${context})` : ''}`;
  const skipped: string[] = [];
  for (const eng of chain) {
    if (eng === 'claude') continue;
    try {
      const r = eng === 'gemini' ? await geminiLoop(a, history, prompt, emit, signal) : await groqLoop(a, history, prompt, emit, signal);
      if (signal.aborted) return;
      const unverified = verifyNumbers([{ field: 'answer', text: r.answer }], allowedNumbers(r.toolTexts)).map((u) => u.value);
      emit({ type: 'done', engine: eng, model: r.model, unverified, ms: Date.now() - t0, ...(skipped.length ? { note: skipped.join(' | ') } : {}) });
      return;
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof Fallthrough) {
        skipped.push(`${eng}: ${err.message}`);
        emit({ type: 'status', text: eng === 'gemini' ? 'Gemini está saturado; respondiendo con el modelo de respaldo' : 'Respondiendo con el motor de reglas' });
        continue;
      }
      emit({ type: 'error', message: err instanceof Error ? err.message : 'Error de la IA.' });
      return;
    }
  }
  streamChunks(rulesAnswer(a, question, context), emit);
  emit({ type: 'done', engine: 'reglas', model: null, unverified: [], ms: Date.now() - t0, ...(skipped.length ? { note: skipped.join(' | ') } : {}) });
}
