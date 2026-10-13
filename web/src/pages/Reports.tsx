import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiResult, ShockPlan, WhatsHappening } from '@shared/types.ts';
import { get, send } from '../lib/api.ts';
import { useCompany, useExecutive, useFacets, useOverview } from '../lib/queries.ts';
import { useCan, useSession } from '../lib/session.tsx';
import { dateEs, dateTimeEs, LEVEL_LABEL, monthLong, monthShort, n0, n1, pct, signedPct } from '../lib/format.ts';
import { ErrorState, PageSkeleton, RiskBadge, Spinner, TrendDelta, useToast } from '../components/ui.tsx';
import { LineChart } from '../components/charts.tsx';
import { PlanView, WhatsView } from '../components/aiviews.tsx';
import { VText, unverifiedFor } from '../components/ai.tsx';
import { AiSpark, IPrint, IReport } from '../components/Icons.tsx';
import { LevelBars } from './Home.tsx';

export function Reports() {
  const facets = useFacets();
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => get<{ plans: { company: string; name: string }[] }>('/ai/plans') });
  const nav = useNavigate();
  const [key, setKey] = useState('');
  if (facets.isLoading) return <PageSkeleton />;
  if (facets.isError) return <ErrorState error={facets.error} retry={() => facets.refetch()} />;
  const companies = facets.data!.companies.slice().sort((a, b) => b.events - a.events);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reportes</h1>
          <p className="sub">Documentos listos para presentar a la gerencia de SOC o de una empresa cliente. Se imprimen o se guardan como PDF desde el navegador, con el formato A4 ya preparado.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="panel panel-pad stack">
          <IReport width={22} height={22} />
          <h2 style={{ fontSize: 'var(--t-lg)' }}>Reporte ejecutivo del portafolio</h2>
          <p className="muted">Estado general de la accidentalidad, empresas críticas con su puntaje explicado, patrones, tendencia, insights y acciones recomendadas.</p>
          <div><Link className="btn btn-primary" to="/reportes/ejecutivo">Abrir reporte ejecutivo</Link></div>
        </section>
        <section className="panel panel-pad stack">
          <IReport width={22} height={22} />
          <h2 style={{ fontSize: 'var(--t-lg)' }}>Reporte de una empresa</h2>
          <p className="muted">Resumen ejecutivo, estadísticas, tendencia, principales accidentes, patrones, análisis SOC AI, recomendaciones y plan de choque.</p>
          <div className="row">
            <select className="select" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Empresa" style={{ maxWidth: 340, flex: 1 }}>
              <option value="">Elegir empresa…</option>
              {companies.map((c) => <option key={c.key} value={c.key}>{c.name} · {LEVEL_LABEL[c.level]} · {c.events}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!key} onClick={() => nav(`/reportes/empresa/${key}`)}>Abrir</button>
          </div>
          {plans.data && plans.data.plans.length > 0 && (
            <div>
              <p className="faint" style={{ fontSize: 'var(--t-sm)', marginBottom: 6 }}>Empresas con plan de choque listo:</p>
              <div className="row wrap" style={{ gap: 6 }}>
                {plans.data.plans.slice(0, 12).map((p) => <Link key={p.company} className="tag" style={{ textDecoration: 'none' }} to={`/reportes/empresa/${p.company}`}>{p.name}</Link>)}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ReportHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { user } = useSession();
  const overview = useOverview();
  return (
    <div className="report-head">
      <div>
        <div className="row" style={{ gap: 10, marginBottom: 16 }}>
          <img src="/logo-soc.png" alt="Salud Ocupacional del Caribe" style={{ height: 44 }} />
          <span className="faint" style={{ fontSize: 'var(--t-sm)', borderLeft: '1px solid var(--line)', paddingLeft: 10 }}>SOC AI · Intelligent Occupational Safety</span>
        </div>
        <h1>{title}</h1>
        <p className="muted" style={{ marginTop: 4 }}>{subtitle}</p>
      </div>
      <div className="report-meta">
        <div>Generado {dateTimeEs(new Date().toISOString())}</div>
        <div>por {user.name}</div>
        {overview.data && <div>Datos al {dateEs(overview.data.period.dataEnd)}</div>}
        <div style={{ marginTop: 6 }}>Documento confidencial</div>
      </div>
    </div>
  );
}

function PrintBar({ back, children }: { back: string; children?: React.ReactNode }) {
  return (
    <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 16, maxWidth: 920, marginInline: 'auto' }}>
      <Link className="btn btn-ghost" to={back}>Volver</Link>
      <div className="row">{children}<button className="btn btn-primary" onClick={() => window.print()}><IPrint />Imprimir o guardar PDF</button></div>
    </div>
  );
}

