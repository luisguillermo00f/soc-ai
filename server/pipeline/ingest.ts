// Data ingestion: convierte el archivo subido en hojas de celdas primitivas.
// No asume columnas: solo entrega filas crudas para que schema.ts las interprete.

import ExcelJS from 'exceljs';

export type Cell = string | number | Date | null;
export interface RawSheet { name: string; rows: Cell[][] }

export class IngestError extends Error {}

const MAX_ROWS = 200_000;
const MAX_COLS = 200;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('') || null;
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text || null;
    if ('error' in v) return null;
  }
  return String(v);
}

async function readXlsx(buf: Buffer): Promise<RawSheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new IngestError('El archivo no se pudo abrir como Excel (.xlsx). Verifica que no esté dañado ni protegido con contraseña.');
  }
  const sheets: RawSheet[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    const lastRow = Math.min(ws.rowCount, MAX_ROWS);
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      const cols = Math.min(row.cellCount, MAX_COLS);
      for (let c = 1; c <= cols; c++) cells.push(cellValue(row.getCell(c).value));
      rows.push(cells);
    }
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

function parseCsv(text: string): Cell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field.trim() === '' ? null : field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim() === '' ? null : field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_ROWS) break;
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field.trim() === '' ? null : field); rows.push(row); }
  return rows;
}

export async function ingest(buf: Buffer, filename: string): Promise<RawSheet[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = buf.toString('utf8').replace(/^﻿/, '');
    return [{ name: filename.replace(/\.csv$/i, ''), rows: parseCsv(text) }];
  }
  if (!/\.(xlsx|xlsm)$/.test(lower)) {
    throw new IngestError('Formato no soportado. Sube un archivo .xlsx, .xlsm o .csv.');
  }
  // Un .xlsx es un ZIP: firma PK\x03\x04.
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new IngestError('El contenido no corresponde a un libro de Excel válido.');
  }
  const sheets = await readXlsx(buf);
  if (!sheets.length) throw new IngestError('El libro no contiene hojas.');
  return sheets;
}
