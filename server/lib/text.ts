// Normalización de texto: claves de comparación, similitud y presentación.

/** Minúsculas, sin tildes, sin puntuación, espacios colapsados. Para comparar. */
export function fold(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-./,;:()"'´`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Recorta y colapsa espacios conservando el texto original. */
export function clean(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

const LEGAL_SUFFIX = /\b(s a s|sas|s a|sa|ltda|limitada|e u|eu|e s p|esp|s en c|sociedad por acciones simplificada|y cia|cia|s c a|sca|e s e|zf)\b/g;

/** Clave canónica para nombres de empresa: ignora sufijos societarios y puntuación. */
export function companyKey(name: string): string {
  const f = fold(name).replace(/\./g, ' ');
  const stripped = f.replace(LEGAL_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
  return stripped || f;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre bigramas (0..1). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) { total += n; inter += Math.min(n, B.get(g) ?? 0); }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

const ACRONYMS = new Set([
  'sas', 'ltda', 'eu', 'esp', 'arl', 'uci', 'sst', 'ese', 'ips', 'eps', 'ci', 'nit',
  'pcl', 'sa', 'pesv', 'apa', 'soc', 'sura', 'ii', 'iii', 'iv', 'tsa', 'srl',
]);
const LOWER_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'por', 'con', 'para', 'sin']);

/** Caja de título para nombres propios (empresas, municipios, personas). */
export function titleCase(s: string): string {
  const words = clean(s).toLowerCase().split(' ');
  return words.map((w, i) => {
    const bare = w.replace(/[^a-z0-9ñáéíóú.]/gi, '');
    const plain = bare.replace(/\./g, '');
    if (i > 0 && LOWER_WORDS.has(w)) return w;
    if (ACRONYMS.has(plain)) return w.toUpperCase();
    if (/^(s\.a\.s\.?|s\.a\.?|e\.u\.?|c\.i\.?|e\.s\.p\.?|ltda\.?)$/i.test(bare)) return w.toUpperCase();
    if (/^\d/.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/** Caja de oración para categorías ("CAIDAS A NIVEL" → "Caídas a nivel"). Conserva siglas. */
export function sentenceCase(s: string): string {
  const t = clean(s).toLowerCase();
  const out = t.split(' ').map((w) => (ACRONYMS.has(w.replace(/[^a-z]/g, '')) && w.length <= 4 ? w.toUpperCase() : w)).join(' ');
  return restoreAccents(out.charAt(0).toUpperCase() + out.slice(1));
}

// Tildes frecuentes que el sistema de la ARL entrega sin acento.
const ACCENTS: [RegExp, string][] = [
  [/\bcaidas\b/g, 'caídas'], [/\bcaida\b/g, 'caída'], [/\bCaidas\b/g, 'Caídas'], [/\bCaida\b/g, 'Caída'],
  [/\bresbalon\b/g, 'resbalón'], [/\bmuscular\b/g, 'muscular'], [/\bmanipulacion\b/g, 'manipulación'],
  [/\bproyeccion\b/g, 'proyección'], [/\bpart[ií]culas\b/g, 'partículas'], [/\bbiologico\b/g, 'biológico'],
  [/\bBiologico\b/g, 'Biológico'], [/\bmecanico\b/g, 'mecánico'], [/\bquimicas\b/g, 'químicas'],
  [/\btransito\b/g, 'tránsito'], [/\bTransito\b/g, 'Tránsito'], [/\blesion\b/g, 'lesión'], [/\bLesion\b/g, 'Lesión'],
  [/\binformacion\b/g, 'información'], [/\bInformacion\b/g, 'Información'], [/\bquirurgico\b/g, 'quirúrgico'],
  [/\bQuirurgico\b/g, 'Quirúrgico'], [/\bodontologia\b/g, 'odontología'], [/\bOdontologia\b/g, 'Odontología'],
  [/\bunidad de cuidados intensivos\b/gi, 'Unidad de cuidados intensivos'], [/\bexposicion\b/g, 'exposición'],
  [/\bExposicion\b/g, 'Exposición'], [/\belectricidad\b/g, 'electricidad'], [/\benergia\b/g, 'energía'],
  [/\belectrica\b/g, 'eléctrica'], [/\bradiacion(es)?\b/g, 'radiación$1'], [/\bionizantes\b/g, 'ionizantes'],
  [/\btelefono\b/g, 'teléfono'], [/\bTelefono\b/g, 'Teléfono'], [/\bgestion\b/g, 'gestión'],
  [/\bcorto punzantes\b/g, 'cortopunzantes'], [/\bfrio\b/g, 'frío'], [/\bcalor o frio\b/g, 'calor o frío'],
  [/\bdeportivo\b/g, 'deportivo'], [/\bhospitalario\b/g, 'hospitalario'], [/\bunico\b/g, 'único'],
  [/\bmts\b/g, 'm'], [/\bsofocamiento\b/g, 'sofocamiento'],
];

function restoreAccents(s: string): string {
  let out = s;
  for (const [re, rep] of ACCENTS) out = out.replace(re, rep);
  return out;
}

/** Formato numérico colombiano: 1.234,5 */
export function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(share: number, decimals = 1): string {
  return `${fmtNum(share * 100, decimals)} %`;
}
