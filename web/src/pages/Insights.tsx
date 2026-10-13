import { useState } from 'react';
import { useOverview } from '../lib/queries.ts';
import { ErrorState, PageSkeleton, Seg } from '../components/ui.tsx';
import { InsightRow } from '../components/InsightRow.tsx';

export function Insights() {
  const q = useOverview();
  const [sev, setSev] = useState<'todas' | 'alta' | 'media' | 'baja'>('todas');
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const list = q.data.insights.filter((i) => sev === 'todas' || i.severity === sev);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights de SOC AI</h1>
          <p className="sub">Hallazgos que el motor detectó al escanear el dataset. Cada uno trae su evidencia, por qué importa y una acción sugerida. Todas las cifras son calculadas, no estimadas.</p>
        </div>
        <Seg label="Prioridad" value={sev} onChange={setSev} options={[{ value: 'todas', label: 'Todas' }, { value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }]} />
      </div>
      <div className="panel">
        {list.map((i) => <InsightRow key={i.id} insight={i} />)}
        {!list.length && <p className="muted" style={{ padding: 20 }}>No hay insights con esa prioridad.</p>}
      </div>
    </>
  );
}
