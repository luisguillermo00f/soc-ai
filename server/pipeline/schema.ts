// Detección de esquema: encuentra la fila de encabezados de cada hoja y asigna un rol
// semántico a cada columna combinando el nombre del encabezado y el contenido real.
// Nada está fijado a un archivo concreto: un Excel con otros nombres de columnas funciona igual.

import type { ColumnProfile, FieldRole, SheetProfile } from '../../shared/types.ts';
import type { Cell, RawSheet } from './ingest.ts';
import { fold } from '../lib/text.ts';
import { parseDate } from './dates.ts';

interface NameRule { role: FieldRole; re: RegExp; score: number }

// Sinónimos por rol. Un encabezado puede coincidir con varios roles; gana el que mejor
// se combine con lo que la columna contiene realmente.
const NAME_RULES: NameRule[] = [
  { role: 'companyId', re: /\b(nit|dni empresa|documento empresa|id empresa|nit empresa|nit empleador)\b/, score: 0.95 },
  { role: 'company', re: /\b(nombre comercial|nombre empresa|nombre de la empresa|razon social|nombre empleador|empleador)\b/, score: 0.95 },
  { role: 'company', re: /^(empresa|cliente|compania)$/, score: 0.85 },
  { role: 'contract', re: /\b(contrato|poliza)\b/, score: 0.9 },
  { role: 'eventId', re: /\b(numero siniestro|nro siniestro|no siniestro|num siniestro|id siniestro|radicado|consecutivo|numero de caso)\b/, score: 0.95 },
  { role: 'eventDate', re: /\bfecha (de )?(ocurrencia|del accidente|accidente|del evento|evento|del siniestro|siniestro)\b/, score: 0.95 },
  { role: 'eventDate', re: /\bfecha ocurrencia\b/, score: 0.95 },
  { role: 'qualificationDate', re: /\bfecha (de )?calificacion\b/, score: 0.9 },
  { role: 'eventClass', re: /\b(causa siniestro|clase de evento|clase evento|tipo de evento atel)\b/, score: 0.7 },
  { role: 'eventType', re: /\b(tipo siniestro|tipo de siniestro|tipo de accidente|tipo accidente)\b/, score: 0.85 },
  { role: 'mechanism', re: /\b(mecanismo|forma del accidente|forma de accidente|tipo riesgo|tipo de riesgo|agente del accidente|riesgo asociado)\b/, score: 0.8 },
  { role: 'daysLost', re: /\b(dias? (de )?incapacidad|dias perdidos|dias de incapacidad acumulada|incapacidad)\b/, score: 0.9 },
  { role: 'affiliateType', re: /\b(tipo afiliado|tipo de afiliado|tipo vinculacion|tipo de vinculacion|vinculacion)\b/, score: 0.9 },
  { role: 'workerName', re: /\bnombre (del )?(paciente|trabajador|accidentado|empleado|afiliado|colaborador)\b/, score: 0.95 },
  { role: 'workerId', re: /\b(dni|documento|cedula|identificacion|cc) (del )?(paciente|trabajador|accidentado|empleado|afiliado|colaborador)\b/, score: 0.95 },
  { role: 'workCenter', re: /\b(centro (de )?trabajo|sede|centro de costo|centro de costos|frente de trabajo)\b/, score: 0.85 },
  { role: 'area', re: /^(area|area de trabajo|seccion|departamento|dependencia)$/, score: 0.85 },
  { role: 'municipality', re: /\b(municipio|ciudad|municipio ocurrencia|lugar de ocurrencia)\b/, score: 0.85 },
  { role: 'careLevel', re: /\b(tipo de atencion|nivel de atencion|atencion|descripcion del evento)\b/, score: 0.55 },
  { role: 'pcl', re: /^(pct|pct total|pcl|porcentaje pcl|perdida de capacidad laboral|porcentaje de perdida)$/, score: 0.85 },
  { role: 'advisorSecondary', re: /\basesor apa\b/, score: 0.9 },
  { role: 'advisor', re: /\b(asesor asignado|asesor|profesional asignado|consultor)\b/, score: 0.75 },
  { role: 'contactStatus', re: /\b(status|estado de contactabilidad|contactabilidad|estado gestion|estado de gestion)\b/, score: 0.85 },
  { role: 'jobTitle', re: /\b(cargo|ocupacion|oficio|puesto)\b/, score: 0.85 },
  { role: 'bodyPart', re: /\b(parte (del )?cuerpo|parte afectada|segmento corporal|zona del cuerpo)\b/, score: 0.9 },
  { role: 'injuryType', re: /\b(tipo de lesion|naturaleza de la lesion|lesion|diagnostico)\b/, score: 0.8 },
  { role: 'process', re: /\b(proceso|actividad que realizaba|actividad)\b/, score: 0.7 },
  { role: 'eventTime', re: /\b(hora|hora del accidente|hora ocurrencia)\b/, score: 0.85 },
  { role: 'description', re: /\b(descripcion|relato|como ocurrio)\b/, score: 0.45 },
];

