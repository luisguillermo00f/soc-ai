// Configuración del servidor desde variables de entorno (.env en la raíz del proyecto).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const isProd = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

/** Secreto local: si no se definió, se genera una vez y se guarda en data/.secret (fuera del control de versiones). */
function resolveSecret(): string {
  if (process.env.SOC_AI_SECRET) return process.env.SOC_AI_SECRET;
  const dir = path.join(ROOT, 'data');
  const file = path.join(dir, '.secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dir, { recursive: true });
  const s = randomBytes(32).toString('hex');
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export const config = {
  isProd,
  // En la nube (Render) hay que escuchar en 0.0.0.0; en el equipo local, solo en 127.0.0.1.
  host: process.env.HOST?.trim() || (isProd ? '0.0.0.0' : '127.0.0.1'),
  // Detrás del proxy de la nube: confiar en una capa para leer la IP real del visitante.
  behindProxy: process.env.RENDER === 'true' || process.env.BEHIND_PROXY === '1',
  port: Number(process.env.PORT ?? 5230),
  dbPath: path.resolve(ROOT, process.env.SOC_AI_DB ?? 'data/soc-ai.db'),
  secret: resolveSecret(),
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  model: process.env.SOC_AI_MODEL?.trim() || 'claude-opus-5-5',
  geminiKey: process.env.GEMINI_API_KEY?.trim() || '',
  // Se prueban en orden; el plan gratuito a veces responde 503 por demanda y se pasa al siguiente.
  geminiModels: (process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash,gemini-3.5-flash,gemini-flash-latest').split(',').map((s) => s.trim()).filter(Boolean),
  groqKey: process.env.GROQ_API_KEY?.trim() || '',
  groqModel: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
  effort: (process.env.SOC_AI_EFFORT?.trim() || 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
  maxUploadBytes: 25 * 1024 * 1024,
  sessionHours: 12,
  // Modo presentación: entra sin contraseña como el primer administrador. Solo para demos locales.
  openAccess: process.env.SOC_AI_OPEN_ACCESS === '1',
};
