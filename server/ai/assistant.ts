// "Pregúntale a SOC AI": conversación con Claude sobre el dataset activo, con herramientas y streaming.
// Sin clave de API responde un intérprete de intenciones sobre las mismas herramientas (motor de reglas).

import Anthropic from '@anthropic-ai/sdk';
import type { Analysis } from '../analytics/engine.ts';
import type { AiEngine } from '../../shared/types.ts';
import { allowedNumbers, verifyNumbers } from '../analytics/evidence.ts';
import { fmtNum, fmtPct, fold } from '../lib/text.ts';
import { config } from '../config.ts';
import { audit } from '../db.ts';
import { claude, describeApiError } from './client.ts';
import { SYSTEM_ASSISTANT } from './prompts.ts';
import { runTool, searchCompanies, TOOL_DEFS, TOOL_LABELS } from './tools.ts';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ChatEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  | { type: 'done'; engine: AiEngine; model: string | null; unverified: string[]; ms: number; note?: string }
  | { type: 'error'; message: string };

const MAX_STEPS = 10;

/** Bucle con Claude (herramientas + streaming). El orquestador de proveedores está en companion.ts. */
export async function runClaudeAssistant(
  a: Analysis, history: ChatTurn[], question: string, context: string | null, userId: string, emit: (e: ChatEvent) => void, signal: AbortSignal,
) {
  const t0 = Date.now();
  const client = claude();
  audit(userId, 'assistant.ask', { chars: question.length, engine: client ? 'claude' : 'reglas' });
  if (!client) {
    const text = rulesAnswer(a, question, context);
    for (const chunk of text.match(/[\s\S]{1,48}/g) ?? []) emit({ type: 'text', delta: chunk });
    emit({ type: 'done', engine: 'reglas', model: null, unverified: [], ms: Date.now() - t0 });
    return;
  }

  const messages: Anthropic.MessageParam[] = history.slice(-12).map((t) => ({ role: t.role, content: t.content }));
  const ctx = context ? `\n\n(Contexto de la pantalla: ${context})` : '';
  messages.push({ role: 'user', content: `${question}${ctx}` });
  const toolTexts: string[] = [question];
  let answer = '';
  let jsonRetries = 0;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal.aborted) return;
      const stream = client.beta.messages.stream({
        model: config.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM_ASSISTANT, cache_control: { type: 'ephemeral' } }],
        tools: TOOL_DEFS,
        messages,
        output_config: { effort: config.effort === 'max' ? 'high' : config.effort },
      }, { signal });
      stream.on('text', (delta) => { answer += delta; emit({ type: 'text', delta }); });

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        continue; // entrada de herramienta ilegible: se reintenta el turno
      }

      if (message.stop_reason === 'refusal') {
        emit({ type: 'text', delta: '\n\nClaude declinó continuar con esta consulta.' });
        break;
      }
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content as Anthropic.ContentBlockParam[] });
        continue;
      }
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (!toolUses.length || message.stop_reason === 'end_turn') break;
      if (message.stop_reason === 'max_tokens') throw new Error('La respuesta quedó incompleta por límite de tokens.');

      messages.push({ role: 'assistant', content: message.content as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        emit({ type: 'status', text: `Consultando: ${TOOL_LABELS[tu.name] ?? tu.name}` });
        try {
          const out = JSON.stringify(runTool(a, tu.name, tu.input));
          toolTexts.push(out);
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: err instanceof Error ? err.message : 'Error' });
        }
      }
      messages.push({ role: 'user', content: results });
      if (answer && !answer.endsWith('\n')) { answer += '\n\n'; emit({ type: 'text', delta: '\n\n' }); }
    }
  } catch (err) {
    if (signal.aborted) return;
    emit({ type: 'error', message: describeApiError(err).message });
    return;
  }

  const unverified = verifyNumbers([{ field: 'answer', text: answer }], allowedNumbers(toolTexts)).map((u) => u.value);
  emit({ type: 'done', engine: 'claude', model: config.model, unverified, ms: Date.now() - t0 });
}

/* ───────────────── Motor de reglas para el asistente ───────────────── */

const link = (name: string, key: string) => `[${name}](/empresas/${key})`;