// Encabezados que existen pero no aportan análisis (constantes administrativas).
const IGNORED_HEADERS: [RegExp, string][] = [
  [/\bano de ocurrencia\b/, 'se deriva de la fecha de ocurrencia'],
  [/\bcalificacion origen\b/, 'indica que el origen fue calificado como laboral'],
  [/\b(estado furat|ind furat)\b/, 'indicador administrativo del reporte FURAT'],
  [/\b(el por empresa)\b/, 'contador auxiliar de la hoja'],
  [/\bano mes de asignacion\b/, 'fecha administrativa de asignación al asesor'],
];

const VALUE_VOCAB: Partial<Record<FieldRole, RegExp>> = {
  eventClass: /^(accidente de trabajo|enfermedad laboral|incidente|accidente|enfermedad)$/,
  mechanism: /caida|golpe|sobreesfuerzo|punzante|transito|biologic|quimic|atrapamiento|proyeccion|electric|temperatura|postura|violencia|sofocamiento|seres vivos|herramienta|choque|pisada|radiacion|quemadura|mordedura/,
  careLevel: /ambulatori|alta inmediata|hospitalari|quirurgic|cuidados intensivos|odontolog|urgencia|mortal/,
  eventType: /propio del trabajo|^transito$|deportivo|recreativo|^violencia$|^biologico$|sin informacion/,
  contactStatus: /contesta|cita|programad|gestionable|telefono|interesado|desea|agendar/,
  affiliateType: /^(empleado|independiente|estudiante|dependiente|contratista|sin informacion|aprendiz)$/,
  municipality: /barranquilla|soledad|cartagena|santa marta|bogota|medellin|cali|malambo|galapa|valledupar|monteria|sincelejo|riohacha|puerto colombia|sabanalarga|cienaga|baranoa|bucaramanga|turbaco/,
};

function profileValues(values: Cell[]) {
  const nonNull = values.filter((v) => v !== null && v !== '');
  const distinct = new Set(nonNull.map((v) => (v instanceof Date ? v.toISOString() : String(v)))).size;
  let dates = 0;
  let numbers = 0;
  let texts = 0;
  for (const v of nonNull) {
    if (parseDate(v, false)) dates++;
    if (typeof v === 'number') numbers++;
    else if (typeof v === 'string') {
      if (/^-?\d+([.,]\d+)?$/.test(v.trim())) numbers++; else texts++;
    }
  }
  const n = nonNull.length || 1;
  let kind: ColumnProfile['kind'] = 'mixed';
  if (!nonNull.length) kind = 'empty';
  else if (dates / n > 0.85) kind = 'date';
  else if (numbers / n > 0.85) kind = 'number';
  else if (texts / n > 0.85) kind = 'text';
  return { nonNull, distinct, dateShare: dates / n, numShare: numbers / n, kind };
}

function vocabShare(nonNull: Cell[], re: RegExp): number {
  if (!nonNull.length) return 0;
  const sample = nonNull.slice(0, 600);
  let hit = 0;
  for (const v of sample) if (re.test(fold(v))) hit++;
  return hit / sample.length;
}

