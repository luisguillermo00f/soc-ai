// API HTTP de SOC AI. Toda ruta exige sesión salvo /auth/*; las que modifican exigen rol y el encabezado CSRF.

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import * as z from 'zod';
import type { EventFilter, Role, ScanStage, ScoringConfig } from '../../shared/types.ts';
import {
  createUser, csrfGuard, presentationUser, endSession, login, loginFailed, loginLimited, loginOk, requireAuth, requireRole, startSession, userCount, validatePassword,
} from '../auth.ts';
import { audit, db } from '../db.ts';
import { config } from '../config.ts';
import { IngestError } from '../pipeline/ingest.ts';
import {
  activateDataset, activeAnalysis, buildAnalysisFor, commitDataset, datasetQuality, deleteDataset, inspectUpload, listDatasets,
  saveScoringConfig, scoringConfig, takeStaged,
} from '../store.ts';
import { FACTOR_DOCS, DEFAULT_SCORING } from '../analytics/scoring.ts';
import { aiStatus, AiError, claude } from '../ai/client.ts';
import { cached, generate, listOutputs, type Kind } from '../ai/reason.ts';
import { type ChatEvent } from '../ai/assistant.ts';
import { runAssistant } from '../ai/companion.ts';
import { companyFacts, overviewFacts } from '../analytics/evidence.ts';

export const api = express.Router();
api.use(express.json({ limit: '1mb' }));
api.use(csrfGuard);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (res.headersSent) return;
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') }); return; }
    if (err instanceof AiError) { res.status(err.status).json({ error: err.message }); return; }
    if (err instanceof IngestError) { res.status(422).json({ error: err.message }); return; }
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno.' });
  }
};

function analysisOr404(res: Response) {
  const a = activeAnalysis();
  if (!a) res.status(409).json({ error: 'No hay un dataset activo. Importa un Excel para empezar.', code: 'NO_DATASET' });
  return a;
}

/* ───────────────────────── Autenticación ───────────────────────── */

api.get('/auth/state', (req, res) => {
  res.json({ setupRequired: userCount() === 0, presentation: config.openAccess && userCount() > 0 });
});

api.post('/auth/setup', wrap((req, res) => {
  if (userCount() > 0) { res.status(409).json({ error: 'La configuración inicial ya se hizo.' }); return; }
  const body = z.object({ email: z.string().email('Correo no válido.'), name: z.string().min(2, 'Escribe tu nombre.'), password: z.string() }).parse(req.body);
  const pw = validatePassword(body.password);
  if (pw) { res.status(400).json({ error: pw }); return; }
  const user = createUser(body.email, body.name, 'admin', body.password);
  audit(user.id, 'setup');
  startSession(res, user);
  res.json({ user });
}));

api.post('/auth/login', wrap((req, res) => {
  const ip = req.ip ?? 'local';
  if (loginLimited(ip)) { res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' }); return; }
  const body = z.object({ email: z.string(), password: z.string() }).parse(req.body);
  const user = login(body.email, body.password);
  if (!user) { loginFailed(ip); res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); return; }
  loginOk(ip);
  startSession(res, user);
  res.json({ user });
}));

// Atajo del modo presentación: abre sesión como el primer administrador sin contraseña.
api.post('/auth/presentation', (req, res) => {
  const user = config.openAccess ? presentationUser() : null;
  if (!user) { res.status(403).json({ error: 'El modo presentación no está activo.' }); return; }
  startSession(res, user);
  res.json({ user });
});

api.post('/auth/logout', (req, res) => { endSession(req, res); res.json({ ok: true }); });

api.use(requireAuth);

api.get('/auth/me', (req, res) => {
  res.json({ user: req.user, ai: aiStatus() });
});

/* ───────────────────────── Datasets ───────────────────────── */

api.get('/datasets', (req, res) => { res.json({ datasets: listDatasets() }); });

api.post('/datasets/inspect', requireRole('analista'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Adjunta un archivo.' }); return; }
  const name = req.file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 160);
  try {
    const result = await inspectUpload(req.file.buffer, name, req.user!.id);
    audit(req.user!.id, 'dataset.inspect', { filename: name, records: result.records });
    res.json(result);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    res.status(422).json({ error: err instanceof Error ? err.message : 'No se pudo leer el archivo.' });
  }
}));