export function CompanyReport() {
  const { key = '' } = useParams();
  const q = useCompany(key);
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan('analista');
  const gen = useMutation({
    mutationFn: async () => {
      if (!q.data?.whats) await send('POST', `/ai/company/${key}/whats`, {});
      if (!q.data?.plan) await send('POST', `/ai/company/${key}/plan`, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company', key] }),
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo generar el análisis.'),
  });
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { profile: p, whats, plan, period } = q.data;
  const s = p.summary;
  const missing = !whats || !plan;
  return (
    <>
      <PrintBar back={`/empresas/${key}`}>
        {missing && can && <button className="btn btn-ai" onClick={() => gen.mutate()} disabled={gen.isPending}>{gen.isPending ? <Spinner /> : <AiSpark width={13} height={13} />}Generar análisis y plan</button>}
      </PrintBar>
      <article className="report">
        <ReportHeader title={s.name} subtitle={`Reporte de accidentalidad y plan de choque${s.nit ? ` · NIT ${s.nit}` : ''}`} />

        <h2>Resumen ejecutivo</h2>
        <div className="row" style={{ gap: 10, marginBottom: 10 }}><RiskBadge level={s.score.level} score={s.score.score} /><TrendDelta trend={s.trend} /></div>
        {whats ? <p style={{ fontSize: 'var(--t-lg)', fontWeight: 550 }}><VText text={whats.content.headline} unverified={unverifiedFor(whats.meta, 'headline')} /></p> : <p className="muted">Genera el análisis para incluir el resumen interpretado.</p>}
        {whats && <p className="muted" style={{ marginTop: 6 }}><VText text={whats.content.summary} unverified={unverifiedFor(whats.meta, 'summary')} /></p>}

        <h2>Estadísticas</h2>
        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Accidentes de trabajo</div><div className="kpi-value">{n0(s.eventsAT)}</div><div className="kpi-meta">{pct(s.share)} del portafolio</div></div>
          <div className="kpi"><div className="kpi-label">Semestres</div><div className="kpi-value">{s.trend.previous} → {s.trend.recent}</div><div className="kpi-meta">{period.previous.label} / {period.recent.label}</div></div>
          <div className="kpi"><div className="kpi-label">Eventos graves</div><div className="kpi-value">{n0(s.severe)}</div><div className="kpi-meta">{n0(s.daysLost)} días de incapacidad</div></div>
          <div className="kpi"><div className="kpi-label">Reincidentes</div><div className="kpi-value">{n0(s.repeatWorkers)}</div><div className="kpi-meta">trabajadores con 2+ accidentes</div></div>
        </div>
        <h3>Puntaje de riesgo</h3>
        <table className="data">
          <tbody>
            {s.score.factors.map((f) => <tr key={f.id}><td style={{ width: 70 }} className="num"><b>+{f.points}</b>/{f.weight}</td><td style={{ fontWeight: 550, width: 200 }}>{f.label}</td><td className="muted">{f.reason}</td></tr>)}
          </tbody>
        </table>

        <h2>Tendencia</h2>
        <LineChart ariaLabel="Accidentes por mes" height={200} points={p.monthly.map((m) => ({ label: monthShort(m.month), value: m.count }))} />
        {p.anomalies.map((a, i) => <p key={i} className="muted" style={{ marginTop: 4 }}>{a.label}.</p>)}

        <h2>Principales accidentes</h2>
        <table className="data">
          <thead><tr><th>Mecanismo</th><th className="r">Accidentes</th><th className="r">Participación</th><th className="r">Graves</th><th className="r">Días</th></tr></thead>
          <tbody>{p.mechanisms.slice(0, 8).map((m) => <tr key={m.key}><td>{m.label}</td><td className="r">{m.count}</td><td className="r">{pct(m.share)}</td><td className="r">{m.severe}</td><td className="r">{n0(m.days)}</td></tr>)}</tbody>
        </table>
        {p.workCenters.length > 0 && (
          <>
            <h3>Centros de trabajo</h3>
            <p className="muted">{p.workCenters.slice(0, 5).map((w) => `${w.label} (${w.count})`).join(' · ')}</p>
          </>
        )}

        <h2>Patrones</h2>
        {p.patterns.length ? (
          <ul>{p.patterns.slice(0, 8).map((pt) => <li key={pt.id}><b>{pt.title}.</b> {pt.explanation}</li>)}</ul>
        ) : <p className="muted">Sin patrones estadísticamente relevantes con los eventos disponibles.</p>}

        {whats && (
          <>
            <h2>Análisis SOC AI: ¿qué está pasando?</h2>
            <p className="faint" style={{ fontSize: 'var(--t-sm)', marginBottom: 10 }}>{whats.meta.engine === 'reglas' ? 'Motor de reglas SOC AI' : `Razonamiento de ${whats.meta.model}`} sobre el paquete de evidencia calculado. {whats.meta.verified ? 'Todas las cifras verificadas contra el dataset.' : `${whats.meta.unverified.length} cifra(s) sin respaldo, subrayadas.`}</p>
            <WhatsView r={whats as AiResult<WhatsHappening>} print />
          </>
        )}

        {plan && (
          <>
            <h2 className="page-break">Plan de choque</h2>
            <PlanView r={plan as AiResult<ShockPlan>} print />
          </>
        )}
        <p className="faint" style={{ fontSize: 'var(--t-xs)', marginTop: 32 }}>
          Fuente: base de siniestralidad importada en SOC AI. Los trabajadores aparecen seudonimizados. Las hipótesis son explicaciones posibles que deben validarse en campo. Semestres: {period.recent.label} frente a {period.previous.label}{period.partialMonth ? `; ${monthLong(period.partialMonth)} incompleto, excluido` : ''}.
        </p>
      </article>
    </>
  );
}

export function ExecutiveReport() {
  const o = useOverview();
  const ex = useExecutive();
  if (o.isLoading || ex.isLoading) return <PageSkeleton />;
  if (o.isError || !o.data) return <ErrorState error={o.error} retry={() => o.refetch()} />;
  const d = o.data;
  const k = d.kpis;
  const r = ex.data?.result;
  return (
    <>
      <PrintBar back="/" />
      <article className="report">
        <ReportHeader title="Reporte ejecutivo de accidentalidad" subtitle={`${n0(k.companies)} empresas · ${dateEs(d.period.dataStart)} a ${dateEs(d.period.dataEnd)}`} />

        <h2>Estado general</h2>
        {r ? (
          <>
            <p style={{ fontSize: 'var(--t-lg)', fontWeight: 550 }}><VText text={r.content.headline} unverified={unverifiedFor(r.meta, 'headline')} /></p>
            <p className="muted" style={{ marginTop: 6 }}><VText text={r.content.state} unverified={unverifiedFor(r.meta, 'state')} /></p>
          </>
        ) : null}
        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Accidentes de trabajo</div><div className="kpi-value">{n0(k.eventsAT)}</div><div className="kpi-meta">{n0(k.severe)} graves</div></div>
          <div className="kpi"><div className="kpi-label">Último semestre</div><div className="kpi-value">{n0(k.recentEvents)}</div><div className="kpi-meta">{signedPct(k.recentChange)} vs. anterior</div></div>
          {k.ytd && <div className="kpi"><div className="kpi-label">Año contra año</div><div className="kpi-value">{signedPct(k.ytd.change)}</div><div className="kpi-meta">{n0(k.ytd.current)} vs. {n0(k.ytd.previous)}</div></div>}
          <div className="kpi"><div className="kpi-label">Días de incapacidad</div><div className="kpi-value">{n0(k.daysLost)}</div><div className="kpi-meta">{n1(k.daysPerEvent)} por accidente</div></div>
        </div>
        <LineChart ariaLabel="Accidentes por mes" height={190} points={d.monthly.map((m) => ({ label: monthShort(m.month), value: m.count }))} />

        <h2>Empresas bajo atención</h2>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <LevelBars levels={d.levels} />
          <p className="muted">El nivel sale de un puntaje de 0 a 100 que suma frecuencia, tendencia, recurrencia, severidad, reincidencia y actividad reciente. Cada empresa conserva el detalle de sus puntos en SOC AI.</p>
        </div>
        <table className="data" style={{ marginTop: 12 }}>
          <thead><tr><th>Empresa</th><th>Nivel</th><th className="r">Accidentes</th><th>Razón principal</th></tr></thead>
          <tbody>
            {d.attention.slice(0, 15).map((s) => (
              <tr key={s.key}><td style={{ fontWeight: 550 }}>{s.name}</td><td><RiskBadge level={s.score.level} score={s.score.score} /></td><td className="r">{s.eventsAT}</td><td className="muted">{s.score.factors[0]?.reason}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>Principales patrones</h2>
        <ul>{d.topPatterns.slice(0, 8).map((p) => <li key={p.id}><b>{p.title}.</b> {p.explanation}</li>)}</ul>

        {r && r.content.nonObvious.length > 0 && (
          <>
            <h2>Hallazgos no evidentes</h2>
            <ul>{r.content.nonObvious.map((n, i) => <li key={i}><b>{n.title}.</b> <VText text={n.body} unverified={unverifiedFor(r.meta, `nonObvious.${i}`)} /></li>)}</ul>
          </>
        )}

        <h2>Insights</h2>
        <ul>{d.insights.slice(0, 10).map((i) => <li key={i.id}><b>{i.title}.</b> {i.action}</li>)}</ul>

        {r && (
          <>
            <h2>Acciones recomendadas</h2>
            <ol>{r.content.actions.map((a, i) => <li key={i}><b>{a.action}</b> {a.why}</li>)}</ol>
            <p className="faint" style={{ fontSize: 'var(--t-sm)' }}>Límites: {r.content.limits}</p>
          </>
        )}
        <p className="faint" style={{ fontSize: 'var(--t-xs)', marginTop: 32 }}>
          {r ? (r.meta.engine !== 'reglas' ? `Lectura generada por ${r.meta.model} sobre el paquete de evidencia calculado.` : 'Lectura generada por el motor de reglas SOC AI.') : ''} Las cifras provienen del dataset; los trabajadores están seudonimizados.
        </p>
      </article>
    </>
  );
}