// Cómo se nombran los mecanismos en una pregunta. El orden importa: lo específico primero.
const QUERY_MECH: { re: RegExp; keys: string[]; label: string }[] = [
  { re: /caidas? de objetos|objetos que caen/, keys: ['caida-objetos'], label: 'Caída de objetos' },
  { re: /altura|diferente nivel/, keys: ['caida-altura'], label: 'Caídas de altura o a diferente nivel' },
  { re: /caidas?|resbal|tropie/, keys: ['caida-nivel', 'caida-altura'], label: 'Caídas de personas (a nivel y de altura)' },
  { re: /golpe/, keys: ['golpes'], label: 'Golpes por o contra objetos' },
  { re: /corte|cortopunz|punzant/, keys: ['cortes'], label: 'Cortes y objetos cortopunzantes' },
  { re: /sobreesfuerzo|carga/, keys: ['sobreesfuerzo'], label: 'Sobreesfuerzo y manipulación de cargas' },
  { re: /transito|vehicul|moto/, keys: ['transito'], label: 'Accidentes de tránsito' },
  { re: /biologic|aguja|pinchazo/, keys: ['biologico'], label: 'Riesgo biológico' },
  { re: /quimic/, keys: ['quimico'], label: 'Sustancias químicas' },
  { re: /electric/, keys: ['electrico'], label: 'Contacto eléctrico' },
  { re: /atrapa/, keys: ['atrapamiento'], label: 'Atrapamiento' },
  { re: /particula/, keys: ['particulas'], label: 'Proyección de partículas' },
  { re: /temperatura|quemad/, keys: ['temperatura'], label: 'Temperaturas extremas' },
  { re: /sofoca/, keys: ['sofocamiento'], label: 'Sofocamiento mecánico' },
  { re: /violencia|atraco|agresion/, keys: ['violencia'], label: 'Violencia' },
  { re: /animal|mordedura|picadura/, keys: ['seres-vivos'], label: 'Animales y seres vivos' },
  { re: /postura/, keys: ['postura'], label: 'Postura forzada o movimiento brusco' },
];

function findCompany(a: Analysis, q: string) {
  const f = fold(q);
  let best: { key: string; name: string; len: number } | null = null;
  for (const s of a.summaries.values()) {
    const n = fold(s.name).replace(/\b(sas|s a s|ltda|eu|sa)\b/g, '').trim();
    if (n.length >= 5 && f.includes(n) && (!best || n.length > best.len)) best = { key: s.key, name: s.name, len: n.length };
  }
  if (best) return best;
  const words = f.split(' ').filter((w) => w.length >= 5);
  for (const w of words) {
    const hit = searchCompanies(a, w, 1)[0];
    if (hit && fold(hit.name).includes(w)) return { key: hit.company_key, name: hit.name, len: w.length };
  }
  return null;
}

