import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiResult, CompanyProfile, PeriodInfo, ShockPlan, WhatsHappening } from '@shared/types.ts';
import { send } from '../lib/api.ts';
import { useCompany } from '../lib/queries.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { useCan, useSession } from '../lib/session.tsx';
import { dateEs, monthLong, monthShort, n0, n1, pct } from '../lib/format.ts';
import { ErrorState, PageSkeleton, RiskBadge, TrendDelta, Skeleton, useToast, Spinner } from '../components/ui.tsx';
import { BarList, Columns, LineChart } from '../components/charts.tsx';
import { AiHeader, EvidenceButton } from '../components/ai.tsx';
import { PlanView, WhatsView } from '../components/aiviews.tsx';
import { EventsTable } from '../components/EventsTable.tsx';
import { PatternCard } from '../components/PatternCard.tsx';
import { YearTab } from '../components/YearTab.tsx';
import { useCompanionContext } from '../components/companion/CompanionDock.tsx';
import { useCompanion } from '../lib/companion.tsx';
import { AiSpark, IChat, ICompare, IPrint } from '../components/Icons.tsx';

type Tab = 'resumen' | 'anual' | 'que-pasa' | 'plan' | 'eventos';

export function Company() {
  const { key = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'resumen';
  const q = useCompany(key);
  useCompanionContext(q.data?.profile.summary.key, q.data?.profile.summary.name);
  const companion = useCompanion();
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { profile, period, whats, plan } = q.data;
  const s = profile.summary;
  const setTab = (t: Tab) => setParams(t === 'resumen' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <div className="faint" style={{ fontSize: 'var(--t-sm)', marginBottom: 4 }}><Link to="/empresas" style={{ color: 'inherit' }}>Empresas</Link> / perfil</div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <h1>{s.name}</h1>
            <RiskBadge level={s.score.level} score={s.score.score} />
          </div>
          <p className="sub">
            {s.nit ? `NIT ${s.nit}` : 'Sin NIT'}{s.municipality ? ` · ${s.municipality}` : ''}{s.advisor ? ` · Asesor ${s.advisor}` : ''} · Posición {s.rank} por accidentes · Primer evento {dateEs(s.first)}, último {dateEs(s.last)}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" to={`/comparar?c=${s.key}`}><ICompare />Comparar</Link>
          <Link className="btn" to={`/reportes/empresa/${s.key}`}><IPrint />Reporte</Link>
          <button className="btn btn-ai" onClick={() => companion.setOpen(true)}><IChat />Preguntar a Companion</button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {([['resumen', 'Resumen'], ...(profile.yearCompare ? [['anual', `${profile.yearCompare.yoy.previousYear} vs ${profile.yearCompare.yoy.currentYear}`]] : []), ['que-pasa', '¿Qué está pasando?'], ['plan', 'Plan de choque'], ['eventos', `Accidentes (${s.eventsAT + s.eventsEL})`]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {(t === 'que-pasa' || t === 'plan') && <AiSpark width={12} height={12} />}{label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <Summary p={profile} period={period} onGo={setTab} />}
      {tab === 'anual' && <YearTab p={profile} />}
      {tab === 'que-pasa' && <AiTab kind="whats" companyKey={s.key} result={whats} />}
      {tab === 'plan' && <AiTab kind="plan" companyKey={s.key} result={plan} />}
      {tab === 'eventos' && <div className="panel"><EventsTable filter={{ company: s.key }} showCompany={false} pageSize={30} /></div>}
    </>
  );
}

function Summary({ p, period, onGo }: { p: CompanyProfile; period: PeriodInfo; onGo: (t: Tab) => void }) {
  const s = p.summary;
  const open = useEvidence();
  const dpe = s.eventsAT ? s.daysLost / s.eventsAT : 0;
  const anomalyByMonth = new Map(p.anomalies.map((a) => [a.month, a.kind]));
  return (
    <>
      <section className="kpis">
        <button className="kpi" onClick={() => open({ title: `Accidentes de ${s.name}`, eventIds: p.eventIds })}>
          <div className="kpi-label">Accidentes de trabajo</div>
          <div className="kpi-value">{n0(s.eventsAT)}</div>
          <div className="kpi-meta">{pct(s.share)} del portafolio · percentil {pct(p.peers.percentileEvents, 0)}</div>
        </button>
        <div className="kpi">
          <div className="kpi-label">Evolución entre semestres</div>
          <div className="kpi-value">{s.trend.previous} → {s.trend.recent}</div>
          <div className="kpi-meta"><TrendDelta trend={s.trend} /> {s.trend.significant ? 'significativo' : 'no significativo'}</div>
        </div>
        <button className="kpi" onClick={() => open({ title: 'Eventos graves', subtitle: 'Quirúrgicos, hospitalarios, UCI, ≥ 30 días de incapacidad o PCL > 0.', eventIds: p.severeEvents.map((e) => e.id) })}>
          <div className="kpi-label">Eventos graves</div>
          <div className="kpi-value">{n0(s.severe)}</div>
          <div className="kpi-meta">{n0(s.daysLost)} días de incapacidad</div>
        </button>
        <div className="kpi">
          <div className="kpi-label">Días por accidente</div>
          <div className="kpi-value">{n1(dpe)}</div>
          <div className="kpi-meta">Portafolio: {n1(p.peers.globalDaysPerEvent)}</div>
        </div>
        <button className="kpi" onClick={() => open({ title: 'Trabajadores reincidentes', subtitle: 'Seudonimizados: no se muestran nombres ni documentos.', eventIds: p.repeatWorkers.flatMap((w) => w.eventIds) })}>
          <div className="kpi-label">Trabajadores reincidentes</div>
          <div className="kpi-value">{n0(s.repeatWorkers)}</div>
          <div className="kpi-meta">de {n0(s.workers)} trabajadores accidentados</div>
        </button>
        <div className="kpi">
          <div className="kpi-label">Gestión SOC</div>
          <div className="kpi-value text">{s.contactStatus ?? 'Sin dato'}</div>
          <div className="kpi-meta">{s.contactGap ? 'Sin cita ejecutada en la mayoría' : `${s.eventsEL ? `${s.eventsEL} enfermedad(es) laboral(es)` : 'Estado más frecuente'}`}</div>
        </div>
      </section>

      <section className="section grid-main">
        <div className="panel">
          <div className="panel-head"><div><h2>Línea temporal</h2><p className="question">¿Cómo evolucionaron los accidentes? Los puntos rojos son meses anómalos.</p></div></div>
          <div className="panel-body">
            <LineChart
              ariaLabel={`Accidentes por mes de ${s.name}`}
              points={p.monthly.map((m) => ({ label: monthShort(m.month), value: m.count, tip: `${m.severe} graves · ${n0(m.days)} días`, flag: anomalyByMonth.get(m.month) as 'spike' | 'drop' | undefined }))}
              height={220}
            />
            {(p.anomalies.length > 0 || p.clusters.length > 0) && (
              <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                {p.anomalies.map((a, i) => <div key={i} className="notice" style={{ padding: '8px 12px' }}><span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>{a.kind === 'spike' ? 'Pico' : 'Caída'}:</b> {a.label} (Poisson p = {a.pValue.toFixed(4).replace('.', ',')})</span></div>)}
                {p.clusters.slice(0, 4).map((c, i) => (
                  <div key={`c${i}`} className="notice" style={{ padding: '8px 12px', justifyContent: 'space-between' }}>
                    <span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>Racha:</b> {c.count} eventos de {c.mechGroup ? labelOf(p, c.mechGroup).toLowerCase() : ''} en {c.days} días ({dateEs(c.start)} a {dateEs(c.end)})</span>
                    <EvidenceButton label="Registros" onClick={() => open({ title: 'Racha de eventos', eventIds: c.eventIds })} />
                  </div>
                ))}
                {p.clusters.length > 4 && <p className="faint" style={{ fontSize: 'var(--t-sm)' }}>Y {p.clusters.length - 4} rachas más en la sección Recurrencias.</p>}
              </div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div><h2>Por qué este nivel</h2><p className="question">Puntaje explicable: cada factor suma sus puntos.</p></div>
            <span className="score-num">{s.score.score}<small>/100</small></span>
          </div>
          <div className="panel-body">
            {s.score.factors.map((f) => (
              <div className="factor" key={f.id}>
                <span className="fl">{f.label}</span>
                <span className="fp">+{f.points}<span className="faint" style={{ fontWeight: 500, fontSize: 'var(--t-xs)' }}>/{f.weight}</span></span>
                <span className="meter"><i style={{ width: `${f.value * 100}%` }} /></span>
                <span className="fr">{f.reason}</span>
              </div>
            ))}
            {s.score.caps.map((c, i) => <p key={i} className="notice" style={{ marginTop: 10 }}>{c}</p>)}
            <div className="row" style={{ marginTop: 14, gap: 8 }}>
              <button className="btn btn-ai btn-sm" onClick={() => onGo('que-pasa')}><AiSpark width={13} height={13} />¿Qué está pasando?</button>
              <button className="btn btn-sm" onClick={() => onGo('plan')}>Plan de choque</button>
            </div>
          </div>
        </div>
      </section>

      <section className="section grid-3">
        <div className="panel">
          <div className="panel-head"><div><h3>Mecanismos</h3><p className="question">¿Qué tipo de accidente ocurre?</p></div></div>
          <div className="panel-body">
            <BarList items={p.mechanisms.map((m) => ({ key: m.key, label: m.label, count: m.count, share: m.share }))} muted={(it) => it.key === 'sin-info' || it.key === 'otro'}
              onSelect={(it) => open({ title: `${it.label} en ${s.name}`, filter: { company: s.key, mechGroup: it.key } })} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Centros de trabajo</h3><p className="question">¿Dónde ocurre?</p></div></div>
          <div className="panel-body">
            <BarList items={p.workCenters.map((m) => ({ key: m.key, label: m.label, count: m.count, share: m.share }))}
              onSelect={(it) => open({ title: `${it.label}`, filter: { company: s.key, workCenter: it.key } })} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Severidad</h3><p className="question">¿Qué atención requirieron?</p></div></div>
          <div className="panel-body">
            <BarList items={p.careLevels.map((m) => ({ key: m.key, label: m.label, count: m.count, share: m.share }))}
              onSelect={(it) => open({ title: `${it.label}`, filter: { company: s.key, careLevel: it.key } })} />
          </div>
        </div>
      </section>

      <section className="section grid-2">
        <div className="panel">
          <div className="panel-head"><div><h3>Día de la semana</h3><p className="question">¿Hay días con más accidentes?</p></div></div>
          <div className="panel-body"><Columns ariaLabel="Accidentes por día" items={p.weekdays.map((d) => ({ label: d.label.slice(0, 3), value: d.count }))} height={170} /></div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Comparación con el portafolio</h3><p className="question">¿Cómo se ubica frente a las demás empresas?</p></div></div>
          <div className="panel-body stack" style={{ gap: 14 }}>
            <PeerBar label="Número de accidentes" value={p.peers.percentileEvents} />
            <PeerBar label="Severidad media por accidente" value={p.peers.percentileSeverity} />
            <PeerBar label="Días por accidente frente al portafolio" value={Math.min(1, (p.peers.daysPerEvent / Math.max(0.1, p.peers.globalDaysPerEvent)) / 3)} text={`${n1(p.peers.daysPerEvent)} vs ${n1(p.peers.globalDaysPerEvent)}`} />
            {p.elEvents.length > 0 && <p className="notice">{p.elEvents.length} enfermedad(es) laboral(es) calificada(s); se cuentan aparte de los accidentes.</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title"><div><h2>Recurrencias</h2><p className="question">¿Qué patrón se repite en esta empresa?</p></div></div>
        <div className="panel">
          {p.patterns.map((pt) => <PatternCard key={pt.id} p={pt} />)}
          {!p.patterns.length && <p className="muted" style={{ padding: 20 }}>No hay patrones estadísticamente relevantes: con {s.eventsAT} accidente(s) los eventos no se concentran más de lo esperado.</p>}
        </div>
      </section>

      {p.repeatWorkers.length > 0 && (
        <section className="section">
          <div className="section-title"><div><h2>Trabajadores reincidentes</h2><p className="question">Seudónimos estables: el mismo trabajador conserva su código en todo el dataset.</p></div></div>
          <div className="panel">
            <table className="data">
              <thead><tr><th>Trabajador</th><th className="r">Accidentes</th><th>Mecanismos</th><th /></tr></thead>
              <tbody>
                {p.repeatWorkers.map((w) => (
                  <tr key={w.worker}>
                    <td className="mono">{w.worker}</td>
                    <td className="r"><b>{w.count}</b></td>
                    <td>{w.mechGroups.join(', ')}</td>
                    <td className="r"><EvidenceButton label="Registros" onClick={() => open({ title: `Trabajador ${w.worker}`, eventIds: w.eventIds })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {p.severeEvents.length > 0 && (
        <section className="section">
          <div className="section-title"><div><h2>Eventos graves</h2><p className="question">Ordenados por severidad.</p></div></div>
          <div className="panel"><EventsTable filter={{ ids: p.severeEvents.map((e) => e.id) }} showCompany={false} pageSize={10} /></div>
        </section>
      )}
      <p className="faint" style={{ fontSize: 'var(--t-sm)', marginTop: 24 }}>Semestres comparados: {period.recent.label} frente a {period.previous.label}.{period.partialMonth ? ` ${monthLong(period.partialMonth)} incompleto, excluido.` : ''}</p>
    </>
  );
}

function labelOf(p: CompanyProfile, key: string) {
  return p.mechanisms.find((m) => m.key === key)?.label ?? key;
}

function PeerBar({ label, value, text }: { label: string; value: number; text?: string }) {
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 'var(--t-md)', marginBottom: 6 }}>
        <span>{label}</span><span className="num muted">{text ?? `percentil ${Math.round(value * 100)}`}</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'var(--surface-3)', borderRadius: 4 }}>
        <div style={{ position: 'absolute', left: `calc(${Math.min(100, value * 100)}% - 5px)`, top: -3, width: 10, height: 14, borderRadius: 3, background: 'var(--ink)' }} />
      </div>
    </div>
  );
}

function AiTab({ kind, companyKey, result }: { kind: 'whats' | 'plan'; companyKey: string; result: AiResult<WhatsHappening> | AiResult<ShockPlan> | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan('analista');
  const { ai } = useSession();
  const gen = useMutation({
    mutationFn: (opts: { force?: boolean; engine?: 'auto' | 'reglas' }) => send<AiResult<WhatsHappening | ShockPlan>>('POST', `/ai/company/${companyKey}/${kind}`, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company', companyKey] }),
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo generar el análisis.'),
  });
  const title = kind === 'whats' ? '¿Qué está pasando?' : 'Plan de choque';

  if (!result) {
    return (
      <div className="ai-block">
        <AiHeader title={title} />
        <div className="ai-body">
          {gen.isPending ? (
            <div className="stack" aria-busy="true">
              <p className="muted row" style={{ gap: 8 }}><Spinner />{ai.enabled ? `${ai.model} está analizando el paquete de evidencia de la empresa…` : 'Aplicando el motor de reglas…'}</p>
              <Skeleton h={22} w="65%" /><Skeleton h={60} /><Skeleton h={140} />
            </div>
          ) : (
            <>
              <p className="muted" style={{ maxWidth: '68ch', marginBottom: 14 }}>
                {kind === 'whats'
                  ? 'SOC AI interpreta las estadísticas de la empresa y separa datos, patrones, hallazgos, hipótesis y recomendaciones. Cada cifra se verifica contra el dataset.'
                  : 'SOC AI arma un plan con acciones inmediatas, de corto plazo y estructurales, enfocado en los problemas que muestran los datos de esta empresa.'}
              </p>
              {can ? (
                <div className="row">
                  <button className="btn btn-ai" onClick={() => gen.mutate({})}><AiSpark width={13} height={13} />{kind === 'whats' ? 'Analizar empresa' : 'Generar plan de choque'}</button>
                  {!ai.enabled && <span className="faint" style={{ fontSize: 'var(--t-sm)' }}>Se usará el motor de reglas (Claude no está configurado).</span>}
                </div>
              ) : <p className="faint">Tu rol es de solo lectura; pide a un analista que genere este análisis.</p>}
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="ai-block">
      <AiHeader title={title} meta={result.meta} onRegenerate={can ? () => gen.mutate({ force: true }) : undefined} busy={gen.isPending}>
        {kind === 'plan' && <Link className="btn btn-sm" to={`/reportes/empresa/${companyKey}`}><IPrint />Exportar</Link>}
      </AiHeader>
      <div className="ai-body" style={{ opacity: gen.isPending ? 0.5 : 1, transition: 'opacity 200ms ease' }}>
        {kind === 'whats' ? <WhatsView r={result as AiResult<WhatsHappening>} /> : <PlanView r={result as AiResult<ShockPlan>} />}
      </div>
    </div>
  );
}
