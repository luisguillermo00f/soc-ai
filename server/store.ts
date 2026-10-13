// Datasets: importación en dos pasos (inspeccionar → escanear), dataset activo y caché del análisis.
// El archivo original nunca se guarda: solo los eventos normalizados y seudonimizados (cifrados).

import { randomUUID } from 'node:crypto';
import type { Capability, CompanyRec, DatasetSummary, EventRec, InspectResult, QualityReport, ScoringConfig, SheetProfile } from '../shared/types.ts';
import { audit, db, getSetting, seal, setSetting, unseal } from './db.ts';
import { config } from './config.ts';
import { ingest } from './pipeline/ingest.ts';
import { detectSheet } from './pipeline/schema.ts';
import { normalize } from './pipeline/normalize.ts';
import { Analysis } from './analytics/engine.ts';
import { DEFAULT_SCORING } from './analytics/scoring.ts';

export interface Staged {
  inspect: InspectResult;
  events: EventRec[];
  companies: CompanyRec[];
  quality: QualityReport;
  sheets: SheetProfile[];
  userId: string;
  expires: number;
}

const staging = new Map<string, Staged>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of staging) if (v.expires < now) staging.delete(k);
}

function capabilities(sheets: SheetProfile[]): Capability[] {
  const roles = new Set(sheets.flatMap((s) => s.columns.map((c) => c.role)).filter(Boolean));
  const NAMES: Record<string, string> = {
    company: 'empresa', eventDate: 'fecha del evento', mechanism: 'mecanismo o tipo de riesgo', careLevel: 'nivel de atención',
    daysLost: 'días de incapacidad', workCenter: 'centro de trabajo', workerId: 'documento del trabajador', contactStatus: 'estado de gestión',
    jobTitle: 'cargo', bodyPart: 'parte del cuerpo', eventTime: 'hora del evento',
  };
  const cap = (id: string, label: string, needs: string[], reason: string): Capability => {
    const missing = needs.filter((n) => !roles.has(n as never));
    return { id, label, available: !missing.length, reason: !missing.length ? reason : `El archivo no trae columna de ${missing.map((n) => NAMES[n] ?? n).join(' ni de ')}.` };
  };
  return [
    cap('freq', 'Frecuencia y ranking de empresas', ['company'], 'Conteos por empresa.'),
    cap('time', 'Tendencias y anomalías temporales', ['eventDate'], 'Series mensuales, semestres y año contra año.'),
    cap('mech', 'Patrones por mecanismo', ['mechanism'], 'Familias de mecanismo y su recurrencia.'),
    cap('sev', 'Severidad', ['careLevel'], 'Nivel de atención y días de incapacidad.'),
    cap('where', 'Dónde ocurre', ['workCenter'], 'Centro de trabajo y municipio.'),
    cap('workers', 'Reincidencia de trabajadores', ['workerId'], 'Seudónimo por documento cifrado.'),
    cap('mgmt', 'Gestión SOC', ['contactStatus'], 'Estado de contacto y asesor asignado.'),
    cap('job', 'Cargo', ['jobTitle'], 'Patrones por cargo.'),
    cap('body', 'Parte del cuerpo', ['bodyPart'], 'Patrones por parte del cuerpo.'),
    cap('hour', 'Hora del evento', ['eventTime'], 'Patrones por franja horaria.'),
  ];
}

export async function inspectUpload(buf: Buffer, filename: string, userId: string): Promise<InspectResult> {
  sweep();
  const sheets = await ingest(buf, filename);
  const detected = sheets.map(detectSheet);
  const profiles = detected.map((d) => d.profile);
  if (!profiles.some((p) => p.role === 'events')) {
    const reasons = profiles.map((p) => `"${p.name}": ${p.reason}`).join(' ');
    throw new Error(`No se encontró ninguna hoja con eventos de siniestralidad. ${reasons}`);
  }
  const { events, companies, quality } = normalize(detected, profiles, config.secret);
  if (!events.length) throw new Error('Las hojas reconocidas no tienen filas con empresa identificable.');
  const dates = events.map((e) => (e.cls === 'AT' ? e.date : e.qualDate ?? e.date)).filter((d): d is string => !!d).sort();
  const names = new Map(companies.map((c) => [c.key, c.name]));
  const stagingId = randomUUID();
  const inspect: InspectResult = {
    stagingId,
    filename,
    sizeBytes: buf.length,
    sheets: profiles,
    records: events.length,
    companies: companies.length,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    quality,
    preview: events.slice(0, 8).map((e) => ({
      eventNo: e.eventNo, date: e.date, company: names.get(e.company) ?? e.company, mechanism: e.mechanism,
      workCenter: e.workCenter, careLevel: e.careLevel, daysLost: e.daysLost, cls: e.cls,
    })),
    capabilities: capabilities(profiles),
  };
  staging.set(stagingId, { inspect, events, companies, quality, sheets: profiles, userId, expires: Date.now() + 30 * 60_000 });
  return inspect;
}