api.post('/datasets/scan', requireRole('analista'), wrap(async (req, res) => {
  const { stagingId } = z.object({ stagingId: z.string() }).parse(req.body);
  const staged = takeStaged(stagingId);
  if (!staged) { res.status(410).json({ error: 'La previsualización expiró. Vuelve a subir el archivo.' }); return; }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  const stage = (s: ScanStage) => send({ type: 'stage', stage: s });

  const q = staged.quality;
  const sheets = staged.sheets.filter((s) => s.role === 'events');
  stage({ id: 'archivo', label: 'Validando archivo y esquema', status: 'done', detail: `${sheets.length} hoja(s) de eventos, ${sheets.reduce((n, s) => n + s.columns.filter((c) => c.role).length, 0)} columnas interpretadas` });
  stage({ id: 'normalizacion', label: 'Normalizando empresas, fechas y categorías', status: 'done', detail: `${q.eventsKept} eventos, ${staged.companies.length} empresas, ${q.unified.length} grupos de variantes unificados, calidad ${q.score} %` });

  stage({ id: 'almacenamiento', label: 'Cifrando y guardando el dataset', status: 'running' });
  let t = Date.now();
  const summary = commitDataset(staged, req.user!.name);
  stage({ id: 'almacenamiento', label: 'Cifrando y guardando el dataset', status: 'done', ms: Date.now() - t, detail: 'AES-256-GCM; trabajadores seudonimizados' });

  stage({ id: 'empresas', label: 'Analizando empresas y calculando puntajes de riesgo', status: 'running' });
  const labels = { empresas: 'Analizando empresas y calculando puntajes de riesgo', anomalias: 'Buscando anomalías temporales', patrones: 'Detectando recurrencias y patrones', insights: 'Generando hallazgos proactivos' } as const;
  const order = ['empresas', 'anomalias', 'patrones', 'insights'] as const;
  const timings: Partial<Record<(typeof order)[number], number>> = {};
  const a = buildAnalysisFor(staged, summary, (id, ms) => {
    timings[id] = ms;
    const next = order[order.indexOf(id) + 1];
    if (next) stage({ id: next, label: labels[next], status: 'running' });
  });
  const o = a.overview();
  const details = {
    empresas: `${o.kpis.companiesWithEvents} empresas con accidentes; ${o.levels.critico} críticas, ${o.levels.prioritario} prioritarias`,
    anomalias: `${a.globalAnomalies.length} meses atípicos en el portafolio; ${[...a.anomaliesByCompany.values()].filter((x) => x.length).length} empresas con meses anómalos`,
    patrones: `${a.patterns.length} patrones: ${a.patterns.filter((p) => p.kind === 'company').length} por empresa, ${a.patterns.filter((p) => p.kind === 'cluster').length} rachas, ${a.patterns.filter((p) => p.kind === 'worker').length} con reincidencia`,
    insights: `${a.insights.length} hallazgos, ${a.insights.filter((i) => i.severity === 'alta').length} de prioridad alta`,
  };
  for (const id of order) stage({ id, label: labels[id], status: 'done', ms: timings[id], detail: details[id] });

  const status = aiStatus();
  const engine = status.engine;
  // Claude: planes con IA para las 3 críticas. Gratuitos (Gemini/Groq): límites por minuto, planes bajo demanda.
  const attention = engine === 'claude' ? o.attention.slice(0, 3) : engine === 'reglas' ? o.attention.slice(0, 30) : [];
  const iaLabel = status.enabled ? `Redactando lectura ejecutiva con ${status.model}` : 'Lectura ejecutiva';
  stage({ id: 'ia', label: iaLabel, status: 'running' });
  t = Date.now();
  try {
    const r = await generate(a, 'executive', 'portfolio', { userId: req.user!.id });
    const by = r.meta.engine === 'reglas' ? 'Motor de reglas' : `${r.meta.model}`;
    stage({ id: 'ia', label: iaLabel, status: 'done', ms: Date.now() - t, detail: `${by}${r.meta.engine !== 'reglas' ? '; cifras verificadas contra el paquete de evidencia' : status.enabled ? ' (los modelos de IA no respondieron)' : ' (sin clave de IA configurada)'}` });
  } catch (err) {
    stage({ id: 'ia', label: 'Lectura ejecutiva', status: 'error', detail: err instanceof Error ? err.message : 'Error' });
  }

  stage({ id: 'planes', label: 'Preparando planes de choque', status: 'running' });
  t = Date.now();
  const results = await Promise.allSettled(attention.map((s) => generate(a, 'plan', s.key, { userId: req.user!.id })));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const planDetail = attention.length
    ? `${ok} planes listos para ${engine === 'claude' ? 'las empresas críticas' : 'empresas críticas y prioritarias'}`
    : engine === 'gemini' || engine === 'groq'
      ? `Se generan con ${status.model} al abrir cada empresa (el plan gratuito limita las solicitudes por minuto)`
      : 'Ninguna empresa requiere plan inmediato';
  stage({ id: 'planes', label: 'Preparando planes de choque', status: 'done', ms: Date.now() - t, detail: planDetail });

  send({ type: 'complete', datasetId: summary.id });
  res.end();
}));

