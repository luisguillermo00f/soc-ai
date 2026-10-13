// Prueba en vivo de los proveedores gratuitos con un análisis real ("¿Qué está pasando?").
// Uso: npm run check:providers -- "ruta/al/archivo.xlsx" [nit-empresa]
import { readFileSync } from 'node:fs';
import { ingest } from '../server/pipeline/ingest.ts';
import { detectSheet } from '../server/pipeline/schema.ts';
import { normalize } from '../server/pipeline/normalize.ts';
import { Analysis } from '../server/analytics/engine.ts';
import { DEFAULT_SCORING } from '../server/analytics/scoring.ts';
import { compactPack, companyFacts, packNumbers, packToText, verifyNumbers } from '../server/analytics/evidence.ts';
import { knowledgeDigest, SYSTEM_ANALYST, SYSTEM_COMPACT, TASK_WHATS_HAPPENING } from '../server/ai/prompts.ts';
import { WhatsHappeningSchema } from '../server/ai/schemas.ts';
import { geminiJson, groqJson } from '../server/ai/providers.ts';
import { config } from '../server/config.ts';

const file = process.argv[2]!;
const key = `n${process.argv[3] ?? '29121920'}`;
const det = (await ingest(readFileSync(file), file)).map(detectSheet);
const r = normalize(det, det.map((d) => d.profile), 'x');
const a = new Analysis({ summary: { id: 'x', filename: '', uploadedAt: '', uploadedBy: '', events: 0, eventsAT: 0, eventsEL: 0, companies: 0, periodStart: null, periodEnd: null, quality: 0, active: true }, events: r.events, companies: r.companies }, DEFAULT_SCORING);
const pack = companyFacts(a, key)!;

const report = (name: string, ms: number, data: { headline: string; summary: string; findings: { nature: string; title: string; body: string }[] }, allowed: number[], model: string) => {
  const text = [data.headline, data.summary, ...data.findings.map((f) => `${f.title} ${f.body}`)].join(' ');
  const bad = verifyNumbers([{ field: 'all', text }], allowed);
  console.log(`\n== ${name} (${model}) ${ms} ms`);
  console.log('Titular:', data.headline);
  console.log('Hallazgos:', data.findings.map((f) => `[${f.nature}] ${f.title}`).join(' | '));
  console.log('Cifras sin respaldo:', bad.length ? bad.map((b) => b.value).join(', ') : 'ninguna');
};

if (config.geminiKey) {
  const t = Date.now();
  try {
    const g = await geminiJson(SYSTEM_ANALYST, `${TASK_WHATS_HAPPENING}\n\n${packToText(pack)}`, WhatsHappeningSchema);
    report('Gemini', Date.now() - t, g.result.data, packNumbers(pack), g.model);
  } catch (err) { console.log('\n== Gemini falló:', err instanceof Error ? err.message : err); }
}
if (config.groqKey && !process.env.ONLY_GEMINI) {
  const t = Date.now();
  const c = compactPack(pack, 9000);
  const keys = (a.profile(key)?.mechanisms ?? []).slice(0, 2).map((m) => m.key);
  try {
    const g = await groqJson(`${SYSTEM_COMPACT}\n\nBiblioteca técnica SOC relevante:\n${knowledgeDigest([...keys, 'aumento', 'reincidencia', 'severidad'])}`, `${TASK_WHATS_HAPPENING}\n\n${packToText(c)}`, WhatsHappeningSchema, 3200);
    report('Groq', Date.now() - t, g.data, packNumbers(c), g.model);
  } catch (err) { console.log('\n== Groq falló:', err instanceof Error ? err.message : err); }
}
