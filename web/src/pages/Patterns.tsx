import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { HeatmapData, PatternKind } from '@shared/types.ts';
import { get } from '../lib/api.ts';
import { usePatterns } from '../lib/queries.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { n0 } from '../lib/format.ts';
import { ErrorState, PageSkeleton, Seg, Skeleton } from '../components/ui.tsx';
import { Heatmap } from '../components/charts.tsx';
import { KIND_LABEL, PatternCard } from '../components/PatternCard.tsx';

const ROW_DIMS = [{ value: 'company', label: 'Empresa' }, { value: 'municipality', label: 'Municipio' }, { value: 'advisor', label: 'Asesor' }, { value: 'eventType', label: 'Tipo de siniestro' }] as const;
const COL_DIMS = [{ value: 'mechGroup', label: 'Mecanismo' }, { value: 'month', label: 'Mes' }, { value: 'careRank', label: 'Severidad' }, { value: 'weekday', label: 'Día' }] as const;

export function Patterns() {
  const q = usePatterns();
  const [kind, setKind] = useState<PatternKind | 'todos'>('todos');
  const [search, setSearch] = useState('');
  const [conf, setConf] = useState<'todas' | 'alta' | 'media'>('todas');
  const [row, setRow] = useState<string>('company');
  const [col, setCol] = useState<string>('mechGroup');
  const open = useEvidence();
  const heat = useQuery({ queryKey: ['heat', row, col], queryFn: () => get<HeatmapData>(`/heatmap?row=${row}&col=${col}&limit=18`) });

  const list = useMemo(() => {
    const f = search.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return (q.data?.patterns ?? []).filter((p) => (kind === 'todos' || p.kind === kind)
      && (conf === 'todas' || p.confidence === conf || (conf === 'media' && p.confidence === 'alta'))
      && (!f || `${p.title} ${p.path.map((s) => s.value).join(' ')}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f)));
  }, [q.data, kind, search, conf]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const counts = q.data.patterns.reduce<Record<string, number>>((m, p) => ({ ...m, [p.kind]: (m[p.kind] ?? 0) + 1 }), {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Detección de patrones</h1>
          <p className="sub">Combinaciones de empresa, mecanismo, lugar, severidad y tiempo que se repiten más de lo esperado. Cada patrón trae su prueba estadística exacta; los globales se corrigen por pruebas múltiples.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <div><h2>Matriz de concentración</h2><p className="question">¿Dónde se cruzan las variables? Clic en una celda para ver los registros.</p></div>
          <div className="row wrap">
            <label className="sr-only" htmlFor="hrow">Filas</label>
            <select id="hrow" className="select" value={row} onChange={(e) => setRow(e.target.value)}>{ROW_DIMS.map((d) => <option key={d.value} value={d.value}>Filas: {d.label}</option>)}</select>
            <label className="sr-only" htmlFor="hcol">Columnas</label>
            <select id="hcol" className="select" value={col} onChange={(e) => setCol(e.target.value)}>{COL_DIMS.map((d) => <option key={d.value} value={d.value}>Columnas: {d.label}</option>)}</select>
          </div>
        </div>
        <div className="panel-body">
          {heat.data ? (
            <Heatmap data={heat.data} onCell={(r, c) => {
              const filter: Record<string, string> = { cls: 'AT' };
              const map: Record<string, string> = { company: 'company', municipality: 'municipality', advisor: 'advisor', eventType: 'eventType', mechGroup: 'mechGroup' };
              if (map[row]) filter[map[row]] = r;
              if (map[col]) filter[map[col]] = c;
              if (col === 'month') { filter.from = `${c}-01`; filter.to = `${c}-31`; }
              const rl = heat.data!.rows.find((x) => x.key === r)?.label;
              const cl = heat.data!.cols.find((x) => x.key === c)?.label;
              open({ title: `${rl} · ${cl}`, filter });
            }} />
          ) : <Skeleton h={360} />}
        </div>
      </section>

      <section className="section">
        <div className="filters">
          <input className="input" placeholder="Buscar empresa o mecanismo" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar patrón" />
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as PatternKind | 'todos')} aria-label="Tipo de patrón">
            {(['todos', 'company', 'cluster', 'worker', 'global', 'cross-company'] as const).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}{k !== 'todos' ? ` (${counts[k] ?? 0})` : ` (${q.data!.patterns.length})`}</option>
            ))}
          </select>
          <Seg label="Confianza" value={conf} onChange={setConf} options={[{ value: 'todas', label: 'Toda confianza' }, { value: 'media', label: 'Media o alta' }, { value: 'alta', label: 'Alta' }]} />
          <span className="faint num" style={{ marginLeft: 'auto', fontSize: 'var(--t-sm)' }}>{n0(list.length)} patrones</span>
        </div>
        <div className="panel">
          {list.slice(0, 60).map((p) => <PatternCard key={p.id} p={p} />)}
          {!list.length && <p className="muted" style={{ padding: 20 }}>Ningún patrón coincide con estos filtros.</p>}
          {list.length > 60 && <p className="faint" style={{ padding: 16, fontSize: 'var(--t-sm)' }}>Se muestran los 60 de mayor relevancia. Usa la búsqueda para encontrar uno específico.</p>}
        </div>
      </section>
    </>
  );
}
