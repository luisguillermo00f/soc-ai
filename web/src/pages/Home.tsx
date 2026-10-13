import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiResult, ExecutiveReading, Overview, Pattern } from '@shared/types.ts';
import { useExecutive, useOverview } from '../lib/queries.ts';
import { send } from '../lib/api.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { useCan } from '../lib/session.tsx';
import { useCompanion } from '../lib/companion.tsx';
import { LEVEL_LABEL, LEVELS, monthShort, n0, n1, pct, signedPct, dateEs, monthLong } from '../lib/format.ts';
import { ErrorState, PageSkeleton, RiskBadge, TrendDelta, Delta, NatureChip, ConfTag, Skeleton, useToast } from '../components/ui.tsx';
import { BarList, LineChart } from '../components/charts.tsx';
import { AiHeader, EvidenceButton, FactChips, VText, unverifiedFor } from '../components/ai.tsx';
import { IArrowRight, IChat, IPrint } from '../components/Icons.tsx';
import { InsightRow } from '../components/InsightRow.tsx';
import { PatternPath } from '../components/PatternCard.tsx';

export function Home() {
  const q = useOverview();
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <Dashboard o={q.data} />;
}

function Dashboard({ o }: { o: Overview }) {
  const k = o.kpis;
  const companion = useCompanion();
  const open = useEvidence();
  const nav = useNavigate();
  const p = o.period;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>¿Cómo está la accidentalidad?</h1>
          <p className="sub">
            Corte al {dateEs(p.dataEnd)}. {n0(k.eventsAT)} accidentes de trabajo y {n0(k.eventsEL)} enfermedades laborales en {n0(k.companies)} empresas.
            {p.partialMonth && ` El mes de ${monthLong(p.partialMonth)} está incompleto y no entra en las tendencias.`}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" to="/reportes/ejecutivo"><IPrint />Reporte ejecutivo</Link>
          <button className="btn btn-ai" onClick={() => companion.setOpen(true)}><IChat />Preguntar a SOC Companion</button>
        </div>
      </div>

      <section className="kpis kpis-4" aria-label="Indicadores principales">
        <button className="kpi" onClick={() => nav('/empresas')}>
          <div className="kpi-label">Empresas analizadas</div>
          <div className="kpi-value">{n0(k.companies)}</div>
          <div className="kpi-meta">{n0(k.companiesWithEvents)} con accidentes de trabajo</div>
        </button>
        <button className="kpi" onClick={() => open({ title: 'Accidentes de trabajo', filter: { cls: 'AT' }, stats: [{ label: 'Accidentes de trabajo', value: n0(k.eventsAT) }, { label: 'Días de incapacidad', value: n0(k.daysLost) }, { label: 'Graves', value: n0(k.severe) }] })}>
          <div className="kpi-label">Accidentes totales</div>
          <div className="kpi-value">{n0(k.eventsAT)}</div>
          <div className="kpi-meta">{n0(k.severe)} graves · {n1(k.daysPerEvent)} días por accidente</div>
        </button>
        <button className="kpi" onClick={() => open({ title: `Accidentes ${p.recent.label}`, filter: { cls: 'AT', from: `${p.recent.start}-01`, to: `${p.recent.end}-31` }, stats: [{ label: p.recent.label, value: n0(k.recentEvents) }, { label: p.previous.label, value: n0(k.previousEvents) }, { label: 'Prueba binomial exacta', value: `p = ${n1((k.recentPValue ?? 1) * 100)} %` }] })}>
          <div className="kpi-label">Accidentes del período</div>
          <div className="kpi-value">{n0(k.recentEvents)}</div>
          <div className="kpi-meta"><Delta value={k.recentChange} /> vs. {p.previous.label}</div>
        </button>
        {k.ytd && (
          <div className="kpi">
            <div className="kpi-label">Tendencia año contra año</div>
            <div className="kpi-value"><Delta value={k.ytd.change} /></div>
            <div className="kpi-meta">{n0(k.ytd.current)} vs. {n0(k.ytd.previous)}, mismos meses</div>
          </div>
        )}
        {k.topCompany && (
          <Link className="kpi" to={`/empresas/${k.topCompany.key}`} style={{ textDecoration: 'none' }}>
            <div className="kpi-label">Mayor accidentalidad</div>
            <div className="kpi-value text">{k.topCompany.name}</div>
            <div className="kpi-meta">{n0(k.topCompany.events)} accidentes · {pct(k.topCompany.share)}</div>
          </Link>
        )}
        {k.topMechanism && (
          <div className="kpi">
            <div className="kpi-label">Accidente más frecuente</div>
            <div className="kpi-value text">{k.topMechanism.label}</div>
            <div className="kpi-meta">{n0(k.topMechanism.count)} · {pct(k.topMechanism.share)}</div>
          </div>
        )}
        <Link className="kpi" to="/criticas" style={{ textDecoration: 'none' }}>
          <div className="kpi-label">Empresas críticas</div>
          <div className="kpi-value">{n0(k.criticalCompanies)}</div>
          <div className="kpi-meta">{n0(k.priorityCompanies)} prioritarias más</div>
        </Link>
        <Link className="kpi" to="/patrones" style={{ textDecoration: 'none' }}>
          <div className="kpi-label">Patrones recurrentes</div>
          <div className="kpi-value">{n0(k.recurringPatterns)}</div>
          <div className="kpi-meta">{n0(k.repeatWorkers)} trabajadores reincidentes</div>
        </Link>
      </section>

      <section className="section grid-main">
        <ExecutiveBlock />
        <div className="panel">
          <div className="panel-head"><div><h2>Estado del portafolio</h2><p className="question">¿Cuántas empresas hay en cada nivel de riesgo?</p></div></div>
          <div className="panel-body">
            <LevelBars levels={o.levels} />
            <hr className="divider" />
            <h3 style={{ fontSize: 'var(--t-base)', marginBottom: 2 }}>Mecanismos</h3>
            <p className="question" style={{ marginBottom: 12 }}>¿Qué tipo de accidente pesa más?</p>
            <BarList
              items={o.mechanisms.map((m) => ({ key: m.key, label: m.label, count: m.count, share: m.share }))}
              limit={7}
              muted={(it) => it.key === 'sin-info' || it.key === 'otro'}
              onSelect={(it) => open({ title: it.label, filter: { mechGroup: it.key, cls: 'AT' }, stats: [{ label: 'Accidentes', value: n0(it.count) }, { label: 'Participación', value: pct(it.share) }] })}
            />
          </div>
        </div>
      </section>

      <section className="section grid-main">
        <div className="panel">
          <div className="panel-head">
            <div><h2>Empresas bajo atención</h2><p className="question">¿A quién intervenir primero y por qué?</p></div>
            <Link className="btn btn-sm btn-ghost" to="/criticas">Ver todas<IArrowRight /></Link>
          </div>
          <div className="attention-list" style={{ marginTop: 8 }}>
            {o.attention.slice(0, 7).map((s) => (
              <Link key={s.key} className="attention-item" to={`/empresas/${s.key}`}>
                <div className="score-num">{s.score.score}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</b>
                    {s.contactGap && <span className="tag alta" title="La mayoría de sus eventos no tiene cita ejecutada">Sin cita</span>}
                  </div>
                  <div className="why" title={s.score.factors.filter((f) => f.points > 0).map((f) => `+${f.points} ${f.label}: ${f.reason}`).join(' | ')}>{s.score.factors.filter((f) => f.points > 0).slice(0, 2).map((f) => f.reason).join(' · ')}</div>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <TrendDelta trend={s.trend} compact />
                  <RiskBadge level={s.score.level} />
                </div>
              </Link>
            ))}
            {!o.attention.length && <p className="muted" style={{ padding: 20 }}>Ninguna empresa supera el umbral prioritario.</p>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Tendencia mensual</h2><p className="question">¿Sube o baja la accidentalidad mes a mes?</p></div></div>
          <div className="panel-body">
            <LineChart
              ariaLabel="Accidentes de trabajo por mes"
              points={o.monthly.map((m) => ({ label: monthShort(m.month), value: m.count, tip: `${m.severe} graves · ${n0(m.days)} días` }))}
              height={230}
            />
            <p className="faint" style={{ fontSize: 'var(--t-sm)', marginTop: 8 }}>
              Últimos 6 meses: {n0(k.recentEvents)} ({signedPct(k.recentChange)} frente a los 6 anteriores{(k.recentPValue ?? 1) >= 0.05 ? ', dentro de la variación normal' : ', cambio significativo'}).
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>Principales patrones</h2><p className="question">¿Qué se repite, dónde y con qué fuerza estadística?</p></div>
          <Link className="btn btn-sm btn-ghost" to="/patrones">Explorar patrones<IArrowRight /></Link>
        </div>
        <div className="panel">
          {o.topPatterns.slice(0, 5).map((pt) => <PatternLine key={pt.id} p={pt} />)}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>Insights de SOC AI</h2><p className="question">Lo que el sistema encontró sin que se lo pidieran.</p></div>
          <Link className="btn btn-sm btn-ghost" to="/insights">Ver los {o.insights.length}<IArrowRight /></Link>
        </div>
        <div className="panel">
          {o.insights.slice(0, 4).map((i) => <InsightRow key={i.id} insight={i} compact />)}
        </div>
      </section>

      <RecommendedActions />
    </>
  );
}