api.get('/datasets/:id/quality', (req, res) => {
  const q = datasetQuality(String(req.params.id));
  if (!q) { res.status(404).json({ error: 'Dataset no encontrado.' }); return; }
  res.json(q);
});

api.post('/datasets/:id/activate', requireRole('analista'), (req, res) => {
  if (!activateDataset(String(req.params.id), req.user!.id)) { res.status(404).json({ error: 'Dataset no encontrado.' }); return; }
  res.json({ ok: true });
});

api.delete('/datasets/:id', requireRole('admin'), (req, res) => {
  if (!deleteDataset(String(req.params.id), req.user!.id)) { res.status(404).json({ error: 'Dataset no encontrado.' }); return; }
  res.json({ ok: true });
});

/* ───────────────────────── Analítica ───────────────────────── */

api.get('/overview', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json(a.overview());
}));

api.get('/companies', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json({ companies: a.list(), period: a.period });
}));

api.get('/companies/:key', wrap((req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const p = a.profile(String(req.params.key));
  if (!p) { res.status(404).json({ error: 'Empresa no encontrada en el dataset activo.' }); return; }
  res.json({ profile: p, period: a.period, whats: cached(a, 'whats', p.summary.key), plan: cached(a, 'plan', p.summary.key) });
}));

api.get('/companies/:key/facts', wrap((req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const pack = companyFacts(a, String(req.params.key));
  if (!pack) { res.status(404).json({ error: 'Empresa no encontrada.' }); return; }
  res.json(pack);
}));

api.get('/advisors/apa', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json({ advisors: a.apaAdvisors(), period: a.period });
}));

api.get('/advisors', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json({ advisors: a.advisors(), period: a.period });
}));

api.get('/patterns', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json({ patterns: a.patterns, period: a.period });
}));

api.get('/trends', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json(a.trends());
}));

api.get('/heatmap', wrap((req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const allowed = ['company', 'mechGroup', 'month', 'municipality', 'careRank', 'eventType', 'affiliateType', 'advisor', 'weekday', 'workCenter'];
  const row = String(req.query.row ?? 'company');
  const col = String(req.query.col ?? 'mechGroup');
  if (!allowed.includes(row) || !allowed.includes(col)) { res.status(400).json({ error: 'Dimensión no válida.' }); return; }
  res.json(a.heatmap(row, col, Math.min(40, Number(req.query.limit ?? 15))));
}));

const FilterSchema = z.object({
  company: z.string().optional(), from: z.string().optional(), to: z.string().optional(), mechGroup: z.string().optional(),
  eventType: z.string().optional(), careLevel: z.string().optional(), municipality: z.string().optional(), workCenter: z.string().optional(),
  advisor: z.string().optional(), advisorSecondary: z.string().optional(), contactStatus: z.string().optional(), cls: z.enum(['AT', 'EL']).optional(), severe: z.boolean().optional(),
  q: z.string().max(120).optional(), ids: z.array(z.string()).max(5000).optional(),
});

api.post('/events/query', wrap((req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const body = z.object({ filter: FilterSchema, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(500).default(50), sort: z.string().default('-date') }).parse(req.body);
  res.json(a.events(body.filter as EventFilter, body.offset, body.limit, body.sort));
}));

api.get('/facets', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json({ facets: a.facets(), companies: a.list().map((s) => ({ key: s.key, name: s.name, level: s.score.level, events: s.eventsAT })) });
}));

api.get('/methodology', (req, res) => {
  res.json({ factors: FACTOR_DOCS, config: scoringConfig(), defaults: DEFAULT_SCORING });
});

api.put('/settings/scoring', requireRole('admin'), wrap((req, res) => {
  const body = z.object({
    weights: z.record(z.string(), z.number().min(0).max(100)),
    thresholds: z.object({ critico: z.number().min(1).max(100), prioritario: z.number().min(1).max(100), atencion: z.number().min(1).max(100) }),
    minEvidence: z.number().int().min(1).max(20),
  }).parse(req.body) as ScoringConfig;
  if (!(body.thresholds.critico > body.thresholds.prioritario && body.thresholds.prioritario > body.thresholds.atencion)) {
    res.status(400).json({ error: 'Los umbrales deben cumplir crítico > prioritario > atención.' });
    return;
  }
  const known = new Set(FACTOR_DOCS.map((f) => f.id));
  if (Object.keys(body.weights).some((k) => !known.has(k)) || Object.values(body.weights).reduce((s, x) => s + x, 0) <= 0) {
    res.status(400).json({ error: 'Pesos no válidos.' });
    return;
  }
  saveScoringConfig(body, req.user!.id);
  res.json({ ok: true, config: scoringConfig() });
}));

