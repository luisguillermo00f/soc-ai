import type { RiskLevel, Trend } from '@shared/types.ts';

const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const n0 = (x: number | null | undefined) => (x === null || x === undefined ? '–' : nf0.format(x));
export const n1 = (x: number | null | undefined) => (x === null || x === undefined ? '–' : nf1.format(x));
export const pct = (share: number | null | undefined, d = 1) =>
  share === null || share === undefined ? '–' : `${(d ? nf1 : nf0).format(share * 100)} %`;
export const signedPct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${x > 0 ? '+' : ''}${nf1.format(x * 100)} %`);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
export const monthLong = (m: string) => `${MONTHS_LONG[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const dateEs = (iso: string | null | undefined) => {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};
export const dateTimeEs = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export const LEVEL_LABEL: Record<RiskLevel, string> = { critico: 'Crítico', prioritario: 'Prioritario', atencion: 'Atención', controlado: 'Controlado' };
export const LEVEL_BARS: Record<RiskLevel, number> = { critico: 4, prioritario: 3, atencion: 2, controlado: 1 };
export const LEVELS: RiskLevel[] = ['critico', 'prioritario', 'atencion', 'controlado'];

export function trendText(t: Trend): string {
  if (t.direction === 'new') return `nuevo: ${t.recent}`;
  return `${t.previous} → ${t.recent}`;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
