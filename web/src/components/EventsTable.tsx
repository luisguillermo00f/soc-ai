import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { EventFilter, EventsPage } from '@shared/types.ts';
import { send } from '../lib/api.ts';
import { dateEs, n0 } from '../lib/format.ts';
import { Skeleton, ErrorState } from './ui.tsx';

const SEV_LABEL = ['', 'Leve', 'Moderado', 'Quirúrgico', 'Hospitalario', 'Crítico'];

const cut: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export function EventsTable({ filter, pageSize = 25, showCompany = true }: { filter: EventFilter; pageSize?: number; showCompany?: boolean }) {
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('-date');
  const q = useQuery({
    queryKey: ['events', filter, offset, sort, pageSize],
    queryFn: () => send<EventsPage>('POST', '/events/query', { filter, offset, limit: pageSize, sort }),
    placeholderData: keepPreviousData,
  });
  const sortBtn = (field: string, label: string) => (
    <button type="button" onClick={() => { setSort(sort === `-${field}` ? field : `-${field}`); setOffset(0); }} aria-label={`Ordenar por ${label}`}>
      {label}{sort.replace('-', '') === field ? (sort.startsWith('-') ? ' ↓' : ' ↑') : ''}
    </button>
  );
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <div className="stack" style={{ gap: 8, padding: 12 }}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={30} />)}</div>;
  const { rows, total } = q.data;
  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{sortBtn('date', 'Fecha')}</th>
              <th>Siniestro</th>
              {showCompany && <th>{sortBtn('company', 'Empresa')}</th>}
              <th>Mecanismo</th>
              <th>Centro de trabajo</th>
              <th>Atención</th>
              <th className="r">{sortBtn('daysLost', 'Días')}</th>
              <th className="r">{sortBtn('severity', 'Severidad')}</th>
              <th>Trabajador</th>
              <th>Gestión SOC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {dateEs(e.cls === 'EL' ? e.qualDate ?? e.date : e.date)}
                  {e.cls === 'EL' && <span className="tag" style={{ marginLeft: 6 }} title="Enfermedad laboral (fecha de calificación)">EL</span>}
                </td>
                <td className="mono">{e.eventNo ?? '–'}</td>
                {showCompany && <td style={{ maxWidth: 240 }}><Link className="name" to={`/empresas/${e.company}`} style={{ display: 'block', ...cut }}>{e.companyName}</Link></td>}
                <td style={{ maxWidth: 260 }}><div style={cut} title={e.mechanism ?? ''}>{e.mechanism ?? <span className="faint">Sin dato</span>}</div></td>
                <td style={{ maxWidth: 180 }}><div style={cut} title={e.workCenter ?? ''}>{e.workCenter ?? '–'}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.careLevel ?? '–'}</td>
                <td className="r">{n0(e.daysLost)}</td>
                <td className="r">{e.severe ? <b style={{ color: 'var(--crit-ink)' }}>{SEV_LABEL[e.careRank ?? 0] || 'Grave'}</b> : <span className="muted">{SEV_LABEL[e.careRank ?? 0] || '–'}</span>}</td>
                <td className="mono faint">{e.worker ?? '–'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.contactStatus ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="num">{total ? `${n0(offset + 1)}–${n0(Math.min(total, offset + pageSize))} de ${n0(total)} registros` : 'Sin registros con estos filtros'}</span>
        <span className="row">
          <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Anterior</button>
          <button className="btn btn-sm" disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)}>Siguiente</button>
        </span>
      </div>
    </div>
  );
}
