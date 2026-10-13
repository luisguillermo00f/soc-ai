import { Link } from 'react-router-dom';
import type { Pattern, PatternKind } from '@shared/types.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { n0, n1, pct } from '../lib/format.ts';
import { ConfTag, TrendDelta } from './ui.tsx';
import { EvidenceButton } from './ai.tsx';

export function PatternPath({ p }: { p: Pattern }) {
  return (
    <div className="path" aria-label={p.path.map((s) => `${s.dimLabel}: ${s.value}`).join(', ')}>
      {p.path.map((s, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="arrow" aria-hidden="true">→</span>}
          <span className="step"><small>{s.dimLabel}</small>{s.dim === 'company' && p.company ? <Link to={`/empresas/${p.company}`} style={{ textDecoration: 'none', fontWeight: 550 }}>{s.value}</Link> : s.value}</span>
        </span>
      ))}
    </div>
  );
}

export const KIND_LABEL: Record<PatternKind | 'todos', string> = {
  todos: 'Todos', company: 'Recurrencia por empresa', cluster: 'Rachas', worker: 'Reincidencia', global: 'Globales', 'cross-company': 'Entre empresas', temporal: 'Temporales',
};

function pFmt(p: number) {
  return p < 0.0001 ? '< 0,0001' : n1(p * 100) === '0,0' ? p.toFixed(4).replace('.', ',') : p.toFixed(3).replace('.', ',');
}

export function PatternCard({ p }: { p: Pattern }) {
  const open = useEvidence();
  return (
    <div className="pattern">
      <div>
        <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="tag">{KIND_LABEL[p.kind]}</span>
          <ConfTag c={p.confidence} />
        </div>
        <h3>{p.title}</h3>
        <PatternPath p={p} />
        <p>{p.explanation}</p>
        <div style={{ marginTop: 10 }}>
          <EvidenceButton onClick={() => open({
            title: p.title,
            subtitle: p.explanation,
            stats: [
              { label: 'Eventos del patrón', value: n0(p.count) },
              { label: 'Universo comparado', value: n0(p.base) },
              ...(p.expectedShare ? [{ label: 'Proporción observada vs esperada', value: `${pct(p.share)} vs ${pct(p.expectedShare)}` }] : []),
              ...(p.lift ? [{ label: 'Lift', value: `${n1(p.lift)}×` }] : []),
              { label: 'p-valor', value: pFmt(p.pValue) },
              { label: 'Días de incapacidad', value: n0(p.daysLost) },
            ],
            eventIds: p.eventIds,
          })} />
        </div>
      </div>
      <dl className="pattern-stats">
        <dt>Eventos</dt><dd>{n0(p.count)} de {n0(p.base)}</dd>
        {p.expectedShare > 0 && <><dt>Observado</dt><dd>{pct(p.share)}</dd><dt>Esperado</dt><dd>{pct(p.expectedShare)}</dd></>}
        {p.lift > 0 && <><dt>Lift</dt><dd>{n1(p.lift)}×</dd></>}
        <dt>p-valor</dt><dd>{pFmt(p.pValue)}</dd>
        {p.trend && <><dt>Semestres</dt><dd><TrendDelta trend={p.trend} compact /></dd></>}
        <dt>Graves</dt><dd>{n0(p.severe)}</dd>
        <dt>Días perdidos</dt><dd>{n0(p.daysLost)}</dd>
      </dl>
    </div>
  );
}