/* ───────────────────────── IA ───────────────────────── */

api.get('/ai/status', (req, res) => { res.json(aiStatus()); });

const KIND_ROUTES: Record<string, Kind> = { whats: 'whats', plan: 'plan' };

api.post('/ai/company/:key/:kind', requireRole('analista'), wrap(async (req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const kind = KIND_ROUTES[String(req.params.kind)];
  if (!kind) { res.status(404).json({ error: 'Tipo de análisis no válido.' }); return; }
  const key = String(req.params.key);
  if (!a.summaries.has(key)) { res.status(404).json({ error: 'Empresa no encontrada.' }); return; }
  const body = z.object({ force: z.boolean().optional(), engine: z.enum(['auto', 'reglas']).optional() }).parse(req.body ?? {});
  res.json(await generate(a, kind, key, { force: body.force, engine: body.engine, userId: req.user!.id }));
}));

api.post('/ai/compare', requireRole('analista'), wrap(async (req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const body = z.object({ keys: z.array(z.string()).min(2).max(4), force: z.boolean().optional() }).parse(req.body);
  const keys = [...new Set(body.keys)].filter((k) => a.summaries.has(k));
  if (keys.length < 2) { res.status(400).json({ error: 'Selecciona al menos dos empresas válidas.' }); return; }
  res.json(await generate(a, 'compare', keys.join(','), { force: body.force, userId: req.user!.id }));
}));

api.get('/ai/executive', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json({ result: cached(a, 'executive', 'portfolio') });
}));

api.post('/ai/executive', requireRole('analista'), wrap(async (req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const body = z.object({ force: z.boolean().optional() }).parse(req.body ?? {});
  res.json(await generate(a, 'executive', 'portfolio', { force: body.force, userId: req.user!.id }));
}));

api.get('/ai/plans', wrap((req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const seen = new Set<string>();
  const plans = listOutputs(a, 'plan').filter((r) => !seen.has(r.subject) && seen.add(r.subject)).map((r) => {
    const s = a.summaries.get(r.subject);
    return { company: r.subject, name: s?.name ?? r.subject, level: s?.score.level ?? null, score: s?.score.score ?? null, engine: r.engine, createdAt: r.created_at };
  });
  res.json({ plans });
}));

api.get('/ai/facts/overview', wrap((req, res) => {
  const a = analysisOr404(res);
  if (a) res.json(overviewFacts(a));
}));

api.post('/ai/chat', wrap(async (req, res) => {
  const a = analysisOr404(res);
  if (!a) return;
  const body = z.object({
    question: z.string().min(1).max(2000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) })).max(30).default([]),
    context: z.string().max(200).nullable().optional(),
  }).parse(req.body);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  const emit = (e: ChatEvent) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };
  await runAssistant(a, body.history, body.question, body.context ?? null, req.user!.id, emit, ctrl.signal);
  res.end();
}));

/* ───────────────────────── Administración ───────────────────────── */

api.get('/admin/users', requireRole('admin'), (req, res) => {
  res.json({ users: db.prepare('SELECT id, email, name, role, disabled, created_at FROM users ORDER BY created_at').all() });
});

api.post('/admin/users', requireRole('admin'), wrap((req, res) => {
  const body = z.object({ email: z.string().email('Correo no válido.'), name: z.string().min(2), role: z.enum(['admin', 'analista', 'lector']), password: z.string() }).parse(req.body);
  const pw = validatePassword(body.password);
  if (pw) { res.status(400).json({ error: pw }); return; }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email.toLowerCase())) { res.status(409).json({ error: 'Ya existe un usuario con ese correo.' }); return; }
  const user = createUser(body.email, body.name, body.role as Role, body.password);
  audit(req.user!.id, 'user.create', { id: user.id, role: user.role });
  res.json({ user });
}));

api.patch('/admin/users/:id', requireRole('admin'), wrap((req, res) => {
  const body = z.object({ role: z.enum(['admin', 'analista', 'lector']).optional(), disabled: z.boolean().optional() }).parse(req.body);
  const id = String(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: 'No puedes cambiar tu propio rol ni desactivarte.' }); return; }
  if (body.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
  if (body.disabled !== undefined) {
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(body.disabled ? 1 : 0, id);
    if (body.disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  audit(req.user!.id, 'user.update', { id, ...body });
  res.json({ ok: true });
}));

api.get('/admin/audit', requireRole('admin'), (req, res) => {
  res.json({ entries: db.prepare(`SELECT a.at, a.action, a.detail, u.name FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`).all() });
});
