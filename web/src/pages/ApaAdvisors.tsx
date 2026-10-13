// Vista dedicada a los asesores APA: los tres lado a lado y la cartera de cada uno.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ApaAdvisor, PeriodInfo } from '@shared/types.ts';
import { get } from '../lib/api.ts';
import { useCompanies } from '../lib/queries.ts';
import { useAdvisor } from '../lib/advisor.tsx';
import { monthShort, n0, n1, pct } from '../lib/format.ts';
import { Delta, ErrorState, PageSkeleton, RiskBadge, TrendDelta } from '../components/ui.tsx';
import { COMPARE_COLORS, MultiLine } from '../components/charts.tsx';
import { IArrowRight } from '../components/Icons.tsx';

const swatch = (i: number) => <i style={{ width: 10, height: 10, borderRadius: 2, background: COMPARE_COLORS[i], display: 'inline-block', flex: 'none' }} aria-hidden="true" />;

export function ApaAdvisors() {
  const q = useQuery({ queryKey: ['advisors-apa'], queryFn: () => get<{ advisors: ApaAdvisor[]; period: PeriodInfo }>('/advisors/apa') });
  const companies = useCompanies();
  const nav = useNavigate();
  const [, setAdvisor] = useAdvisor();
  const [selected, setSelected] = useState(0);
  const [limit, setLimit] = useState(15);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const list = q.data.advisors;
  const ytd = q.data.period.ytd;
  const prevYear = ytd?.previousYear.start.slice(0, 4) ?? '';
  const curYear = ytd?.current.start.slice(0, 4) ?? '';
  if (!list.length) return <div className="panel"><div className="empty"><h3>El dataset no trae asesores APA</h3><p>Se necesita la columna "ASESOR APA" con nombres.</p></div></div>;
  const sel = list[Math.min(selected, list.length - 1)]!;
  const byKey = new Map((companies.data?.companies ?? []).map((s) => [s.key, s]));
  const total = list.reduce((a, x) => a + x.events, 0);
  const mechKeys = [...new Set(list.flatMap((a) => a.mechanisms.filter((m) => m.key !== 'sin-info' && m.key !== 'otro').slice(0, 4).map((m) => m.key)))].slice(0, 8);
  const mechLabel = (k: string) => list.flatMap((a) => a.mechanisms).find((m) => m.key === k)?.label ?? k;

  const row = (label: string, cell: (a: ApaAdvisor) => React.ReactNode) => (
    <tr><td className="muted" style={{ whiteSpace: 'nowrap' }}>{label}</td>{list.map((a) => <td key={a.key} className="r">{cell(a)}</td>)}</tr>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Asesores APA</h1>
          <p className="sub">
            {list.map((a) => a.name).join(', ')}: {n0(total)} accidentes de trabajo en sus carteras, contados con el asesor APA de cada registro.
            {ytd && ` La comparación anual usa los mismos meses: ${ytd.previousYear.label} frente a ${ytd.current.label}.`}
          </p>
        </div>
        <Link className="btn" to="/asesores">Todos los asesores<IArrowRight /></Link>
      </div>

      <section className="grid-3" aria-label="Asesores APA">
        {list.map((a, i) => {
          const top = a.companiesList[0];
          const active = i === selected;
          return (
            <button key={a.key} type="button" className="panel panel-pad" onClick={() => setSelected(i)} aria-pressed={active}
              style={{ textAlign: 'left', cursor: 'pointer', borderColor: active ? 'var(--ink)' : undefined, boxShadow: active ? '0 0 0 1px var(--ink)' : undefined, transition: 'border-color 150ms ease, box-shadow 150ms ease' }}>
              <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 8 }}>{swatch(i)}<b style={{ fontSize: 'var(--t-lg)', fontWeight: 650 }}>{a.name}</b></span>
                <span className="faint" style={{ fontSize: 'var(--t-sm)' }}>{pct(total ? a.events / total : 0, 0)} del total APA</span>
              </div>
              <div className="row" style={{ gap: 24, marginTop: 14, alignItems: 'flex-end' }}>
                <div><div className="kpi-label">Accidentes</div><div className="kpi-value">{n0(a.events)}</div></div>
                <div><div className="kpi-label">Empresas</div><div className="kpi-value">{n0(a.companies)}</div></div>
                <div><div className="kpi-label">Críticas / prioritarias</div><div className="kpi-value"><span style={{ color: a.critical ? 'var(--crit-ink)' : undefined }}>{a.critical}</span> / {a.priority}</div></div>
              </div>
              <hr className="divider" style={{ margin: '14px 0 10px' }} />
              <div className="stack" style={{ gap: 6, fontSize: 'var(--t-md)' }}>
                {ytd && (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Ene–{ytd.current.label.split(' – ')[1]?.slice(0, 3)} {prevYear} → {curYear}</span>
                    <span className="num">{a.yoyPrevious} → <b>{a.yoyCurrent}</b> <Delta value={a.yoyPrevious ? (a.yoyCurrent - a.yoyPrevious) / a.yoyPrevious : null} /></span>
                  </div>
                )}
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Último semestre</span><span className="num">{a.trend.previous} → <b>{a.trend.recent}</b> <TrendDelta trend={a.trend} /></span></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Eventos graves</span><span className="num">{a.severe} · {n1(a.daysPerEvent)} días por accidente</span></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Citas ejecutadas</span><span className="num">{pct(a.contactDone, 0)}{a.contactGapCompanies ? <span className="tag alta" style={{ marginLeft: 6 }}>{a.contactGapCompanies} sin cita</span> : null}</span></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Enfermedades laborales</span><span className="num">{a.elEvents}{a.elEvents ? ` en ${a.elCompanies} empresa${a.elCompanies > 1 ? 's' : ''}` : ''}</span></div>
                {top && <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span className="muted">Más accidentes</span><span style={{ textAlign: 'right', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.name} ({top.events})</span></div>}
              </div>
            </button>
          );
        })}
      </section>

      <section className="section grid-main">
        <div className="panel">
          <div className="panel-head"><div><h2>Evolución mensual</h2><p className="question">¿Cuál cartera sube y cuál baja?</p></div></div>
          <div className="panel-body">
            <MultiLine ariaLabel="Accidentes por mes de cada asesor APA" height={250} labels={sel.months.map(monthShort)}
              series={list.map((a, i) => ({ name: a.name, values: a.monthly, color: COMPARE_COLORS[i]! }))} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Lado a lado</h2><p className="question">Los mismos indicadores para los tres.</p></div></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Indicador</th>{list.map((a, i) => <th key={a.key} className="r"><span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>{swatch(i)}{a.name.split(' ')[0]}</span></th>)}</tr></thead>
              <tbody>
                {row('Accidentes', (a) => <b>{n0(a.events)}</b>)}
                {ytd && row(`${prevYear} completo`, (a) => n0(a.previousFullYear))}
                {ytd && row(`Ene–sep ${prevYear} → ${curYear}`, (a) => <>{a.yoyPrevious} → <b>{a.yoyCurrent}</b></>)}
                {row('Empresas', (a) => a.companies)}
                {row('Graves', (a) => a.severe)}
                {row('Días por accidente', (a) => n1(a.daysPerEvent))}
                {row('Trabajadores reincidentes', (a) => a.repeatWorkers)}
                {row('Citas ejecutadas', (a) => pct(a.contactDone, 0))}
                {row('Enfermedades laborales', (a) => a.elEvents)}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section panel">
        <div className="panel-head"><div><h2>Mecanismos</h2><p className="question">¿Qué tipo de accidente pesa más en cada cartera? Proporción de sus accidentes.</p></div></div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Mecanismo</th>{list.map((a, i) => <th key={a.key} className="r"><span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>{swatch(i)}{a.name}</span></th>)}</tr></thead>
            <tbody>
              {mechKeys.map((k) => (
                <tr key={k}>
                  <td>{mechLabel(k)}</td>
                  {list.map((a, i) => {
                    const m = a.mechanisms.find((x) => x.key === k);
                    return (
                      <td key={a.key} className="r">
                        <span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                          <span className="num">{m ? `${m.count} · ${pct(m.share, 0)}` : '–'}</span>
                          <span style={{ width: 56, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', display: 'inline-block' }} aria-hidden="true">
                            <span style={{ display: 'block', height: '100%', width: `${(m?.share ?? 0) * 100}%`, background: COMPARE_COLORS[i] }} />
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <div><h2>Cartera de {sel.name}</h2><p className="question">{sel.companies} empresas, ordenadas por accidentes. Elige otro asesor en las tarjetas de arriba.</p></div>
          <div className="row">
            <div className="seg" role="group" aria-label="Asesor APA">
              {list.map((a, i) => <button key={a.key} aria-pressed={i === selected} onClick={() => { setSelected(i); setLimit(15); }}>{a.name.split(' ')[0]}</button>)}
            </div>
            <button className="btn btn-sm" onClick={() => { setAdvisor(sel.key); nav('/empresas?vista=anual'); }}>Ver en Empresas<IArrowRight /></button>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr><th>Empresa</th><th>Riesgo</th><th className="r">Accidentes</th>{ytd && <th className="r">{prevYear} completo</th>}{ytd && <th className="r">{prevYear} → {curYear} (mismos meses)</th>}<th>Gestión SOC</th></tr>
            </thead>
            <tbody>
              {sel.companiesList.slice(0, limit).map((c) => {
                const s = byKey.get(c.key);
                return (
                  <tr key={c.key} className="clickable" onClick={() => nav(`/empresas/${c.key}`)}>
                    <td style={{ maxWidth: 320 }}><Link className="name" to={`/empresas/${c.key}`} onClick={(e) => e.stopPropagation()} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</Link></td>
                    <td><RiskBadge level={c.level} score={c.score} /></td>
                    <td className="r"><b>{c.events}</b></td>
                    {ytd && <td className="r">{c.previousFullYear}</td>}
                    {ytd && <td className="r num">{c.yoyPrevious} → <b>{c.yoyCurrent}</b></td>}
                    <td style={{ whiteSpace: 'nowrap' }}>{s?.contactGap ? <span className="tag alta">{s.contactStatus}</span> : <span className="muted">{s?.contactStatus ?? '–'}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sel.companiesList.length > limit && (
          <div className="table-foot">
            <span>Mostrando {limit} de {sel.companiesList.length}</span>
            <button className="btn btn-sm" onClick={() => setLimit(limit + 50)}>Mostrar 50 más</button>
          </div>
        )}
      </section>
    </>
  );
}
