import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CompanySummary, RiskLevel, ScoringConfig } from '@shared/types.ts';
import { get } from '../lib/api.ts';
import { AdvisorSelect, matchAdvisor, useAdvisor } from '../lib/advisor.tsx';
import { useCompanies } from '../lib/queries.ts';
import { LEVEL_LABEL, n0 } from '../lib/format.ts';
import { ErrorState, PageSkeleton, RiskBadge, Seg, TrendDelta } from '../components/ui.tsx';
import { IArrowRight } from '../components/Icons.tsx';

export function ScoreCard({ s }: { s: CompanySummary }) {
  const [openReasons, setOpen] = useState(s.score.level === 'critico');
  return (
    <article className="panel" style={{ padding: 0 }}>
      <div className="row" style={{ padding: '16px 20px', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <Link to={`/empresas/${s.key}`} className="name" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, textDecoration: 'none' }}>{s.name}</Link>
          <div className="faint" style={{ fontSize: 'var(--t-sm)', marginTop: 2 }}>
            {n0(s.eventsAT)} accidentes · semestres {s.trend.previous} → {s.trend.recent} · {s.severe} graves · {s.topMechanism ?? 'mecanismo sin dato'}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <RiskBadge level={s.score.level} />
            <TrendDelta trend={s.trend} />
            {s.contactGap && <span className="tag alta">Gestión: {s.contactStatus}</span>}
          </div>
        </div>
        <div className="score-num" style={{ fontSize: 'var(--t-3xl)' }}>{s.score.score}<small>/100</small></div>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', padding: '4px 20px 14px' }}>
        <button className="evidence-link" style={{ margin: '10px 0 4px' }} onClick={() => setOpen(!openReasons)} aria-expanded={openReasons}>
          {openReasons ? 'Ocultar razones' : 'Ver razones del puntaje'}
        </button>
        {openReasons && (
          <div>
            {s.score.factors.map((f) => (
              <div className="factor" key={f.id}>
                <span className="fl">{f.points > 0 ? `+${f.points}` : '0'} por {f.label.toLowerCase()}</span>
                <span className="fp faint" style={{ fontWeight: 500 }}>{f.weight} máx.</span>
                <span className="meter"><i style={{ width: `${f.value * 100}%` }} /></span>
                <span className="fr">{f.reason}</span>
              </div>
            ))}
            {s.score.caps.map((c, i) => <p key={i} className="notice" style={{ marginTop: 8 }}>{c}</p>)}
          </div>
        )}
      </div>
    </article>
  );
}

export function Critical() {
  const q = useCompanies();
  const m = useQuery({ queryKey: ['methodology'], queryFn: () => get<{ factors: { id: string; label: string; doc: string }[]; config: ScoringConfig }>('/methodology') });
  const [level, setLevel] = useState<RiskLevel | 'ambos'>('ambos');
  const [advisor, setAdvisor] = useAdvisor();
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const list = q.data.companies.filter((s) => matchAdvisor(s, advisor) && (level === 'ambos' ? s.score.level === 'critico' || s.score.level === 'prioritario' : s.score.level === level));
  const cfg = m.data?.config;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Empresas bajo atención</h1>
          <p className="sub">Clasificación por un puntaje explicable de 0 a 100. Ningún nivel se asigna a mano: cada empresa muestra los puntos que aporta cada factor y la razón medida en sus datos.</p>
        </div>
        <div className="page-actions"><AdvisorSelect value={advisor} onChange={setAdvisor} />
        <Seg label="Nivel" value={level} onChange={setLevel} options={[
          { value: 'ambos', label: 'Crítico y prioritario' }, { value: 'critico', label: LEVEL_LABEL.critico }, { value: 'prioritario', label: LEVEL_LABEL.prioritario }, { value: 'atencion', label: LEVEL_LABEL.atencion },
        ]} /></div>
      </div>
      <div className="grid-main" style={{ alignItems: 'start' }}>
        <div className="stack">
          {list.slice(0, 40).map((s) => <ScoreCard key={s.key} s={s} />)}
          {!list.length && <div className="panel"><p className="muted" style={{ padding: 20 }}>Ninguna empresa en este nivel.</p></div>}
          {list.length > 40 && <Link className="btn" to={`/empresas?nivel=${level === 'ambos' ? 'prioritario' : level}`}>Ver las {list.length} en la tabla<IArrowRight /></Link>}
        </div>
        <aside className="panel" style={{ position: 'sticky', top: 72 }}>
          <div className="panel-head"><div><h2>Metodología del puntaje</h2><p className="question">Pesos configurables en Ajustes.</p></div></div>
          <div className="panel-body stack" style={{ gap: 12 }}>
            {cfg && (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><RiskBadge level="critico" /><span className="num muted">≥ {cfg.thresholds.critico}</span></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><RiskBadge level="prioritario" /><span className="num muted">{cfg.thresholds.prioritario} – {cfg.thresholds.critico - 1}</span></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><RiskBadge level="atencion" /><span className="num muted">{cfg.thresholds.atencion} – {cfg.thresholds.prioritario - 1}</span></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><RiskBadge level="controlado" /><span className="num muted">&lt; {cfg.thresholds.atencion}</span></div>
              </div>
            )}
            <hr className="divider" style={{ margin: '4px 0' }} />
            {m.data?.factors.map((f) => (
              <div key={f.id} style={{ fontSize: 'var(--t-md)' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontWeight: 600 }}>{f.label}</b><span className="num faint">{cfg?.weights[f.id] ?? 0} pts</span></div>
                <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 2 }}>{f.doc}</p>
              </div>
            ))}
            {cfg && <p className="faint" style={{ fontSize: 'var(--t-sm)' }}>Regla de evidencia mínima: con menos de {cfg.minEvidence} accidentes una empresa no puede pasar de prioritario (o de atención si no tiene eventos graves).</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
