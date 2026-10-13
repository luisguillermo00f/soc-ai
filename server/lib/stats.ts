// Estadística mínima y exacta para conteos de accidentes.
// Los conteos son pequeños, así que usamos pruebas exactas (Poisson, binomial) en lugar de aproximaciones normales.

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

const LF_CACHE: number[] = [0, 0];
function lf(n: number): number {
  if (n < LF_CACHE.length) return LF_CACHE[n]!;
  for (let i = LF_CACHE.length; i <= n; i++) LF_CACHE[i] = LF_CACHE[i - 1]! + Math.log(i);
  return LF_CACHE[n]!;
}

/** P(X >= k) con X ~ Poisson(lambda). */
export function poissonUpper(k: number, lambda: number): number {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  let cdf = 0;
  for (let i = 0; i < k; i++) cdf += Math.exp(-lambda + i * Math.log(lambda) - lf(i));
  return Math.max(0, Math.min(1, 1 - cdf));
}

/** P(X <= k) con X ~ Poisson(lambda). */
export function poissonLower(k: number, lambda: number): number {
  if (lambda <= 0) return 1;
  let cdf = 0;
  for (let i = 0; i <= k; i++) cdf += Math.exp(-lambda + i * Math.log(lambda) - lf(i));
  return Math.min(1, cdf);
}

function binomPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lf(n) - lf(k) - lf(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** P(X >= k) con X ~ Binomial(n, p). */
export function binomUpper(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i <= n; i++) s += binomPmf(i, n, p);
  return Math.min(1, s);
}

/** Prueba binomial exacta bilateral. */
export function binomTwoSided(k: number, n: number, p: number): number {
  if (n === 0) return 1;
  const observed = binomPmf(k, n, p);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const q = binomPmf(i, n, p);
    if (q <= observed * (1 + 1e-7)) s += q;
  }
  return Math.min(1, s);
}

/**
 * Compara dos conteos de igual exposición (p. ej. 6 meses vs 6 meses).
 * Condicionado al total, a ~ Binomial(a+b, 0.5) bajo H0 de tasa constante.
 */
export function rateChangeP(a: number, b: number): number {
  return binomTwoSided(a, a + b, 0.5);
}

/** Benjamini-Hochberg: devuelve q-valores en el mismo orden. */
export function benjaminiHochberg(ps: number[]): number[] {
  const n = ps.length;
  const idx = ps.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]);
  const q = new Array<number>(n);
  let prev = 1;
  for (let r = n - 1; r >= 0; r--) {
    const [p, i] = idx[r]!;
    const val = Math.min(prev, (p * n) / (r + 1));
    q[i] = val;
    prev = val;
  }
  return q;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Percentil (0..1) de x dentro de una muestra. */
export function percentileRank(sortedAsc: number[], x: number): number {
  if (!sortedAsc.length) return 0;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid]! <= x) lo = mid + 1; else hi = mid;
  }
  return lo / sortedAsc.length;
}

export function round(x: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

export { logFactorial };