function PatternLine({ p }: { p: Pattern }) {
  const open = useEvidence();
  return (
    <div className="pattern" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
      <div>
        <h3>{p.title}</h3>
        <PatternPath p={p} />
        <p>{p.explanation}</p>
      </div>
      <div className="stack" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div className="num" style={{ fontSize: 'var(--t-xl)', fontWeight: 650 }}>{n0(p.count)}<span className="faint" style={{ fontSize: 'var(--t-sm)', fontWeight: 500 }}> eventos</span></div>
        <ConfTag c={p.confidence} />
        <EvidenceButton onClick={() => open({ title: p.title, subtitle: p.explanation, eventIds: p.eventIds })} />
      </div>
    </div>
  );
}

export function LevelBars({ levels }: { levels: Record<string, number> }) {
  const total = Object.values(levels).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', gap: 2 }} aria-hidden="true">
        {LEVELS.map((l) => levels[l]! > 0 && <div key={l} style={{ flex: Math.max(levels[l]!, total * 0.012), background: `var(--${l === 'critico' ? 'crit' : l === 'prioritario' ? 'prio' : l === 'atencion' ? 'aten' : 'ctrl'})` }} />)}
      </div>
      {LEVELS.map((l) => (
        <Link key={l} to={`/empresas?nivel=${l}`} className="row" style={{ justifyContent: 'space-between', textDecoration: 'none', fontSize: 'var(--t-md)' }}>
          <RiskBadge level={l} />
          <span className="num"><b>{n0(levels[l])}</b> <span className="faint">{pct(levels[l]! / total, 0)}</span></span>
        </Link>
      ))}
      <span className="sr-only">{LEVELS.map((l) => `${LEVEL_LABEL[l]}: ${levels[l]}`).join(', ')}</span>
    </div>
  );
}

