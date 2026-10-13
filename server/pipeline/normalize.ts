// Data normalization: de filas crudas a eventos limpios, con reporte de calidad.
// - Unifica variantes de categorías (espacios, tildes, mayúsculas, errores tipográficos leves).
// - Unifica empresas por NIT y, sin NIT, por nombre canónico.
// - Seudonimiza trabajadores con HMAC: el nombre y el documento nunca salen de esta función.
// - Detecta duplicados exactos (mismo número de siniestro) y probables.

import { createHmac } from 'node:crypto';
import type { CompanyRec, EventRec, FieldRole, QualityReport, SheetProfile, UnifiedVariant } from '../../shared/types.ts';
import type { Cell } from './ingest.ts';
import type { DetectedSheet } from './schema.ts';
import { clean, companyKey, fold, sentenceCase, similarity, titleCase } from '../lib/text.ts';
import { parseDate } from './dates.ts';
import { careRank, isSevere, mechFamily, severityIndex } from './taxonomy.ts';

type CatField = 'eventType' | 'mechanism' | 'affiliateType' | 'workCenter' | 'municipality' | 'careLevel'
  | 'advisor' | 'advisorSecondary' | 'contactStatus' | 'jobTitle' | 'bodyPart' | 'injuryType' | 'area' | 'process';

const CAT_FIELDS: CatField[] = ['eventType', 'mechanism', 'affiliateType', 'workCenter', 'municipality', 'careLevel',
  'advisor', 'advisorSecondary', 'contactStatus', 'jobTitle', 'bodyPart', 'injuryType', 'area', 'process'];

const FIELD_LABEL: Record<CatField, string> = {
  eventType: 'Tipo de siniestro', mechanism: 'Mecanismo', affiliateType: 'Tipo de afiliado', workCenter: 'Centro de trabajo',
  municipality: 'Municipio', careLevel: 'Nivel de atención', advisor: 'Asesor', advisorSecondary: 'Asesor APA',
  contactStatus: 'Estado de gestión', jobTitle: 'Cargo', bodyPart: 'Parte del cuerpo', injuryType: 'Tipo de lesión',
  area: 'Área', process: 'Proceso',
};

const NAME_FIELDS = new Set<CatField>(['workCenter', 'municipality', 'advisor', 'advisorSecondary']);

/** "Mantenimiento" y "Mantenimiento 2" son centros distintos aunque se parezcan. */
function sameDigits(a: string, b: string): boolean {
  return a.replace(/\D/g, '') === b.replace(/\D/g, '');
}

/** Normalizador de una variable categórica: agrupa variantes y elige una etiqueta. */
class CategoryNormalizer {
  private raw = new Map<string, Map<string, number>>();   // clave → (variante → conteo)
  private alias = new Map<string, string>();               // clave → clave canónica
  private labels = new Map<string, string>();
  readonly field: CatField;
  constructor(field: CatField) { this.field = field; }

  add(v: Cell) {
    const text = clean(v);
    if (!text) return;
    const key = fold(text);
    if (!key) return;
    // Se guarda la grafía original (con espacios sobrantes) para reportar qué se unificó.
    const spelling = String(v).replace(/\s+$/, ' ').replace(/^\s+/, ' ');
    const m = this.raw.get(key) ?? new Map<string, number>();
    m.set(spelling, (m.get(spelling) ?? 0) + 1);
    this.raw.set(key, m);
  }

  build(): UnifiedVariant[] {
    const totals = [...this.raw.entries()].map(([k, m]) => [k, [...m.values()].reduce((a, b) => a + b, 0)] as const)
      .sort((a, b) => b[1] - a[1]);
    // Fusiona claves poco frecuentes en claves frecuentes casi idénticas (errores tipográficos leves).
    const canon: string[] = [];
    for (const [k] of totals) {
      const target = canon.find((c) => k.length > 6 && c.length > 6 && sameDigits(k, c) && similarity(k, c) >= 0.93);
      this.alias.set(k, target ?? k);
      if (!target) canon.push(k);
    }
    const unified: UnifiedVariant[] = [];
    for (const c of canon) {
      const variants = new Map<string, number>();
      for (const [k, target] of this.alias) {
        if (target !== c) continue;
        for (const [text, n] of this.raw.get(k)!) variants.set(text, (variants.get(text) ?? 0) + n);
      }
      const best = clean([...variants.entries()].sort((a, b) => b[1] - a[1])[0]![0]).replace(/[.,;:]+$/, '');
      this.labels.set(c, NAME_FIELDS.has(this.field) ? titleCase(best) : sentenceCase(best));
      const spellings = [...variants.keys()].map((v) => (v.trim() === v ? v : `"${v}"`));
      if (spellings.length > 1) {
        unified.push({
          field: FIELD_LABEL[this.field],
          canonical: this.labels.get(c)!,
          variants: spellings,
          count: [...variants.values()].reduce((a, b) => a + b, 0),
        });
      }
    }
    return unified;
  }

