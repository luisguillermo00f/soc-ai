// Autenticación y autorización.
// - Contraseñas con scrypt y sal por usuario; comparación en tiempo constante.
// - Sesión opaca en cookie httpOnly/SameSite=Lax; en la base solo se guarda el hash del token.
// - Roles: admin (todo), analista (importar, generar análisis), lector (solo consulta).
// - Protección CSRF: toda petición que modifica exige el encabezado X-SOC-AI (no enviable entre sitios sin CORS).

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role, SessionUser } from '../shared/types.ts';
import { audit, db } from './db.ts';
import { config } from './config.ts';

const COOKIE = 'socai_session';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

export function validatePassword(p: string): string | null {
  if (p.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'La contraseña debe combinar letras y números.';
  return null;
}

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function createUser(email: string, name: string, role: Role, password: string): SessionUser {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, name, role, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, email.toLowerCase().trim(), name.trim(), role, hashPassword(password), new Date().toISOString(),
  );
  return { id, email: email.toLowerCase().trim(), name: name.trim(), role };
}

const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export function startSession(res: Response, user: SessionUser) {
  const token = randomBytes(32).toString('base64url');
  const expires = Date.now() + config.sessionHours * 3600_000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    tokenHash(token), user.id, expires, new Date().toISOString(),
  );
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: config.sessionHours * 3600_000, path: '/' });
}

export function endSession(req: Request, res: Response) {
  const token = readCookie(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionUser(req: Request): SessionUser | null {
  const token = readCookie(req);
  if (!token) return config.openAccess ? presentationUser() : null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND u.disabled = 0`).get(tokenHash(token)) as (SessionUser & { expires_at: number }) | undefined;
  if (!row || row.expires_at < Date.now()) return config.openAccess ? presentationUser() : null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

declare module 'express-serve-static-core' {
  interface Request { user?: SessionUser }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) { res.status(401).json({ error: 'Tu sesión expiró. Vuelve a ingresar.' }); return; }
  req.user = user;
  next();
}

const RANK: Record<Role, number> = { lector: 0, analista: 1, admin: 2 };

export function requireRole(min: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || RANK[req.user.role] < RANK[min]) {
      res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción.' });
      return;
    }
    next();
  };
}

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { next(); return; }
  if (req.headers['x-soc-ai'] !== '1') { res.status(403).json({ error: 'Solicitud rechazada (falta el encabezado de seguridad).' }); return; }
  next();
}

/* Límite de intentos de ingreso por IP: 10 cada 15 minutos. */
const attempts = new Map<string, { n: number; until: number }>();
export function loginLimited(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.until < now) return false;
  return a.n >= 10;
}
export function loginFailed(ip: string) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.until < now) attempts.set(ip, { n: 1, until: now + 15 * 60_000 });
  else a.n++;
}
export function loginOk(ip: string) { attempts.delete(ip); }

export function login(email: string, password: string): SessionUser | null {
  const row = db.prepare('SELECT id, email, name, role, pass_hash, disabled FROM users WHERE email = ?').get(email.toLowerCase().trim()) as
    (SessionUser & { pass_hash: string; disabled: number }) | undefined;
  if (!row || row.disabled) {
    hashPassword(password); // tiempo similar exista o no el usuario
    return null;
  }
  if (!verifyPassword(password, row.pass_hash)) return null;
  audit(row.id, 'login');
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function purgeSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

/** Usuario de modo presentación: el primer administrador activo. */
export function presentationUser(): SessionUser | null {
  const row = db.prepare("SELECT id, email, name, role FROM users WHERE role = 'admin' AND disabled = 0 ORDER BY created_at LIMIT 1").get() as SessionUser | undefined;
  return row ?? null;
}

/**
 * En un sitio público la pantalla de "configura el administrador" sería un riesgo (el primero que entre lo crea).
 * Si ADMIN_EMAIL y ADMIN_PASSWORD están definidos y no hay usuarios, se crea el administrador al arrancar.
 */
export function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !password || userCount() > 0) return;
  const err = validatePassword(password);
  if (err) { console.error(`ADMIN_PASSWORD no válida: ${err}`); return; }
  createUser(email, process.env.ADMIN_NAME?.trim() || 'Equipo SOC', 'admin', password);
  console.log(`Administrador inicial creado: ${email}`);
}