function valueScore(role: FieldRole, p: ReturnType<typeof profileValues>): number {
  const { nonNull, kind, dateShare, numShare, distinct } = p;
  const vocab = VALUE_VOCAB[role];
  if (vocab) return vocabShare(nonNull, vocab);
  switch (role) {
    case 'eventDate':
    case 'qualificationDate':
      return dateShare;
    case 'daysLost': {
      if (numShare < 0.8) return 0;
      const nums = nonNull.map(Number).filter(Number.isFinite);
      const ok = nums.filter((x) => x >= 0 && x <= 2000 && Number.isInteger(x)).length / (nums.length || 1);
      return ok;
    }
    case 'pcl': {
      if (numShare < 0.8) return 0;
      const nums = nonNull.map(Number).filter(Number.isFinite);
      return nums.filter((x) => x >= 0 && x <= 100).length / (nums.length || 1);
    }
    case 'companyId':
      return vocabShare(nonNull, /^\d{5,12}( ?- ?\d)?$/);
    case 'eventId':
      return distinct / (nonNull.length || 1);
    case 'company':
    case 'workCenter':
    case 'advisor':
    case 'advisorSecondary':
    case 'workerName':
      return kind === 'text' || kind === 'mixed' ? 0.6 : 0.1;
    default:
      return kind === 'empty' ? 0 : 0.4;
  }
}

function nameScores(header: string): Map<FieldRole, number> {
  const h = fold(header);
  const out = new Map<FieldRole, number>();
  for (const r of NAME_RULES) {
    if (r.re.test(h)) out.set(r.role, Math.max(out.get(r.role) ?? 0, r.score));
  }
  return out;
}

function isPivot(rows: Cell[][]): boolean {
  for (const row of rows.slice(0, 40)) {
    for (const c of row) {
      const f = fold(c);
      if (f === 'etiquetas de fila' || f === 'row labels' || f === 'total general' || f === 'grand total') return true;
    }
  }
  return false;
}

function findHeaderRow(rows: Cell[][]): { index: number; hits: number } {
  let best = { index: -1, hits: 0 };
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i] ?? [];
    let hits = 0;
    for (const c of row) {
      if (typeof c !== 'string') continue;
      if (nameScores(c).size) hits++;
    }
    if (hits > best.hits) best = { index: i, hits };
  }
  return best;
}

/** Fila que no es dato: nota al pie, totales o texto suelto en la primera columna. */
function isNoteRow(row: Cell[]): boolean {
  const filled = row.filter((c) => c !== null && c !== '');
  if (!filled.length) return true;
  if (filled.length === 1 && typeof filled[0] === 'string') {
    const f = fold(filled[0]);
    if (f.length > 30 || /^(filtros|total|nota|fuente)/.test(f)) return true;
  }
  return false;
}

export interface DetectedSheet {
  profile: SheetProfile;
  dataRows: { row: number; cells: Cell[] }[];
  roleIndex: Partial<Record<FieldRole, number>>;
}

const SENSITIVE: FieldRole[] = ['workerName', 'workerId'];

