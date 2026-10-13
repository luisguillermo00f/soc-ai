// Comprueba que el verificador marca cifras inventadas y acepta las reales.
// Uso: npm run check:verifier -- "ruta/al/archivo.xlsx"
import { readFileSync } from 'node:fs';
import { ingest } from '../server/pipeline/ingest.ts';
import { detectSheet } from '../server/pipeline/schema.ts';
import { normalize } from '../server/pipeline/normalize.ts';
import { Analysis } from '../server/analytics/engine.ts';
import { DEFAULT_SCORING } from '../server/analytics/scoring.ts';
import { companyFacts, packNumbers, verifyNumbers } from '../server/analytics/evidence.ts';
const file = process.argv[2]!;
const det = (await ingest(readFileSync(file), file)).map(detectSheet);
const r = normalize(det, det.map((d) => d.profile), 'x');
const a = new Analysis({ summary: { id: 'x', filename: '', uploadedAt: '', uploadedBy: '', events: 0, eventsAT: 0, eventsEL: 0, companies: 0, periodStart: null, periodEnd: null, quality: 0, active: true }, events: r.events, companies: r.companies }, DEFAULT_SCORING);
const pack = companyFacts(a, 'n29121920')!;
const allowed = packNumbers(pack);
const text = 'Carnecol concentra 85 accidentes (4,9 %), 21 son caídas a nivel (24,7 %). Hubo 5 eventos graves y 583 días de incapacidad. Además el 31,4 % ocurre los lunes y 47 trabajadores están expuestos.';
console.log(pack.facts.length, 'hechos;', verifyNumbers([{ field: 'summary', text }], allowed));
