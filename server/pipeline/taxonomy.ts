// Taxonomía SST: agrupa los valores detallados del Excel en familias analizables.
// El valor original se conserva en `mechanism`; la familia vive en `mechGroup`.

import { fold } from '../lib/text.ts';

export interface MechFamily { key: string; label: string; re: RegExp }

// El orden importa: la primera coincidencia gana ("caída de objetos" antes que "caídas").
export const MECH_FAMILIES: MechFamily[] = [
  { key: 'sin-info', label: 'Sin información', re: /^(sin informacion|sin dato|no reporta|n a|na|desconocido)?$/ },
  { key: 'caida-objetos', label: 'Caída de objetos', re: /caida de objetos|caida objeto/ },
  { key: 'caida-altura', label: 'Caídas de altura o a diferente nivel', re: /caida (de )?altura|diferente nivel|caidas? inferiores|caida de altura|desde altura|escalera/ },
  { key: 'caida-nivel', label: 'Caídas a nivel', re: /caidas? a nivel|resbalon|tropiezo|^caidas?$/ },
  { key: 'golpes', label: 'Golpes por o contra objetos', re: /golpe|pisadas|choques|contusion/ },
  { key: 'cortes', label: 'Cortes y objetos cortopunzantes', re: /corto ?punzante|cortante|herramientas u objetos|cortadura/ },
  { key: 'sobreesfuerzo', label: 'Sobreesfuerzo y manipulación de cargas', re: /sobreesfuerzo|manipulacion de cargas|levantamiento/ },
  { key: 'postura', label: 'Postura forzada o movimiento brusco', re: /postura forzada|movimiento brusco|osteomuscular/ },
  { key: 'transito', label: 'Accidentes de tránsito', re: /transito|vehicul|moto/ },
  { key: 'biologico', label: 'Riesgo biológico', re: /biologic|microorganismo|aguja|fluido/ },
  { key: 'seres-vivos', label: 'Animales y seres vivos', re: /seres vivos|macroorganismo|mordedura|picadura|animal/ },
  { key: 'quimico', label: 'Sustancias químicas', re: /quimic/ },
  { key: 'temperatura', label: 'Temperaturas extremas', re: /temperatura|quemadura/ },
  { key: 'electrico', label: 'Contacto eléctrico', re: /electric/ },
  { key: 'atrapamiento', label: 'Atrapamiento', re: /atrapamiento|aplastamiento/ },
  { key: 'particulas', label: 'Proyección de partículas', re: /proyeccion de particulas|particula/ },
  { key: 'sofocamiento', label: 'Sofocamiento mecánico', re: /sofocamiento/ },
  { key: 'radiacion', label: 'Radiaciones', re: /radiacion/ },
  { key: 'violencia', label: 'Violencia', re: /violencia|agresion|atraco|hurto/ },
  { key: 'deportivo', label: 'Actividad recreativa o deportiva', re: /recreativ|deportiv|cultural/ },
  { key: 'otro', label: 'Otro', re: /^otros?$/ },
];

export function mechFamily(raw: string | null): MechFamily {
  const f = fold(raw ?? '');
  for (const fam of MECH_FAMILIES) if (fam.re.test(f)) return fam;
  return { key: `x-${f.replace(/\s+/g, '-').slice(0, 40)}`, label: raw ?? 'Sin información', re: /$^/ };
}

export const MECH_LABEL = new Map(MECH_FAMILIES.map((f) => [f.key, f.label]));

/** Nivel de atención médica → rango ordinal de severidad (1 leve … 5 crítico). */
export function careRank(raw: string | null): number | null {
  const f = fold(raw ?? '');
  if (!f) return null;
  if (/mortal|fallec|muerte/.test(f)) return 5;
  if (/cuidados intensivos|uci/.test(f)) return 5;
  if (/quirurgico hospitalario|hospitalari/.test(f)) return 4;
  if (/quirurgico/.test(f)) return 3;
  if (/ambulatori|urgencia/.test(f)) return 2;
  if (/alta inmediata|odontolog|primeros auxilios/.test(f)) return 1;
  return null;
}

export const CARE_RANK_LABEL: Record<number, string> = {
  1: 'Leve',
  2: 'Moderado',
  3: 'Quirúrgico',
  4: 'Hospitalario',
  5: 'Crítico',
};

/**
 * Índice de severidad 0..100 de un evento. Documentado en Ajustes > Metodología:
 * toma el mayor entre la severidad por nivel de atención y por días de incapacidad,
 * y lo eleva si hay pérdida de capacidad laboral calificada.
 */
export function severityIndex(rank: number | null, days: number | null, pcl: number | null): number {
  const byCare = rank ? [0, 5, 15, 45, 65, 90][rank]! : 0;
  const d = days ?? 0;
  const byDays = d <= 0 ? 0 : d <= 3 ? 10 : d <= 10 ? 20 : d <= 30 ? 35 : d <= 90 ? 60 : d <= 180 ? 75 : 85;
  let s = Math.max(byCare, byDays);
  if (pcl && pcl > 0) s = Math.max(s, 70 + Math.min(pcl, 30));
  return s;
}

/** Evento grave: quirúrgico, hospitalización, UCI, ≥ 30 días de incapacidad o PCL > 0. */
export function isSevere(rank: number | null, days: number | null, pcl: number | null): boolean {
  return (rank ?? 0) >= 3 || (days ?? 0) >= 30 || (pcl ?? 0) > 0;
}

/** Estados de gestión SOC que indican que la intervención sí ocurrió. */
export function contactDone(status: string | null): boolean {
  return /cita ejecutada|ejecutad|realizad|atendid/.test(fold(status ?? ''));
}
