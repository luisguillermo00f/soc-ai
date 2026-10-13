// Verificación local (sin red): los esquemas Zod se convierten a JSON Schema válido para structured outputs.
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ComparisonSchema, ExecutiveSchema, ShockPlanSchema, WhatsHappeningSchema } from '../server/ai/schemas.ts';
import { TOOL_DEFS } from '../server/ai/tools.ts';
import { SYSTEM_ANALYST } from '../server/ai/prompts.ts';
for (const [name, s] of Object.entries({ WhatsHappeningSchema, ShockPlanSchema, ComparisonSchema, ExecutiveSchema })) {
  const f = betaZodOutputFormat(s) as { type: string; schema: Record<string, unknown> };
  const json = JSON.stringify(f.schema);
  const objs = (json.match(/"type":"object"/g) ?? []).length;
  const closed = (json.match(/"additionalProperties":false/g) ?? []).length;
  console.log(name, f.type, `${json.length} bytes`, `objetos=${objs}`, `cerrados=${closed}`, /minimum|maximum|minLength|maxLength/.test(json) ? 'RESTRICCIONES NO SOPORTADAS' : 'ok');
}
console.log('herramientas', TOOL_DEFS.length, TOOL_DEFS.every((t) => (t.input_schema as { additionalProperties?: boolean }).additionalProperties === false) ? 'ok' : 'revisar');
console.log('system prompt', SYSTEM_ANALYST.length, 'caracteres');
