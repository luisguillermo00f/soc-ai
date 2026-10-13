import { Link } from 'react-router-dom';
import type { Insight } from '@shared/types.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { ConfTag } from './ui.tsx';
import { EvidenceButton } from './ai.tsx';

const SEV_LABEL = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' } as const;

export function InsightRow({ insight: i, compact }: { insight: Insight; compact?: boolean }) {
  const open = useEvidence();
  const evidence = () => open({
    title: i.title,
    subtitle: i.finding,
    stats: i.evidence.map((e) => ({ label: e.label, value: e.value })),
    eventIds: i.eventIds.length ? i.eventIds : undefined,
    filter: i.eventIds.length ? undefined : i.filter,
  });
  return (
    <article className="insight">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <h3>{i.title}</h3>
        <div className="row" style={{ flex: 'none' }}>
          <span className={`tag ${i.severity}`}>{SEV_LABEL[i.severity]}</span>
          {!compact && <ConfTag c={i.confidence} />}
        </div>
      </div>
      {compact ? (
        <p className="muted" style={{ fontSize: 'var(--t-md)' }}>{i.finding} <span style={{ color: 'var(--ink)' }}>{i.action}</span></p>
      ) : (
        <div className="insight-flow">
          <div><h5>Hallazgo</h5>{i.finding}</div>
          <div><h5>Evidencia</h5>
            <ul>{i.evidence.slice(0, 4).map((e, k) => <li key={k}><span className="muted">{e.label}:</span> <span className="num">{e.value}</span></li>)}</ul>
          </div>
          <div><h5>Por qué importa</h5>{i.importance}</div>
          <div><h5>Acción sugerida</h5>{i.action}</div>
        </div>
      )}
      <div className="row" style={{ gap: 16 }}>
        <EvidenceButton onClick={evidence} />
        {i.company && <Link className="evidence-link" to={`/empresas/${i.company}`}>Ver empresa</Link>}
      </div>
    </article>
  );
}

