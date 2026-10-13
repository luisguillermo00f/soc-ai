// Persistencia en SQLite embebido (node:sqlite, sin dependencias nativas).
// Los eventos normalizados se guardan cifrados con AES-256-GCM: aunque ya están seudonimizados,
// siguen siendo información sensible de salud laboral de empresas cliente.

import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','analista','lector')),
    pass_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL,
    sheets_json TEXT NOT NULL,
    quality_json TEXT NOT NULL,
    payload BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_outputs (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    engine TEXT NOT NULL,
    content_json TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT
  );
  CREATE INDEX IF NOT EXISTS ai_outputs_lookup ON ai_outputs(dataset_id, kind, subject, created_at);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    detail TEXT
  );
`);

const KEY = createHash('sha256').update(`soc-ai:payload:${config.secret}`).digest();

export function seal(data: unknown): Uint8Array {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function unseal<T>(blob: Uint8Array): T {
  const buf = Buffer.from(blob);
  const decipher = createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const dec = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}

export function audit(userId: string | null, action: string, detail?: unknown) {
  db.prepare('INSERT INTO audit (at, user_id, action, detail) VALUES (?, ?, ?, ?)').run(
    new Date().toISOString(), userId, action, detail === undefined ? null : JSON.stringify(detail),
  );
}

export function getSetting<T>(key: string): T | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setSetting(key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}
