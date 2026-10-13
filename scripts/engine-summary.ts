// Resumen del motor analítico en consola: puntajes, patrones e insights de un Excel.
// Uso: npm run engine:summary -- "ruta/al/archivo.xlsx"
import { readFileSync } from 'node:fs';
import { ingest } from '../server/pipeline/ingest.ts';
import { detectSheet } from '../server/pipeline/schema.ts';
import { normalize } from '../server/pipeline/normalize.ts';
import { Analysis } from '../server/analytics/engine.ts';
import { DEFAULT_SCORING } from '../server/analytics/scoring.ts';
const file = process.argv[2]!;
const sheets = await ingest(readFileSync(file), file);
const det = sheets.map(detectSheet);
const r = normalize(det, det.map(d=>d.profile), 'dev-secret');
const t0 = performance.now();
const a = new Analysis({ summary: { id:'x', filename:'f', uploadedAt:'', uploadedBy:'', events:0, eventsAT:0, eventsEL:0, companies:0, periodStart:null, periodEnd:null, quality:0, active:true }, events: r.events, companies: r.companies }, DEFAULT_SCORING);
console.log('analysis ms', Math.round(performance.now()-t0));
const o = a.overview();
console.log(JSON.stringify({period:o.period, kpis:o.kpis, levels:o.levels}, null, 1));
console.log('\nTOP 15 SCORE');
for (const s of a.list().slice(0,15)) console.log(s.score.score, s.score.level, s.name, s.eventsAT, s.trend.previous+'->'+s.trend.recent, s.repeatWorkers, s.contactStatus, '|', s.score.factors.map(f=>`${f.id}:${f.points}`).join(' '));
console.log('\nPATTERNS', a.patterns.length, a.patterns.reduce((m,p)=>(m[p.kind]=(m[p.kind]??0)+1,m),{} as any));
for (const p of a.patterns.slice(0,12)) console.log(`[${p.kind}] ${p.score} ${p.confidence} ${p.title} :: ${p.path.map(s=>s.value).join(' → ')} :: ${p.explanation}`);
for (const p of a.patterns.filter(p=>p.kind==='global'||p.kind==='cross-company')) console.log(`[${p.kind}] ${p.title} :: ${p.explanation}`);
console.log('\nINSIGHTS');
for (const i of a.insights) console.log(`(${i.severity}) ${i.title} — ${i.finding}`);
console.log(a.globalAnomalies);
