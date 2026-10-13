import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { EventFilter, EventsPage } from '@shared/types.ts';
import { send } from '../lib/api.ts';
import { useFacets } from '../lib/queries.ts';
import { n0, pct } from '../lib/format.ts';
import { EventsTable } from '../components/EventsTable.tsx';
import { BarList } from '../components/charts.tsx';
import { ErrorState, PageSkeleton } from '../components/ui.tsx';

const STORE = 'socai.accidents.filter';

function readInitial(params: URLSearchParams): EventFilter {
  const f = params.get('f');
  if (f) { try { return JSON.parse(f); } catch { /* filtro inválido en la URL */ } }
  try { return JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { return {}; }
}

export function Accidents() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<EventFilter>(() => readInitial(params));
  const facets = useFacets();

  useEffect(() => {
    const clean = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== '' && v !== false));
    try { localStorage.setItem(STORE, JSON.stringify(clean)); } catch { /* almacenamiento no disponible */ }
    setParams(Object.keys(clean).length ? { f: JSON.stringify(clean) } : {}, { replace: true });
  }, [filter, setParams]);

  const summary = useQuery({
    queryKey: ['events-summary', filter],
    queryFn: () => send<EventsPage>('POST', '/events/query', { filter, offset: 0, limit: 1 }),
    placeholderData: keepPreviousData,
  });

  const set = (k: keyof EventFilter, v: string | boolean | undefined) => setFilter((f) => ({ ...f, [k]: v === '' ? undefined : v }));
  const active = useMemo(() => Object.entries(filter).filter(([, v]) => v !== undefined && v !== '' && v !== false).length, [filter]);

  if (facets.isLoading) return <PageSkeleton />;
  if (facets.isError || !facets.data) return <ErrorState error={facets.error} retry={() => facets.refetch()} />;
  const fc = facets.data.facets;
  const opt = (key: string) => (fc[key] ?? []).map((d) => <option key={d.key} value={d.key}>{d.label} ({d.count})</option>);
  const s = summary.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accidentes</h1>
          <p className="sub">Todos los registros normalizados del dataset activo. Los filtros se conservan al volver a esta página.</p>
        </div>
        {active > 0 && <button className="btn" onClick={() => setFilter({})}>Limpiar {active} filtro{active > 1 ? 's' : ''}</button>}
      </div>

      <div className="filters">
        <input className="input" placeholder="Buscar empresa, siniestro, centro…" value={filter.q ?? ''} onChange={(e) => set('q', e.target.value)} aria-label="Buscar" />
        <select className="select" value={filter.company ?? ''} onChange={(e) => set('company', e.target.value)} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {facets.data.companies.slice().sort((a, b) => b.events - a.events).map((c) => <option key={c.key} value={c.key}>{c.name} ({c.events})</option>)}
        </select>
        <select className="select" value={filter.mechGroup ?? ''} onChange={(e) => set('mechGroup', e.target.value)} aria-label="Mecanismo"><option value="">Todo mecanismo</option>{opt('mechGroup')}</select>
        <select className="select" value={filter.eventType ?? ''} onChange={(e) => set('eventType', e.target.value)} aria-label="Tipo de siniestro"><option value="">Todo tipo</option>{opt('eventType')}</select>
        <select className="select" value={filter.careLevel ?? ''} onChange={(e) => set('careLevel', e.target.value)} aria-label="Atención"><option value="">Toda atención</option>{opt('careLevel')}</select>
        <select className="select" value={filter.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} aria-label="Municipio"><option value="">Todo municipio</option>{opt('municipality')}</select>
        <select className="select" value={filter.advisor ?? ''} onChange={(e) => set('advisor', e.target.value)} aria-label="Asesor asignado"><option value="">Todo asesor asignado</option>{opt('advisor')}</select>
        <select className="select" value={filter.advisorSecondary ?? ''} onChange={(e) => set('advisorSecondary', e.target.value)} aria-label="Asesor APA"><option value="">Todo asesor APA</option>{opt('advisorSecondary')}</select>
        <select className="select" value={filter.contactStatus ?? ''} onChange={(e) => set('contactStatus', e.target.value)} aria-label="Gestión SOC"><option value="">Toda gestión</option>{opt('contactStatus')}</select>
        <select className="select" value={filter.cls ?? ''} onChange={(e) => set('cls', e.target.value as 'AT' | 'EL' | '')} aria-label="Clase"><option value="">AT y EL</option><option value="AT">Accidentes de trabajo</option><option value="EL">Enfermedad laboral</option></select>
        <label className="row" style={{ gap: 6, fontSize: 'var(--t-md)' }}><input type="date" className="input" style={{ width: 148 }} value={filter.from ?? ''} onChange={(e) => set('from', e.target.value)} aria-label="Desde" /></label>
        <label className="row" style={{ gap: 6, fontSize: 'var(--t-md)' }}><input type="date" className="input" style={{ width: 148 }} value={filter.to ?? ''} onChange={(e) => set('to', e.target.value)} aria-label="Hasta" /></label>
        <label className="row" style={{ gap: 6, fontSize: 'var(--t-md)' }}><input type="checkbox" checked={!!filter.severe} onChange={(e) => set('severe', e.target.checked || undefined)} />Solo graves</label>
      </div>

      {s && (
        <section className="grid-3" style={{ marginBottom: 16 }}>
          <div className="panel panel-pad">
            <div className="kpi-label">Registros</div>
            <div className="kpi-value">{n0(s.total)}</div>
            <div className="kpi-meta">{pct(s.total / Math.max(1, facets.data.companies.reduce((a, c) => a + c.events, 0)), 1)} de los accidentes de trabajo</div>
          </div>
          <div className="panel panel-pad">
            <div className="kpi-label" style={{ marginBottom: 10 }}>Mecanismos en la selección</div>
            <BarList items={(s.facets.mechGroup ?? []).map((d) => ({ key: d.key, label: d.label, count: d.count, share: d.share }))} limit={3} onSelect={(it) => set('mechGroup', it.key)} />
          </div>
          <div className="panel panel-pad">
            <div className="kpi-label" style={{ marginBottom: 10 }}>Atención en la selección</div>
            <BarList items={(s.facets.careLevel ?? []).map((d) => ({ key: d.key, label: d.label, count: d.count, share: d.share }))} limit={3} onSelect={(it) => set('careLevel', it.key)} />
          </div>
        </section>
      )}

      <div className="panel"><EventsTable filter={filter} pageSize={40} /></div>
    </>
  );
}