export function takeStaged(id: string): Staged | null {
  sweep();
  const s = staging.get(id) ?? null;
  if (s) staging.delete(id);
  return s;
}

export function commitDataset(s: Staged, userName: string): DatasetSummary {
  const id = randomUUID();
  const at = s.events.filter((e) => e.cls === 'AT');
  const summary: DatasetSummary = {
    id,
    filename: s.inspect.filename,
    uploadedAt: new Date().toISOString(),
    uploadedBy: userName,
    events: s.events.length,
    eventsAT: at.length,
    eventsEL: s.events.length - at.length,
    companies: s.companies.length,
    periodStart: s.inspect.periodStart,
    periodEnd: s.inspect.periodEnd,
    quality: s.quality.score,
    active: true,
  };
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE datasets SET active = 0').run();
    db.prepare(`INSERT INTO datasets (id, filename, uploaded_at, uploaded_by, active, summary_json, sheets_json, quality_json, payload)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(
      id, summary.filename, summary.uploadedAt, s.userId, JSON.stringify(summary), JSON.stringify(s.sheets),
      JSON.stringify(s.quality), seal({ events: s.events, companies: s.companies }),
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  audit(s.userId, 'dataset.import', { id, filename: summary.filename, events: summary.events });
  cache = null;
  return summary;
}

export function listDatasets(): DatasetSummary[] {
  const rows = db.prepare('SELECT id, active, summary_json FROM datasets ORDER BY uploaded_at DESC').all() as { id: string; active: number; summary_json: string }[];
  return rows.map((r) => ({ ...(JSON.parse(r.summary_json) as DatasetSummary), active: !!r.active }));
}

export function activateDataset(id: string, userId: string): boolean {
  const exists = db.prepare('SELECT 1 FROM datasets WHERE id = ?').get(id);
  if (!exists) return false;
  db.exec('BEGIN');
  db.prepare('UPDATE datasets SET active = 0').run();
  db.prepare('UPDATE datasets SET active = 1 WHERE id = ?').run(id);
  db.exec('COMMIT');
  audit(userId, 'dataset.activate', { id });
  cache = null;
  return true;
}

export function deleteDataset(id: string, userId: string): boolean {
  const r = db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
  audit(userId, 'dataset.delete', { id });
  cache = null;
  return r.changes > 0;
}

export function datasetQuality(id: string): { quality: QualityReport; sheets: SheetProfile[] } | null {
  const row = db.prepare('SELECT quality_json, sheets_json FROM datasets WHERE id = ?').get(id) as { quality_json: string; sheets_json: string } | undefined;
  return row ? { quality: JSON.parse(row.quality_json), sheets: JSON.parse(row.sheets_json) } : null;
}

/* ── Configuración de puntaje ── */

export function scoringConfig(): ScoringConfig {
  const saved = getSetting<ScoringConfig>('scoring');
  return saved ? { ...DEFAULT_SCORING, ...saved, weights: { ...DEFAULT_SCORING.weights, ...saved.weights } } : DEFAULT_SCORING;
}

export function saveScoringConfig(cfg: ScoringConfig, userId: string) {
  setSetting('scoring', cfg);
  audit(userId, 'scoring.update', cfg);
  cache = null;
}

/* ── Análisis activo (memoizado) ── */

let cache: { id: string; analysis: Analysis } | null = null;

export function activeAnalysis(): Analysis | null {
  const row = db.prepare('SELECT id, summary_json, payload FROM datasets WHERE active = 1 LIMIT 1').get() as
    { id: string; summary_json: string; payload: Uint8Array } | undefined;
  if (!row) { cache = null; return null; }
  if (cache && cache.id === row.id) return cache.analysis;
  const { events, companies } = unseal<{ events: EventRec[]; companies: CompanyRec[] }>(row.payload);
  const summary = { ...(JSON.parse(row.summary_json) as DatasetSummary), active: true };
  const analysis = new Analysis({ summary, events, companies }, scoringConfig());
  cache = { id: row.id, analysis };
  return analysis;
}

export function buildAnalysisFor(s: Staged, summary: DatasetSummary, onStep?: ConstructorParameters<typeof Analysis>[2]): Analysis {
  const analysis = new Analysis({ summary, events: s.events, companies: s.companies }, scoringConfig(), onStep);
  cache = { id: summary.id, analysis };
  return analysis;
}
