// Esquemas de salida estructurada (structured outputs). Claude debe responder exactamente con esta forma.

import * as z from 'zod';

const conf = z.enum(['alta', 'media', 'baja']);
const nature = z.enum(['dato', 'patron', 'hallazgo', 'hipotesis', 'recomendacion']);
const factIds = z.array(z.string()).describe('Ids de hechos del paquete de evidencia que sustentan esto, p. ej. ["F3","F12"]');

export const WhatsHappeningSchema = z.object({
  headline: z.string().describe('El hallazgo principal en una oración, con la cifra clave.'),
  summary: z.string().describe('Lectura ejecutiva de 3 a 5 oraciones. Solo cifras del paquete.'),
  findings: z.array(z.object({
    nature,
    title: z.string(),
    body: z.string(),
    confidence: conf,
    evidence: factIds,
  })).describe('Entre 4 y 7 elementos que separen dato, patrón, hallazgo, hipótesis y recomendación.'),
  where: z.string().describe('¿Dónde está pasando? Empresa, centro de trabajo, municipio, según existan.'),
  when: z.string().describe('¿Cuándo? Meses, semestres, días de la semana.'),
  whatRepeats: z.string().describe('¿Qué tipo de evento se repite?'),
  howSevere: z.string().describe('¿Qué tan grave es?'),
  hypotheses: z.array(z.object({
    text: z.string(),
    basis: z.string().describe('En qué evidencia se apoya la hipótesis, citando ids.'),
    validate: z.string().describe('Cómo validarla en campo.'),
    confidence: conf,
  })),
  fieldChecks: z.array(z.string()).describe('Qué debe verificar el profesional SST en la visita.'),
  actions: z.array(z.object({ action: z.string(), why: z.string(), priority: conf })),
  limits: z.string().describe('Qué no se puede concluir con estos datos.'),
});

const planAction = z.object({
  action: z.string(),
  owner: z.string().describe('Responsable sugerido (rol, no nombre de persona).'),
  due: z.string().describe('Plazo sugerido, p. ej. "Próximos 7 días", "Semanas 2 a 6", "Mes 3 a 6".'),
  indicator: z.string(),
});

export const ShockPlanSchema = z.object({
  title: z.string(),
  focus: z.string().describe('Por qué este plan es distinto al de otras empresas: qué lo hace específico.'),
  context: z.string(),
  problems: z.array(z.object({
    problem: z.string(),
    evidence: factIds,
    evidenceText: z.string().describe('Las cifras que justifican intervenir, tomadas del paquete.'),
    objective: z.string(),
    priority: conf,
    immediate: z.array(planAction),
    shortTerm: z.array(planAction),
    structural: z.array(planAction),
    indicator: z.string(),
    target: z.string().describe('Meta cuantificable cuando sea posible (es una meta propuesta, no un dato).'),
    rationale: z.string().describe('Justificación: por qué SOC AI recomienda este enfoque.'),
  })).describe('Entre 1 y 4 problemas, ordenados por prioridad.'),
  followUp: z.string(),
  assumptions: z.array(z.string()),
});

export const ComparisonSchema = z.object({
  conclusion: z.string(),
  differences: z.array(z.object({ aspect: z.string(), detail: z.string(), evidence: factIds })),
  sharedRisks: z.string(),
  recommendation: z.string(),
});

export const ExecutiveSchema = z.object({
  headline: z.string(),
  state: z.string().describe('Estado general de la accidentalidad del portafolio en 3 a 5 oraciones.'),
  priorities: z.array(z.object({ company: z.string(), why: z.string(), evidence: factIds })).describe('Hasta 5 empresas a intervenir primero.'),
  nonObvious: z.array(z.object({ title: z.string(), body: z.string(), nature, evidence: factIds })).describe('Hallazgos no evidentes: relaciones que una persona no vería a simple vista.'),
  actions: z.array(z.object({ action: z.string(), why: z.string(), priority: conf })),
  limits: z.string(),
});