  get(v: Cell): string | null {
    const text = clean(v);
    if (!text) return null;
    const key = this.alias.get(fold(text));
    return key ? this.labels.get(key) ?? null : null;
  }
}

export interface NormalizeResult {
  events: EventRec[];
  companies: CompanyRec[];
  quality: QualityReport;
}

function num(v: Cell): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function digits(v: Cell): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 5 ? d : null;
}

export function normalize(detected: DetectedSheet[], profiles: SheetProfile[], secret: string): NormalizeResult {
  const sheets = detected.filter((d) => d.profile.role === 'events');
  const cats = Object.fromEntries(CAT_FIELDS.map((f) => [f, new CategoryNormalizer(f)])) as Record<CatField, CategoryNormalizer>;

  const get = (d: DetectedSheet, cells: Cell[], role: FieldRole): Cell => {
    const i = d.roleIndex[role];
    return i === undefined ? null : cells[i] ?? null;
  };

  // Pasada 1: vocabulario de cada variable categórica.
  for (const d of sheets) for (const r of d.dataRows) for (const f of CAT_FIELDS) cats[f].add(get(d, r.cells, f));
  const unified: UnifiedVariant[] = CAT_FIELDS.flatMap((f) => cats[f].build());

  // Empresas: por NIT cuando existe; si no, por nombre canónico.
  const companyNames = new Map<string, Map<string, number>>();
  const companyNit = new Map<string, string | null>();
  const companyContracts = new Map<string, Set<string>>();
  const nameKeyToNit = new Map<string, string>();
  for (const d of sheets) for (const r of d.dataRows) {
    const nit = digits(get(d, r.cells, 'companyId'));
    const name = clean(get(d, r.cells, 'company'));
    if (nit && name) nameKeyToNit.set(companyKey(name), nit);
  }

  const resolveCompany = (nameRaw: Cell, nitRaw: Cell): string | null => {
    const name = clean(nameRaw);
    const nit = digits(nitRaw) ?? (name ? nameKeyToNit.get(companyKey(name)) ?? null : null);
    if (!name && !nit) return null;
    const key = nit ? `n${nit}` : `k${companyKey(name)}`;
    const names = companyNames.get(key) ?? new Map<string, number>();
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
    companyNames.set(key, names);
    companyNit.set(key, nit);
    return key;
  };

  const events: EventRec[] = [];
  const seenNo = new Set<string>();
  const seenProbable = new Set<string>();
  let rowsRead = 0;
  let duplicatesRemoved = 0;
  let probableDuplicates = 0;
  let invalidDates = 0;
  let missingCompany = 0;
  let seq = 0;
  const hasMechanism = sheets.some((d) => d.roleIndex.mechanism !== undefined);
  const hasSeverity = sheets.some((d) => d.roleIndex.careLevel !== undefined || d.roleIndex.daysLost !== undefined);

  for (const d of sheets) {
    for (const r of d.dataRows) {
      rowsRead++;
      const c = r.cells;
      const company = resolveCompany(get(d, c, 'company'), get(d, c, 'companyId'));
      if (!company) { missingCompany++; continue; }
      const contract = clean(get(d, c, 'contract'));
      if (contract) {
        const s = companyContracts.get(company) ?? new Set<string>();
        s.add(contract);
        companyContracts.set(company, s);
      }

      let cls: 'AT' | 'EL' = d.profile.eventClass === 'EL' ? 'EL' : 'AT';
      if (d.profile.eventClass === 'mixed') cls = fold(get(d, c, 'eventClass')).includes('enfermedad') ? 'EL' : 'AT';

      const eventNo = clean(get(d, c, 'eventId')) || null;
      if (eventNo) {
        const k = `${cls}|${eventNo}`;
        if (seenNo.has(k)) { duplicatesRemoved++; continue; }
        seenNo.add(k);
      }

      const date = parseDate(get(d, c, 'eventDate'));
      if (!date) invalidDates++;
      const qualDate = parseDate(get(d, c, 'qualificationDate'));

      const wid = fold(get(d, c, 'workerId')) || fold(get(d, c, 'workerName'));
      const worker = wid ? `T-${createHmac('sha256', secret).update(wid).digest('hex').slice(0, 6)}` : null;

      const mechanism = cats.mechanism.get(get(d, c, 'mechanism'));
      const fam = mechFamily(mechanism);
      const careLevel = cats.careLevel.get(get(d, c, 'careLevel'));
      const rank = careRank(careLevel);
      const daysRaw = num(get(d, c, 'daysLost'));
      const daysLost = daysRaw === null ? null : Math.max(0, Math.round(daysRaw));
      const pclRaw = num(get(d, c, 'pcl'));
      const pcl = pclRaw === null ? null : pclRaw > 0 && pclRaw <= 1 && !Number.isInteger(pclRaw) ? pclRaw * 100 : pclRaw;

      if (worker && date) {
        const pk = `${company}|${worker}|${date}`;
        if (seenProbable.has(pk)) probableDuplicates++;
        seenProbable.add(pk);
      }

      const extra: EventRec['extra'] = {};
      for (const f of ['jobTitle', 'bodyPart', 'injuryType', 'area', 'process'] as const) {
        const v = cats[f].get(get(d, c, f));
        if (v) extra[f] = v;
      }
      const t = get(d, c, 'eventTime');
      if (t !== null) extra.eventTime = t instanceof Date ? t.toISOString().slice(11, 16) : clean(t);

      events.push({
        id: `E${String(++seq).padStart(5, '0')}`,
        sheet: d.profile.name,
        row: r.row,
        eventNo,
        cls,
        company,
        date,
        qualDate,
        eventType: cats.eventType.get(get(d, c, 'eventType')),
        mechanism,
        mechGroup: hasMechanism && d.roleIndex.mechanism !== undefined ? fam.key : null,
        daysLost,
        affiliateType: cats.affiliateType.get(get(d, c, 'affiliateType')),
        worker,
        workCenter: cats.workCenter.get(get(d, c, 'workCenter')),
        municipality: cats.municipality.get(get(d, c, 'municipality')),
        careLevel,
        careRank: rank,
        pcl,
        advisor: cats.advisor.get(get(d, c, 'advisor')),
        advisorSecondary: cats.advisorSecondary.get(get(d, c, 'advisorSecondary')),
        contactStatus: cats.contactStatus.get(get(d, c, 'contactStatus')),
        extra,
        severity: severityIndex(rank, daysLost, pcl),
        severe: isSevere(rank, daysLost, pcl),
      });
    }
  }

  // Empresas sin NIT con nombres casi idénticos: se fusionan.
  const keys = [...companyNames.keys()];
  const merge = new Map<string, string>();
  const noNit = keys.filter((k) => k.startsWith('k'));
  for (let i = 0; i < noNit.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = noNit[i]!;
      const b = noNit[j]!;
      if (merge.has(b)) continue;
      if (a.length > 8 && similarity(a.slice(1), b.slice(1)) >= 0.94) { merge.set(a, b); break; }
    }
  }
  if (merge.size) {
    for (const e of events) e.company = merge.get(e.company) ?? e.company;
    for (const [from, to] of merge) {
      const target = companyNames.get(to)!;
      for (const [n, cnt] of companyNames.get(from)!) target.set(n, (target.get(n) ?? 0) + cnt);
      companyNames.delete(from);
      unified.push({ field: 'Empresa', canonical: titleCase([...target.keys()][0]!), variants: [...target.keys()], count: 0 });
    }
  }

  const companies: CompanyRec[] = [...companyNames.entries()].map(([key, names]) => {
    const sorted = [...names.entries()].sort((a, b) => b[1] - a[1]);
    const display = sorted[0]?.[0] ?? (companyNit.get(key) ? `NIT ${companyNit.get(key)}` : key.slice(1));
    const aliases = sorted.map(([n]) => n);
    if (aliases.length > 1 && !merge.size) {
      unified.push({ field: 'Empresa', canonical: titleCase(display), variants: aliases, count: sorted.reduce((a, [, n]) => a + n, 0) });
    }
    return {
      key,
      name: titleCase(display),
      nit: companyNit.get(key) ?? null,
      contracts: [...(companyContracts.get(key) ?? [])],
      aliases,
    };
  });

  /* ── Calidad ── */
  const n = events.length || 1;
  const withDate = events.filter((e) => (e.cls === 'AT' ? e.date : e.date ?? e.qualDate)).length;
  const unknownMechanism = events.filter((e) => !e.mechGroup || e.mechGroup === 'sin-info' || e.mechGroup === 'otro').length;
  const withSeverity = events.filter((e) => e.careRank !== null || e.daysLost !== null).length;
  const complete = events.filter((e) => e.date && e.mechGroup && e.mechGroup !== 'sin-info' && (e.careRank !== null || e.daysLost !== null)).length;
  const checks = [
    { id: 'dates', label: 'Fechas válidas', value: withDate / n, weight: 0.25, detail: `${withDate} de ${events.length} eventos tienen fecha interpretable.` },
    { id: 'company', label: 'Empresas identificadas', value: (rowsRead - missingCompany) / (rowsRead || 1), weight: 0.2, detail: missingCompany ? `${missingCompany} filas sin empresa se descartaron.` : 'Todas las filas tienen empresa.' },
    { id: 'mechanism', label: 'Mecanismo informado', value: hasMechanism ? 1 - unknownMechanism / n : 0, weight: 0.2, detail: hasMechanism ? `${unknownMechanism} eventos con mecanismo "Sin información" u "Otro".` : 'El archivo no trae columna de mecanismo.' },
    { id: 'severity', label: 'Severidad informada', value: hasSeverity ? withSeverity / n : 0, weight: 0.15, detail: hasSeverity ? `${withSeverity} eventos con nivel de atención o días de incapacidad.` : 'El archivo no trae severidad.' },
    { id: 'complete', label: 'Registros completos', value: complete / n, weight: 0.15, detail: `${complete} eventos tienen fecha, mecanismo y severidad a la vez.` },
    { id: 'dupes', label: 'Sin duplicados', value: 1 - duplicatesRemoved / (rowsRead || 1), weight: 0.05, detail: `${duplicatesRemoved} duplicados exactos eliminados, ${probableDuplicates} probables señalados.` },
  ];
  const score = Math.round(checks.reduce((a, c) => a + c.value * c.weight, 0) * 100);

  const warnings: string[] = [];
  for (const p of profiles) {
    if (p.role === 'pivot') warnings.push(`La hoja "${p.name}" es una tabla dinámica y se omitió para no duplicar conteos.`);
    if (p.role === 'unrecognized') warnings.push(`La hoja "${p.name}" no se analizó: ${p.reason}`);
    if (p.skippedRows) warnings.push(`En "${p.name}" se descartaron ${p.skippedRows} filas de notas o vacías.`);
  }
  if (invalidDates) warnings.push(`${invalidDates} eventos sin fecha de ocurrencia válida quedan fuera de las tendencias.`);
  if (unknownMechanism / n > 0.05) warnings.push(`El ${Math.round((unknownMechanism / n) * 100)} % de los eventos no tiene mecanismo útil; los patrones por mecanismo los excluyen.`);
  const elOld = events.filter((e) => e.cls === 'EL' && e.date && e.qualDate && e.date < e.qualDate.slice(0, 4) + '-01-01').length;
  if (elOld) warnings.push(`${elOld} enfermedades laborales ocurrieron años antes de su calificación; para EL se usa la fecha de calificación.`);

  return {
    events,
    companies,
    quality: {
      score,
      checks,
      rowsRead,
      eventsKept: events.length,
      duplicatesRemoved,
      probableDuplicates,
      invalidDates,
      missingCompany,
      unknownMechanism,
      unified: unified.sort((a, b) => b.variants.length - a.variants.length),
      warnings,
    },
  };
}
