// Puntaje de riesgo explicable (0–100) por empresa.
// Cada factor produce un valor 0..1 con su razón en texto; los puntos = peso × valor.
// Pesos y umbrales son configurables (Ajustes) y están documentados en la vista de Metodología.

import type { CompanyScore, EventRec, PeriodInfo, RiskLevel, ScoreFactor, ScoringConfig, Trend } from '../../shared/types.ts';
import { clamp01 } from '../lib/stats.ts';
import { fmtNum, fmtPct } from '../lib/text.ts';
import { daysBetween } from '../pipeline/dates.ts';
import { informativeMech, mechLabel } from './base.ts';

export const DEFAULT_SCORING: ScoringConfig = {
  weights: { frecuencia: 25, tendencia: 20, recurrencia: 20, severidad: 20, reincidencia: 10, recencia: 5 },
  thresholds: { critico: 70, prioritario: 50, atencion: 30 },
  minEvidence: 3,
};

export const FACTOR_DOCS: { id: string; label: string; doc: string }[] = [
  { id: 'frecuencia', label: 'Frecuencia', doc: 'Accidentes de trabajo de la empresa en todo el período, en escala logarítmica respecto al percentil 95 del portafolio (una empresa en el p95 o más obtiene el valor completo).' },
  { id: 'tendencia', label: 'Tendencia reciente', doc: 'Cambio entre los últimos 6 meses completos y los 6 anteriores. Un aumento del 100 % o más da el valor completo; si la prueba binomial exacta no es significativa (p ≥ 0,05) se pondera a la mitad. Una empresa sin antecedentes con 3 o más eventos recientes recibe 0,8. Un pico mensual anómalo en los últimos 3 meses suma 0,3.' },
  { id: 'recurrencia', label: 'Recurrencia y concentración', doc: 'Cuántas veces se repite el mecanismo principal (6 repeticiones = valor completo), ponderado por su participación en la empresa, más 0,15 por cada racha (≥ 3 eventos del mismo mecanismo en 60 días).' },
  { id: 'severidad', label: 'Severidad', doc: 'Eventos graves (quirúrgicos, hospitalarios, UCI, ≥ 30 días o PCL > 0; 3 = valor completo, peso 45 %), días de incapacidad por evento frente a 3 veces la media del portafolio (35 %) y presencia de atención hospitalaria, UCI o PCL (20 %). Una enfermedad laboral calificada suma 0,2.' },
  { id: 'reincidencia', label: 'Trabajadores reincidentes', doc: 'Trabajadores (seudonimizados) con dos o más accidentes en la empresa; 3 trabajadores = valor completo.' },
  { id: 'recencia', label: 'Actividad reciente', doc: 'Accidentes en los últimos 90 días del corte de datos; 4 eventos = valor completo.' },
];

export interface ScoreInput {
  at: EventRec[];
  el: number;
  trend: Trend;
  recentSpike: boolean;
  clusters: number;
  repeatWorkers: number;
  period: PeriodInfo;
  pRef: number;                // p95 de eventos por empresa
  globalDaysPerEvent: number;
}

export function levelFor(score: number, cfg: ScoringConfig): RiskLevel {
  if (score >= cfg.thresholds.critico) return 'critico';
  if (score >= cfg.thresholds.prioritario) return 'prioritario';
  if (score >= cfg.thresholds.atencion) return 'atencion';
  return 'controlado';
}