export function detectSheet(sheet: RawSheet): DetectedSheet {
  const empty = (role: SheetProfile['role'], reason: string): DetectedSheet => ({
    profile: { name: sheet.name, role, headerRow: 0, rows: 0, skippedRows: 0, eventClass: null, columns: [], reason },
    dataRows: [],
    roleIndex: {},
  });

  const nonEmpty = sheet.rows.filter((r) => r.some((c) => c !== null && c !== ''));
  if (!nonEmpty.length) return empty('empty', 'La hoja está vacía.');
  if (isPivot(sheet.rows)) {
    return empty('pivot', 'Tabla dinámica (resumen derivado). Se omite para no contar dos veces los mismos eventos.');
  }
  const header = findHeaderRow(sheet.rows);
  if (header.index < 0 || header.hits < 3) {
    return empty('unrecognized', 'No se encontró una fila de encabezados con columnas reconocibles de siniestralidad.');
  }

  const headerCells = sheet.rows[header.index] ?? [];
  const body = sheet.rows.slice(header.index + 1);
  const dataRows: { row: number; cells: Cell[] }[] = [];
  let skipped = 0;
  body.forEach((cells, i) => {
    if (isNoteRow(cells)) { skipped++; return; }
    dataRows.push({ row: header.index + 2 + i, cells });
  });

  const width = Math.max(headerCells.length, ...dataRows.slice(0, 50).map((r) => r.cells.length));
  const candidates: { col: number; role: FieldRole; score: number; why: string }[] = [];
  const profiles: (ReturnType<typeof profileValues> & { header: string })[] = [];

  for (let c = 0; c < width; c++) {
    const headerText = String(headerCells[c] ?? `Columna ${c + 1}`).trim();
    const values = dataRows.map((r) => r.cells[c] ?? null);
    const p = profileValues(values);
    profiles.push({ ...p, header: headerText });
    const ns = nameScores(headerText);
    const roles = new Set<FieldRole>([...ns.keys(), ...(Object.keys(VALUE_VOCAB) as FieldRole[])]);
    for (const role of roles) {
      const n = ns.get(role) ?? 0;
      const v = valueScore(role, p);
      // El contenido manda cuando hay vocabulario; el nombre manda cuando el contenido es genérico.
      const hasVocab = !!VALUE_VOCAB[role];
      let score: number;
      if (hasVocab) score = n > 0 ? 0.45 * n + 0.55 * v : (v >= 0.6 ? 0.5 * v + 0.2 : 0);
      else score = n > 0 ? 0.7 * n + 0.3 * v : 0;
      if (score > 0.3) {
        const why = n > 0 && v >= 0.5
          ? 'nombre del encabezado y contenido coinciden'
          : n > 0 ? 'por el nombre del encabezado' : 'por el contenido de la columna';
        candidates.push({ col: c, role, score, why });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const roleIndex: Partial<Record<FieldRole, number>> = {};
  const colRole = new Map<number, { role: FieldRole; score: number; why: string }>();
  for (const cand of candidates) {
    if (cand.score < 0.5) continue;
    if (roleIndex[cand.role] !== undefined || colRole.has(cand.col)) continue;
    roleIndex[cand.role] = cand.col;
    colRole.set(cand.col, cand);
  }

  const columns: ColumnProfile[] = profiles.map((p, c) => {
    const assigned = colRole.get(c);
    const ignored = IGNORED_HEADERS.find(([re]) => re.test(fold(p.header)));
    let note: string | undefined;
    if (p.kind === 'empty') note = 'columna vacía';
    else if (p.distinct === 1) note = `constante: un solo valor en todas las filas`;
    const sensitive = assigned && SENSITIVE.includes(assigned.role);
    const sample = sensitive
      ? ['dato personal: se seudonimiza']
      : [...new Set(p.nonNull.slice(0, 200).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim())))].slice(0, 4);
    return {
      index: c,
      header: p.header,
      role: assigned?.role ?? null,
      confidence: assigned ? Math.min(1, assigned.score) : 0,
      reason: assigned ? assigned.why : ignored ? `No se usa: ${ignored[1]}.` : p.kind === 'empty' ? 'No se usa: sin datos.' : 'No se usa: no corresponde a una variable de análisis conocida.',
      fill: p.nonNull.length / (dataRows.length || 1),
      distinct: p.distinct,
      kind: p.kind,
      sample,
      note,
    };
  });

  // Clase de evento: por el contenido de la columna de causa, o por el nombre de la hoja.
  let eventClass: SheetProfile['eventClass'] = null;
  const clsCol = roleIndex.eventClass;
  if (clsCol !== undefined) {
    const vals = dataRows.map((r) => fold(r.cells[clsCol]));
    const el = vals.filter((v) => v.includes('enfermedad')).length;
    const at = vals.filter((v) => v.includes('accidente')).length;
    eventClass = el && at ? 'mixed' : el > at ? 'EL' : 'AT';
  }
  if (!eventClass) {
    const f = fold(sheet.name);
    eventClass = /\bel\b|enfermedad/.test(f) ? 'EL' : 'AT';
  }

  const mustHave: FieldRole[] = ['company', 'eventDate'];
  const missing = mustHave.filter((r) => roleIndex[r] === undefined && !(r === 'company' && roleIndex.companyId !== undefined));
  if (missing.length) {
    return {
      ...empty('unrecognized', `Faltan columnas esenciales: ${missing.map((m) => (m === 'company' ? 'empresa' : 'fecha del evento')).join(' y ')}.`),
      profile: {
        name: sheet.name, role: 'unrecognized', headerRow: header.index + 1, rows: dataRows.length, skippedRows: skipped,
        eventClass, columns, reason: `Faltan columnas esenciales: ${missing.map((m) => (m === 'company' ? 'empresa' : 'fecha del evento')).join(' y ')}.`,
      },
    };
  }

  return {
    profile: {
      name: sheet.name,
      role: 'events',
      headerRow: header.index + 1,
      rows: dataRows.length,
      skippedRows: skipped,
      eventClass,
      columns,
      reason: `Hoja de eventos ${eventClass === 'EL' ? 'de enfermedad laboral' : eventClass === 'mixed' ? 'mixta (AT y EL)' : 'de accidentes de trabajo'}: ${colRole.size} columnas interpretadas.`,
    },
    dataRows,
    roleIndex,
  };
}