export function rulesAnswer(a: Analysis, q: string, context: string | null): string {
  const f = fold(q);
  const o = a.overview();
  const k = o.kpis;
  const note = '\n\n_Respuesta del motor de reglas SOC AI (sin IA generativa): las cifras salen del dataset; para análisis conversacional completo configura la clave de Claude._';
  const mech = QUERY_MECH.find((m) => m.re.test(f));
  const company = findCompany(a, q) ?? (context?.startsWith('empresa:') ? (() => { const key = context.slice(8); const s = a.summaries.get(key); return s ? { key, name: s.name, len: 0 } : null; })() : null);

  if (/asesor/.test(f)) {
    const list = a.advisors().filter((x) => x.role === 'asignado' && x.name !== 'Sin asesor asignado').slice(0, 8);
    const rows = list.map((x) => {
      const top = x.companiesList[0];
      return `| ${x.name} | ${x.companies} | ${x.events} | ${x.critical} / ${x.priority} | ${top ? `${link(top.name, top.key)} (${top.events})` : '–'} |`;
    });
    return [
      'Asesores con más accidentes en las empresas que atienden:',
      '',
      '| Asesor | Empresas | Accidentes | Críticas / prioritarias | Empresa con más accidentes |',
      '|---|---:|---:|---:|---|',
      ...rows,
      '',
      `Detalle por asesor en [Asesores](/asesores).${note}`,
    ].join('\n');
  }
  const yearAsked = f.match(/\b(20\d\d)\b/)?.[1];
  if (yearAsked && /(mas accidentes|mayor|mas accidentalidad|top)/.test(f)) {
    const list = a.list().filter((s) => s.yoy);
    const isPrev = list[0]?.yoy?.previousYear === Number(yearAsked);
    const val = (s: (typeof list)[number]) => (isPrev ? s.yoy!.previousFullYear : s.yoy!.current);
    const top = [...list].sort((x, y) => val(y) - val(x)).slice(0, 8);
    const label = isPrev ? `${yearAsked} completo` : list[0]?.yoy?.currentLabel ?? yearAsked;
    return [
      `Empresas con más accidentes en ${label}:`,
      '',
      '| Empresa | Accidentes |',
      '|---|---:|',
      ...top.map((s) => `| ${link(s.name, s.key)} | ${val(s)} |`),
      '',
      `La comparación de cada empresa con el año anterior está en [Empresas, vista año contra año](/empresas?vista=anual).${note}`,
    ].join('\n');
  }
  if (/compar/.test(f)) {
    const names = [...a.summaries.values()].filter((s) => f.includes(fold(s.name).slice(0, 12))).slice(0, 4);
    if (names.length >= 2) return `Puedes ver la comparación completa en [Comparar empresas](/comparar?c=${names.map((n) => n.key).join(',')}).\n\n${names.map((n) => `- ${link(n.name, n.key)}: ${n.eventsAT} accidentes, ${n.severe} graves, puntaje ${n.score.score}/100 (${n.score.level}).`).join('\n')}${note}`;
    return `Indica las empresas por su nombre o usa [Comparar empresas](/comparar).${note}`;
  }
  if (/plan de choque|plan/.test(f) && company) {
    return `El plan de choque de ${link(company.name, company.key)} está en [su pestaña Plan de choque](/empresas/${company.key}?tab=plan). Allí se genera a partir de sus patrones y se puede exportar en el reporte.${note}`;
  }
  if (company && /(que esta pasando|pasa|por que|analiza|resumen|como esta)/.test(f)) {
    const s = a.summaries.get(company.key)!;
    return `**${s.name}**: ${s.eventsAT} accidentes (${fmtPct(s.share, 1)} del portafolio), puntaje ${s.score.score}/100 (${s.score.level}).\n\n${s.score.factors.filter((x) => x.points > 0).map((x) => `- +${x.points} ${x.label}: ${x.reason}.`).join('\n')}\n\nEl análisis completo está en [¿Qué está pasando?](/empresas/${s.key}).${note}`;
  }
  if (/(visitar primero|mas problematica|prioridad|priorizar|critic|mas riesgo)/.test(f)) {
    const list = o.attention.slice(0, 5);
    return `Las empresas a intervenir primero según el puntaje SOC AI:\n\n${list.map((s, i) => `${i + 1}. ${link(s.name, s.key)}: ${s.score.score}/100 (${s.score.level}). ${s.score.factors.filter((x) => x.points > 0).slice(0, 2).map((x) => x.reason).join('; ')}.${s.contactGap ? ' Sin cita ejecutada en la mayoría de sus eventos.' : ''}`).join('\n')}\n\nVer todas en [Empresas críticas](/criticas).${note}`;
  }
  if (mech && /(mas|empresas|donde|quien|cuant)/.test(f)) {
    const counts = new Map<string, number>();
    for (const e of a.at) if (e.mechGroup && mech.keys.includes(e.mechGroup)) counts.set(e.company, (counts.get(e.company) ?? 0) + 1);
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    return `**${mech.label}**: ${total} accidentes en ${counts.size} empresas.\n\n| Empresa | Accidentes |\n|---|---:|\n${top.map(([key, n]) => `| ${link(a.companyName(key), key)} | ${n} |`).join('\n')}${note}`;
  }
  if (/(se repite|mas frecuente|tipo de accidente|mecanismo)/.test(f)) {
    return `Los mecanismos más frecuentes:\n\n${o.mechanisms.filter((m) => m.key !== 'sin-info' && m.key !== 'otro').slice(0, 5).map((m, i) => `${i + 1}. ${m.label}: ${m.count} (${fmtPct(m.share, 1)}), ${m.severe ?? 0} graves.`).join('\n')}${note}`;
  }
  if (/(aument|subieron|crec|por que)/.test(f)) {
    const t = a.trends();
    return `En el portafolio: ${k.recentEvents} accidentes en ${o.period.recent.label} frente a ${k.previousEvents} en ${o.period.previous.label}.\n\nEmpresas que más suben:\n\n${t.risers.slice(0, 6).map((r) => `- ${link(r.name, r.key)}: de ${r.trend.previous} a ${r.trend.recent}${r.trend.significant ? ' (significativo)' : ''}.`).join('\n')}\n\nLa causa de un aumento no está en el archivo; la hipótesis más común es un cambio operativo reciente y debe validarse en campo.${note}`;
  }
  if (/(patron|no haya visto|no he visto|oculto|sorprend|descubr)/.test(f)) {
    return `Patrones que no son evidentes a simple vista:\n\n${a.patterns.filter((p) => p.kind === 'global' || p.kind === 'cross-company').slice(0, 5).map((p) => `- **${p.title}.** ${p.explanation}`).join('\n')}\n\nVer todos en [Patrones](/patrones).${note}`;
  }
  if (/(principal riesgo|mayor riesgo|riesgo principal)/.test(f)) {
    const sev = a.patterns.find((p) => p.kind === 'global' && p.path.some((s) => s.dim === 'careBand'));
    return `Por frecuencia, el principal riesgo es **${k.topMechanism?.label.toLowerCase()}** (${k.topMechanism?.count} accidentes, ${fmtPct(k.topMechanism?.share ?? 0, 1)}).${sev ? `\n\nPor severidad: ${sev.explanation}` : ''}${note}`;
  }
  if (/(investigar|verificar|campo|visita)/.test(f)) {
    return `Para un profesional SST, lo prioritario a investigar según los datos:\n\n${o.insights.filter((i) => i.severity === 'alta').slice(0, 5).map((i) => `- **${i.title}.** ${i.action}`).join('\n')}${note}`;
  }
  return `Con los datos cargados: ${fmtNum(k.eventsAT)} accidentes de trabajo en ${k.companies} empresas, ${o.levels.critico} en nivel crítico y ${o.levels.prioritario} prioritarias. Puedo responder preguntas como "¿qué empresa debería visitar primero?", "¿qué accidente se repite más?", "muéstrame las empresas con más caídas" o "¿qué patrón no he visto?".${note}`;
}
