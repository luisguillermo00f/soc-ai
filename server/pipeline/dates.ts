// Normalización de fechas tolerante a los formatos que aparecen en bases de ARL:
// enteros yyyymmdd, seriales de Excel, objetos Date y textos dd/mm/aaaa o aaaa-mm-dd.

import type { Cell } from './ingest.ts';

const MIN_YEAR = 1990;

function iso(y: number, m: number, d: number): string | null {
  if (y < MIN_YEAR || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Convierte una celda a fecha ISO (yyyy-mm-dd) o null.
 * `allowSerial` acepta seriales de Excel (solo cuando la columna ya se sabe que es de fecha).
 */
export function parseDate(v: Cell, allowSerial = true): string | null {
  if (v === null || v === '') return null;
  if (v instanceof Date) {
    return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 19000101 && v <= 21001231) {
      return iso(Math.floor(v / 10000), Math.floor((v % 10000) / 100), v % 100);
    }
    if (allowSerial && v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  // En Colombia el orden es día/mes/año.
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += 2000;
    return iso(y, +m[2]!, +m[1]!);
  }
  return null;
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function lastDayOfMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function monthLabel(month: string, long = false): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${(long ? MONTHS_LONG : MONTHS_ES)[m - 1]} ${y}`;
}

export function weekday(isoDate: string): number {
  // 0 = lunes … 6 = domingo
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
