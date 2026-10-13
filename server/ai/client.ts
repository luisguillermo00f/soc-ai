// Cliente de Anthropic. La clave vive solo en el servidor; el navegador nunca la ve.

import Anthropic from '@anthropic-ai/sdk';
import type { AiEngine, AiStatus } from '../../shared/types.ts';
import { config } from '../config.ts';
import { geminiAvailable } from './providers.ts';

let client: Anthropic | null = null;

export function claude(): Anthropic | null {
  if (!config.anthropicKey) return null;
  client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

/** Motor activo, en orden de preferencia: Claude (si hay clave) → Groq gratuito → motor de reglas. */
export function activeEngine(): AiEngine {
  if (config.anthropicKey) return 'claude';
  if (config.geminiKey) return 'gemini';
  if (config.groqKey) return 'groq';
  return 'reglas';
}

/** Cadena de motores generativos disponibles, en orden de preferencia. */
export function engineChain(): Exclude<AiEngine, 'reglas'>[] {
  const out: Exclude<AiEngine, 'reglas'>[] = [];
  if (config.anthropicKey) out.push('claude');
  if (config.geminiKey && geminiAvailable()) out.push('gemini');
  if (config.groqKey) out.push('groq');
  return out;
}

export function aiStatus(): AiStatus {
  const engine = activeEngine();
  if (engine === 'claude') {
    return { enabled: true, engine, provider: 'Anthropic', model: config.model, effort: config.effort, reason: 'Razonamiento con Claude activo.' };
  }
  if (engine === 'gemini') {
    return {
      enabled: true, engine, provider: `Google Gemini (plan gratuito)${config.groqKey ? ' con respaldo en Groq' : ''}`, model: config.geminiModels[0]!, effort: 'medium',
      reason: `Razonamiento con ${config.geminiModels[0]} sin costo. Si Gemini está saturado, la solicitud pasa automáticamente a ${config.geminiModels.slice(1).join(', ') || 'otro modelo'}${config.groqKey ? ` y luego a ${config.groqModel} en Groq` : ''}; cada resultado indica qué modelo lo produjo.`,
    };
  }
  if (engine === 'groq') {
    return {
      enabled: true, engine, provider: 'Groq (plan gratuito)', model: config.groqModel, effort: 'low',
      reason: 'Razonamiento con un modelo abierto en Groq, sin costo. El plan gratuito limita a unos 8.000 tokens por minuto: los análisis usan evidencia compacta y pueden esperar unos segundos si se piden varios seguidos.',
    };
  }
  return {
    enabled: false, engine, provider: 'Local', model: 'reglas', effort: '-',
    reason: 'Sin clave de IA en el servidor (ANTHROPIC_API_KEY o GROQ_API_KEY). Los análisis usan el motor de reglas SOC AI (estadística completa y biblioteca SST), sin redacción generativa.',
  };
}

/** Error de IA con mensaje apto para mostrar al usuario. */
export class AiError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function describeApiError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) return new AiError('La clave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY en el servidor.', 503);
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError('La clave de Anthropic no tiene permiso para este modelo.', 503);
  if (err instanceof Anthropic.NotFoundError) return new AiError(`El modelo ${config.model} no está disponible para esta cuenta.`, 503);
  if (err instanceof Anthropic.RateLimitError) return new AiError('Se alcanzó el límite de uso de la API. Intenta de nuevo en un minuto.', 429);
  if (err instanceof Anthropic.BadRequestError) return new AiError(`La solicitud a Claude fue rechazada: ${err.message}`, 502);
  if (err instanceof Anthropic.APIConnectionError) return new AiError('No hay conexión con la API de Anthropic.', 503);
  if (err instanceof Anthropic.APIError) return new AiError(`Error de la API de Anthropic (${err.status ?? 's/c'}).`, 502);
  if (err instanceof AiError) return err;
  return new AiError(err instanceof Error ? err.message : 'Error desconocido al consultar la IA.', 500);
}