export function scoreCompany(input: ScoreInput, cfg: ScoringConfig): CompanyScore {
  const { at, trend } = input;
  const n = at.length;
  const W = cfg.weights;
  // Los pesos se normalizan a 100 para que los puntos de las razones sumen exactamente el puntaje.
  const total = Object.values(W).reduce((a, b) => a + b, 0) || 100;
  const factors: ScoreFactor[] = [];
  const push = (id: string, label: string, value: number, reason: string) => {
    const weight = Math.round(((W[id] ?? 0) * 100) / total);
    factors.push({ id, label, weight, value: clamp01(value), points: Math.round(weight * clamp01(value)), reason });
  };

  // Frecuencia
  const fFreq = n ? Math.log(1 + n) / Math.log(1 + Math.max(10, input.pRef)) : 0;
  push('frecuencia', 'Frecuencia', fFreq, `${n} accidente${n === 1 ? '' : 's'} de trabajo en el período`);

  // Tendencia
  let fTrend = 0;
  let trendReason = 'Sin aumento entre semestres';
  if (trend.direction === 'new' && trend.recent >= 3) {
    fTrend = 0.8;
    trendReason = `${trend.recent} eventos en los últimos 6 meses sin antecedentes en los 6 anteriores`;
  } else if (trend.change !== null && trend.change > 0 && trend.recent >= 2) {
    fTrend = clamp01(trend.change) * (trend.significant ? 1 : 0.5);
    trendReason = `De ${trend.previous} a ${trend.recent} eventos entre semestres (${trend.change > 0 ? '+' : ''}${fmtPct(trend.change, 0)}${trend.significant ? ', significativo' : ', no significativo'})`;
  } else if (trend.direction === 'down') {
    trendReason = `Bajó de ${trend.previous} a ${trend.recent} eventos entre semestres`;
  }
  if (input.recentSpike) {
    fTrend = clamp01(fTrend + 0.3);
    trendReason += '; pico mensual anómalo en los últimos 3 meses';
  }
  push('tendencia', 'Tendencia reciente', fTrend, trendReason);

  // Recurrencia
  const mechCount = new Map<string, number>();
  for (const e of at) if (informativeMech(e.mechGroup)) mechCount.set(e.mechGroup, (mechCount.get(e.mechGroup) ?? 0) + 1);
  const top = [...mechCount.entries()].sort((a, b) => b[1] - a[1])[0];
  let fRec = 0;
  let recReason = 'Sin mecanismo repetido';
  if (top && top[1] >= 2) {
    const share = top[1] / n;
    fRec = clamp01((top[1] - 1) / 6) * (0.5 + 0.5 * share) + 0.15 * input.clusters;
    recReason = `${top[1]} eventos de ${mechLabel(top[0]).toLowerCase()} (${fmtPct(share, 0)} de la empresa)`;
    if (input.clusters) recReason += `; ${input.clusters} racha${input.clusters > 1 ? 's' : ''} en 60 días`;
  }
  push('recurrencia', 'Recurrencia y concentración', fRec, recReason);

  // Severidad
  const severe = at.filter((e) => e.severe).length;
  const days = at.reduce((a, e) => a + (e.daysLost ?? 0), 0);
  const dpe = n ? days / n : 0;
  const hardCase = at.some((e) => (e.careRank ?? 0) >= 4 || (e.pcl ?? 0) > 0);
  let fSev = 0.45 * clamp01(severe / 3) + 0.35 * clamp01(dpe / (3 * Math.max(1, input.globalDaysPerEvent))) + (hardCase ? 0.2 : 0);
  const sevParts = [`${severe} evento${severe === 1 ? '' : 's'} grave${severe === 1 ? '' : 's'}`, `${fmtNum(dpe, 1)} días de incapacidad por evento (portafolio: ${fmtNum(input.globalDaysPerEvent, 1)})`];
  if (hardCase) sevParts.push('incluye hospitalización, UCI o PCL');
  if (input.el) { fSev += 0.2; sevParts.push(`${input.el} enfermedad${input.el > 1 ? 'es' : ''} laboral${input.el > 1 ? 'es' : ''} calificada${input.el > 1 ? 's' : ''}`); }
  push('severidad', 'Severidad', fSev, sevParts.join('; '));

  // Reincidencia
  push('reincidencia', 'Trabajadores reincidentes', input.repeatWorkers / 3,
    input.repeatWorkers ? `${input.repeatWorkers} trabajador${input.repeatWorkers > 1 ? 'es' : ''} con 2 o más accidentes` : 'Ningún trabajador repite accidente');

  // Recencia
  const end = input.period.dataEnd;
  const last90 = end ? at.filter((e) => e.date && daysBetween(e.date, end) <= 90).length : 0;
  push('recencia', 'Actividad reciente', last90 / 4, `${last90} accidente${last90 === 1 ? '' : 's'} en los últimos 90 días`);

  let score = Math.min(100, factors.reduce((a, f) => a + f.points, 0));

  const caps: string[] = [];
  if (n < cfg.minEvidence) {
    const cap = severe ? cfg.thresholds.critico - 1 : cfg.thresholds.prioritario - 1;
    if (score > cap) {
      score = cap;
      caps.push(`Con menos de ${cfg.minEvidence} accidentes la evidencia es insuficiente para ${severe ? 'un nivel crítico' : 'un nivel prioritario'}; el puntaje se limita a ${cap}.`);
    }
  }
  return { score, level: levelFor(score, cfg), factors: factors.sort((a, b) => b.points - a.points), caps };
}
