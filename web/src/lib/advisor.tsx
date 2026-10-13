// Filtro por asesor SOC, compartido entre páginas (Empresas, Críticas, Planes, Comparar año a año).
// El valor distingue el rol: "a:Nombre" = asesor asignado, "p:Nombre" = asesor APA.

import { useCallback, useEffect, useState } from 'react';
import type { CompanySummary } from '@shared/types.ts';
import { useFacets } from './queries.ts';

const KEY = 'socai.advisor';
const EVENT = 'socai:advisor';

function read(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function useAdvisor(): [string, (v: string) => void] {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const set = useCallback((v: string) => {
    try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
    setValue(v);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [value, set];
}

export function matchAdvisor(s: CompanySummary, value: string): boolean {
  if (!value) return true;
  const name = value.slice(2);
  return value.startsWith('p:') ? s.apaAdvisors.includes(name) : s.advisors.includes(name);
}

export function advisorLabel(value: string): string {
  if (!value) return '';
  return `${value.slice(2)} (${value.startsWith('p:') ? 'asesor APA' : 'asesor asignado'})`;
}

export function AdvisorSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const facets = useFacets();
  const assigned = facets.data?.facets.advisor ?? [];
  const apa = facets.data?.facets.advisorSecondary ?? [];
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar por asesor" style={value ? { borderColor: 'var(--ink)', fontWeight: 550 } : undefined}>
      <option value="">Todos los asesores</option>
      {assigned.length > 0 && (
        <optgroup label="Asesor asignado">
          {assigned.map((d) => <option key={`a${d.key}`} value={`a:${d.key}`}>{d.label} ({d.count})</option>)}
        </optgroup>
      )}
      {apa.length > 0 && (
        <optgroup label="Asesor APA">
          {apa.map((d) => <option key={`p${d.key}`} value={`p:${d.key}`}>{d.label} ({d.count})</option>)}
        </optgroup>
      )}
    </select>
  );
}