function useExecutiveGen() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => send<AiResult<ExecutiveReading>>('POST', '/ai/executive', { force: true }),
    onSuccess: (r) => { qc.setQueryData(['executive'], { result: r }); toast('Lectura ejecutiva actualizada.'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo generar.'),
  });
}

function ExecutiveBlock() {
  const q = useExecutive();
  const gen = useExecutiveGen();
  const can = useCan('analista');
  const r = q.data?.result;
  if (q.isLoading) return <div className="ai-block"><div className="ai-body stack"><Skeleton h={22} w="70%" /><Skeleton h={70} /><Skeleton h={120} /></div></div>;
  if (!r) {
    return (
      <div className="ai-block">
        <AiHeader title="Lectura ejecutiva" />
        <div className="ai-body">
          <p className="muted" style={{ marginBottom: 12 }}>Aún no se ha generado la lectura ejecutiva de este dataset.</p>
          {can && <button className="btn btn-ai" onClick={() => gen.mutate()} disabled={gen.isPending}>{gen.isPending ? 'Generando…' : 'Generar lectura ejecutiva'}</button>}
        </div>
      </div>
    );
  }
  const c = r.content;
  const m = r.meta;
  return (
    <div className="ai-block">
      <AiHeader title="Estado general · Lectura SOC AI" meta={m} onRegenerate={can ? () => gen.mutate() : undefined} busy={gen.isPending} />
      <div className="ai-body" style={{ opacity: gen.isPending ? 0.55 : 1, transition: 'opacity 200ms ease' }}>
        <p className="ai-headline"><VText text={c.headline} unverified={unverifiedFor(m, 'headline')} /></p>
        <p className="ai-summary"><VText text={c.state} unverified={unverifiedFor(m, 'state')} /></p>
        {c.nonObvious.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 'var(--t-base)', marginBottom: 4 }}>Lo que no es evidente</h3>
            {c.nonObvious.slice(0, 3).map((n, i) => (
              <div className="finding" key={i}>
                <div><NatureChip nature={n.nature} /></div>
                <div>
                  <h4>{n.title}</h4>
                  <p><VText text={n.body} unverified={unverifiedFor(m, `nonObvious.${i}`)} /></p>
                  <div className="meta"><FactChips ids={n.evidence} facts={m.facts} title={n.title} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendedActions() {
  const q = useExecutive();
  const r = q.data?.result;
  if (!r) return null;
  const c = r.content;
  return (
    <section className="section">
      <div className="section-title"><div><h2>Acciones recomendadas</h2><p className="question">¿Qué debería hacer SOC esta semana?</p></div></div>
      <div className="panel">
        <table className="data">
          <thead><tr><th style={{ width: 110 }}>Prioridad</th><th>Acción</th><th>Por qué</th></tr></thead>
          <tbody>
            {c.actions.map((a, i) => (
              <tr key={i}>
                <td><span className={`tag ${a.priority}`}>{a.priority === 'alta' ? 'Alta' : a.priority === 'media' ? 'Media' : 'Baja'}</span></td>
                <td style={{ fontWeight: 550, padding: '10px 12px' }}>{a.action}</td>
                <td className="muted" style={{ padding: '10px 12px' }}>{a.why}</td>
              </tr>
            ))}
            {c.priorities.map((p, i) => (
              <tr key={`p${i}`}>
                <td><span className="tag alta">Visita</span></td>
                <td style={{ fontWeight: 550, padding: '10px 12px' }}>Intervenir {p.company}</td>
                <td className="muted" style={{ padding: '10px 12px' }}><VText text={p.why} unverified={unverifiedFor(r.meta, `priorities.${i}`)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
