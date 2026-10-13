import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AdvisorSummary, PeriodInfo } from '@shared/types.ts';
import { get } from '../lib/api.ts';
import { useCompanies } from '../lib/queries.ts';
import { useAdvisor } from '../lib/advisor.tsx';
import { n0, pct } from '../lib/format.ts';
import { Delta, ErrorState, PageSkeleton, RiskBadge, Seg } from '../components/ui.tsx';
import { IArrowRight } from '../components/Icons.tsx';

type SortKey = 'events' | 'companies' | 'full' | 'cur' | 'diff' | 'severe' | 'risk' | 'contact' | 'name';

export function Advisors() {
  const q = useQuery({ queryKey: ['advisors'], queryFn: () => get<{ advisors: AdvisorSummary[]; period: PeriodInfo }>('/advisors') });
  const companies = useCompanies();
  const nav = useNavigate();
  const [, setAdvisor] = useAdvisor();
  const [role, setRole] = useState<'asignado' | 'apa'>('asignado');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'events', desc: true });
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = (q.data?.advisors ?? []).filter((a) => a.role === role);
    const val = (a: AdvisorSummary): number | string => ({
      events: a.events, companies: a.companies, full: a.previousFullYear, cur: a.yoyCurrent, diff: a.yoyCurrent - a.yoyPrevious,
      severe: a.severe, risk: a.critical * 100 + a.priority, contact: a.contactDone, name: a.name,
    })[sort.key];
    return [...list].sort((x, y) => { const r = val(x) < val(y) ? -1 : val(x) > val(y) ? 1 : 0; return sort.desc ? -r : r; });
  }, [q.data, role, sort]);

  if (q.isLoading || companies.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const ytd = q.data.period.ytd;
  const prevYear = ytd ? ytd.previousYear.start.slice(0, 4) : '';
  const curYear = ytd ? ytd.current.start.slice(0, 4) : '';
  const max = Math.max(1, ...rows.map((r) => r.events));
  const all = companies.data?.companies ?? [];
  const topPrev = [...all].filter((s) => s.yoy).sort((a, b) => b.yoy!.previousFullYear - a.yoy!.previousFullYear)[0];
  const topCur = [...all].filter((s) => s.yoy).sort((a, b) => b.yoy!.current - a.yoy!.current)[0];
  const leader = rows.filter((r) => !/^sin asesor/i.test(r.name)).sort((a, b) => b.events - a.events)[0];

  const th = (key: SortKey, label: string, right = true) => (
    <th className={right ? 'r' : undefined} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}>{label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button>
    </th>
  );
  const seeCompanies = (a: AdvisorSummary) => { setAdvisor(a.key); nav('/empresas?vista=anual'); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Asesores</h1>
          <p className="sub">Accidentes de las empresas que atiende cada asesor, contados con el asesor que figura en cada registro. {ytd && `La comparación anual usa los mismos meses: ${ytd.previousYear.label} frente a ${ytd.current.label}.`}</p>
        </div>
        <div className="page-actions"><Link className="btn" to="/asesores-apa">Vista Asesores APA<IArrowRight /></Link>
        <Seg label="Rol del asesor" value={role} onChange={(v) => { setRole(v); setOpen(null); }} options={[{ value: 'asignado', label: 'Asesor asignado' }, { value: 'apa', label: 'Asesor APA' }]} /></div>
      </div>

      <section className="kpis kpis-4" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-label">Asesores {role === 'apa' ? 'APA' : 'asignados'}</div>
          <div className="kpi-value">{rows.filter((r) => !/^sin asesor/i.test(r.name)).length}</div>
          <div className="kpi-meta">{role === 'asignado' && rows.find((r) => r.name === 'Sin asesor asignado') ? `${n0(rows.find((r) => r.name === 'Sin asesor asignado')!.events)} accidentes sin asesor asignado` : 'con empresas en el dataset'}</div>
        </div>
        {leader && (
          <button className="kpi" onClick={() => setOpen(leader.key)}>
            <div className="kpi-label">Asesor con más accidentes</div>
            <div className="kpi-value text">{leader.name}</div>
            <div className="kpi-meta">{n0(leader.events)} accidentes en {leader.companies} empresas</div>
          </button>
        )}
        {topPrev?.yoy && (
          <Link className="kpi" to={`/empresas/${topPrev.key}?tab=anual`} style={{ textDecoration: 'none' }}>
            <div className="kpi-label">Empresa con más accidentes en {prevYear}</div>
            <div className="kpi-value text">{topPrev.name}</div>
            <div className="kpi-meta">{n0(topPrev.yoy.previousFullYear)} accidentes en {prevYear} completo</div>
          </Link>
        )}
        {topCur?.yoy && (
          <Link className="kpi" to={`/empresas/${topCur.key}?tab=anual`} style={{ textDecoration: 'none' }}>
            <div className="kpi-label">Empresa con más accidentes en {curYear}</div>
            <div className="kpi-value text">{topCur.name}</div>
            <div className="kpi-meta">{n0(topCur.yoy.current)} en {topCur.yoy.currentLabel}</div>
          </Link>
        )}
      </section>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {th('name', 'Asesor', false)}
                {th('companies', 'Empresas')}
                {th('events', 'Accidentes')}
                {ytd && th('full', `${prevYear} completo`)}
                {ytd && th('cur', `Ene–${ytd.current.label.split(' – ')[1]?.slice(0, 3)} ${prevYear} → ${curYear}`)}
                {ytd && th('diff', 'Cambio')}
                {th('severe', 'Graves')}
                {th('risk', 'Críticas / prioritarias')}
                {th('contact', 'Citas ejecutadas')}
                <th>Empresa con más accidentes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const top = a.companiesList[0];
                const isOpen = open === a.key;
                return (
                  <Fragment key={a.key}>
                    <tr className="clickable" onClick={() => setOpen(isOpen ? null : a.key)} aria-expanded={isOpen}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{isOpen ? '▾' : '▸'} {a.name}</td>
                      <td className="r">{a.companies}</td>
                      <td className="r">
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                          <span style={{ width: 70, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', display: 'inline-block' }} aria-hidden="true">
                            <span style={{ display: 'block', height: '100%', width: `${(a.events / max) * 100}%`, background: 'var(--data)' }} />
                          </span>
                          <b>{n0(a.events)}</b>
                        </div>
                      </td>
                      {ytd && <td className="r">{n0(a.previousFullYear)}</td>}
                      {ytd && <td className="r num">{n0(a.yoyPrevious)} → <b>{n0(a.yoyCurrent)}</b></td>}
                      {ytd && <td className="r">{a.yoyPrevious === 0 && a.yoyCurrent > 0 ? <span className="delta up">nuevo</span> : <Delta value={a.yoyPrevious ? (a.yoyCurrent - a.yoyPrevious) / a.yoyPrevious : null} />}</td>}
                      <td className="r">{a.severe}</td>
                      <td className="r">{a.critical ? <b style={{ color: 'var(--crit-ink)' }}>{a.critical}</b> : 0} / {a.priority}</td>
                      <td className="r">{pct(a.contactDone, 0)}</td>
                      <td style={{ maxWidth: 260 }}>
                        {top && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Link className="name" to={`/empresas/${top.key}`} onClick={(e) => e.stopPropagation()}>{top.name}</Link> <span className="faint num">({top.events})</span></div>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={10} style={{ background: 'var(--surface-2)', padding: '12px 16px', height: 'auto' }}>
                          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                            <b style={{ fontWeight: 600 }}>Empresas de {a.name} ({a.companies})</b>
                            <button className="btn btn-sm" onClick={() => seeCompanies(a)}>Ver su cartera año contra año<IArrowRight /></button>
                          </div>
                          <table className="data" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }}>
                            <thead><tr><th>Empresa</th><th>Riesgo</th><th className="r">Accidentes</th>{ytd && <th className="r">{prevYear} completo</th>}{ytd && <th className="r">{prevYear} → {curYear} (mismos meses)</th>}</tr></thead>
                            <tbody>
                              {a.companiesList.slice(0, 12).map((c) => (
                                <tr key={c.key} className="clickable" onClick={() => nav(`/empresas/${c.key}?tab=anual`)}>
                                  <td><Link className="name" to={`/empresas/${c.key}`} onClick={(e) => e.stopPropagation()}>{c.name}</Link></td>
                                  <td><RiskBadge level={c.level} score={c.score} /></td>
                                  <td className="r"><b>{c.events}</b></td>
                                  {ytd && <td className="r">{c.previousFullYear}</td>}
                                  {ytd && <td className="r num">{c.yoyPrevious} → <b>{c.yoyCurrent}</b></td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {a.companiesList.length > 12 && <p className="faint" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>Y {a.companiesList.length - 12} empresas más en su cartera.</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
