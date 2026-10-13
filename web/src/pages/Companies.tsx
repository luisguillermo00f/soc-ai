import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { CompanySummary, RiskLevel } from '@shared/types.ts';
import { useCompanies } from '../lib/queries.ts';
import { AdvisorSelect, advisorLabel, matchAdvisor, useAdvisor } from '../lib/advisor.tsx';
import { LEVEL_LABEL, LEVELS, n0, pct, signedPct } from '../lib/format.ts';
import { Delta, ErrorState, PageSkeleton, RiskBadge, Seg, TrendDelta } from '../components/ui.tsx';
import { Sparkline } from '../components/charts.tsx';
import { IArrowDown, IArrowUp, IDownload } from '../components/Icons.tsx';

type View = 'riesgo' | 'anual';
type SortKey = 'score' | 'events' | 'trend' | 'severe' | 'days' | 'repeat' | 'name' | 'yPrev' | 'yCur' | 'yDiff' | 'yPct' | 'yFull';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function exportCsv(rows: CompanySummary[]) {
  const y = rows.find((r) => r.yoy)?.yoy;
  const head = ['Empresa', 'NIT', 'Nivel', 'Puntaje', 'Accidentes AT', 'EL', 'Semestre anterior', 'Último semestre',
    ...(y ? [`${y.previousYear} completo`, y.previousLabel, y.currentLabel, 'Cambio año contra año'] : []),
    'Graves', 'Días de incapacidad', 'Trabajadores reincidentes', 'Mecanismo principal', 'Gestión SOC', 'Asesores asignados', 'Asesores APA'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((s) => [s.name, s.nit, LEVEL_LABEL[s.score.level], s.score.score, s.eventsAT, s.eventsEL, s.trend.previous, s.trend.recent,
    ...(y ? [s.yoy?.previousFullYear, s.yoy?.previous, s.yoy?.current, s.yoy?.change === null || !s.yoy ? '' : signedPct(s.yoy.change)] : []),
    s.severe, s.daysLost, s.repeatWorkers, s.topMechanism, s.contactStatus, s.advisors.join(', '), s.apaAdvisors.join(', ')].map(esc).join(';'));
  const blob = new Blob([`﻿${head.map(esc).join(';')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'soc-ai-empresas.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Companies() {
  const q = useCompanies();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const level = (params.get('nivel') ?? 'todos') as RiskLevel | 'todos';
  const search = params.get('q') ?? '';
  const view = (params.get('vista') ?? 'riesgo') as View;
  const [advisor, setAdvisor] = useAdvisor();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>(() => (view === 'anual' ? { key: 'yDiff', desc: true } : { key: 'score', desc: true }));
  const [limit, setLimit] = useState(60);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (!v || v === 'todos' || (k === 'vista' && v === 'riesgo')) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };
  const setView = (v: View) => {
    setParam('vista', v);
    setSort(v === 'anual' ? { key: 'yDiff', desc: true } : { key: 'score', desc: true });
  };

  const filtered = useMemo(() => {
    const f = fold(search);
    return (q.data?.companies ?? []).filter((s) => (level === 'todos' || s.score.level === level)
      && matchAdvisor(s, advisor)
      && (!f || fold(s.name).includes(f) || (s.nit ?? '').includes(f)));
  }, [q.data, level, search, advisor]);

  const rows = useMemo(() => {
    const val = (s: CompanySummary): number | string => {
      const y = s.yoy;
      switch (sort.key) {
        case 'score': return s.score.score;
        case 'events': return s.eventsAT;
        case 'trend': return s.trend.recent - s.trend.previous;
        case 'severe': return s.severe;
        case 'days': return s.daysLost;
        case 'repeat': return s.repeatWorkers;
        case 'name': return s.name;
        case 'yPrev': return y?.previous ?? -1;
        case 'yCur': return y?.current ?? -1;
        case 'yFull': return y?.previousFullYear ?? -1;
        case 'yDiff': return y ? y.current - y.previous : -1e9;
        case 'yPct': return y?.change ?? (y && y.current > 0 ? 1e6 : -1e9);
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.desc ? -r : r;
    });
  }, [filtered, sort]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const th = (key: SortKey, label: string, right = false) => (
    <th className={right ? 'r' : undefined} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}>{label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button>
    </th>
  );
  const base = (q.data.companies ?? []).filter((s) => matchAdvisor(s, advisor));
  const counts = LEVELS.map((l) => ({ l, n: base.filter((s) => s.score.level === l).length }));
  const sample = q.data.companies.find((s) => s.yoy)?.yoy;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Empresas</h1>
          <p className="sub">
            {view === 'riesgo'
              ? 'Ordenadas por puntaje de riesgo SOC AI. La tendencia compara los últimos 6 meses completos con los 6 anteriores; el asterisco indica un cambio significativo.'
              : sample
                ? `Cada empresa en ${sample.currentLabel} frente a ${sample.previousLabel}: los mismos meses, porque ${sample.currentYear} aún no termina. El total de ${sample.previousYear} completo se muestra como referencia.`
                : 'El dataset no cubre dos años para comparar los mismos meses.'}
          </p>
        </div>
        <div className="page-actions">
          <Seg label="Vista" value={view} onChange={setView} options={[{ value: 'riesgo', label: 'Riesgo' }, { value: 'anual', label: sample ? `${sample.previousYear} vs ${sample.currentYear}` : 'Año contra año' }]} />
          <button className="btn" onClick={() => exportCsv(rows)}><IDownload />Exportar CSV</button>
        </div>
      </div>

      <div className="filters">
        <input className="input" placeholder="Buscar por nombre o NIT" value={search} onChange={(e) => setParam('q', e.target.value)} aria-label="Buscar empresa" />
        <AdvisorSelect value={advisor} onChange={setAdvisor} />
        <div className="seg" role="group" aria-label="Nivel de riesgo">
          <button aria-pressed={level === 'todos'} onClick={() => setParam('nivel', 'todos')}>Todas</button>
          {counts.map(({ l, n }) => <button key={l} aria-pressed={level === l} onClick={() => setParam('nivel', l)}>{LEVEL_LABEL[l]} <span className="num faint">{n}</span></button>)}
        </div>
        <span className="faint num" style={{ marginLeft: 'auto', fontSize: 'var(--t-sm)' }}>{n0(rows.length)} empresas</span>
      </div>

      {view === 'anual' && sample && <YearSummary rows={filtered} advisor={advisor} />}

      <div className="panel">
        <div className="table-wrap">
          {view === 'riesgo' ? (
            <table className="data">
              <thead>
                <tr>
                  {th('name', 'Empresa')}
                  {th('score', 'Riesgo')}
                  {th('events', 'Accidentes', true)}
                  {th('trend', 'Tendencia')}
                  <th>Mecanismo principal</th>
                  {th('severe', 'Graves', true)}
                  {th('days', 'Días', true)}
                  {th('repeat', 'Reincid.', true)}
                  <th>Gestión SOC</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((s) => (
                  <tr key={s.key} className="clickable" onClick={() => nav(`/empresas/${s.key}`)}>
                    <NameCell s={s} />
                    <td><RiskBadge level={s.score.level} score={s.score.score} /></td>
                    <td className="r"><b>{n0(s.eventsAT)}</b>{s.eventsEL > 0 && <span className="sub"> +{s.eventsEL} EL</span>}<div className="sub">{pct(s.share)}</div></td>
                    <td><div className="row" style={{ gap: 10 }}><Sparkline values={s.sparkline} width={72} height={22} /><TrendDelta trend={s.trend} compact /></div></td>
                    <td style={{ maxWidth: 220 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topMechanism ?? <span className="faint">Sin dato</span>}</div>{s.topMechanism && <div className="sub">{pct(s.topMechanismShare, 0)} de sus eventos</div>}</td>
                    <td className="r">{s.severe || <span className="faint">0</span>}</td>
                    <td className="r">{n0(s.daysLost)}</td>
                    <td className="r">{s.repeatWorkers || <span className="faint">0</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.contactGap ? <span className="tag alta">{s.contactStatus}</span> : <span className="muted">{s.contactStatus ?? '–'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  {th('name', 'Empresa')}
                  {th('yFull', `${sample?.previousYear ?? ''} completo`, true)}
                  {th('yPrev', sample?.previousLabel ?? 'Año anterior', true)}
                  {th('yCur', sample?.currentLabel ?? 'Año actual', true)}
                  {th('yDiff', 'Diferencia', true)}
                  {th('yPct', 'Cambio', true)}
                  <th className="r">Graves</th>
                  <th className="r">Días de incapacidad</th>
                  {th('score', 'Riesgo')}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((s) => {
                  const y = s.yoy;
                  const diff = y ? y.current - y.previous : 0;
                  return (
                    <tr key={s.key} className="clickable" onClick={() => nav(`/empresas/${s.key}?tab=anual`)}>
                      <NameCell s={s} />
                      <td className="r faint">{y ? n0(y.previousFullYear) : '–'}</td>
                      <td className="r">{y ? n0(y.previous) : '–'}</td>
                      <td className="r"><b>{y ? n0(y.current) : '–'}</b></td>
                      <td className="r"><Diff value={diff} /></td>
                      <td className="r">{!y ? '–' : y.previous === 0 && y.current > 0 ? <span className="delta up">nuevo</span> : <Delta value={y.change} />}{y?.significant && <span title="Cambio estadísticamente significativo">*</span>}</td>
                      <td className="r num">{y ? <>{y.severePrevious} → <b>{y.severeCurrent}</b></> : '–'}</td>
                      <td className="r num">{y ? <>{n0(y.daysPrevious)} → <b>{n0(y.daysCurrent)}</b></> : '–'}</td>
                      <td><RiskBadge level={s.score.level} score={s.score.score} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {rows.length > limit && (
          <div className="table-foot">
            <span>Mostrando {n0(limit)} de {n0(rows.length)}</span>
            <button className="btn btn-sm" onClick={() => setLimit(limit + 100)}>Mostrar 100 más</button>
          </div>
        )}
        {!rows.length && <p className="muted" style={{ padding: 20 }}>Ninguna empresa coincide con los filtros{advisor ? ` (${advisorLabel(advisor)})` : ''}.</p>}
      </div>
    </>
  );
}

function NameCell({ s }: { s: CompanySummary }) {
  return (
    <td style={{ maxWidth: 300 }}>
      <div className="company-row-name">
        <Link className="name" to={`/empresas/${s.key}`} onClick={(e) => e.stopPropagation()} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Link>
        <span className="sub">{s.nit ? `NIT ${s.nit}` : 'Sin NIT'}{s.advisors[0] ? ` · ${s.advisors.join(', ')}` : s.municipality ? ` · ${s.municipality}` : ''}</span>
      </div>
    </td>
  );
}

function Diff({ value }: { value: number }) {
  if (!value) return <span className="delta flat">0</span>;
  return (
    <span className={`delta ${value > 0 ? 'up' : 'down'}`}>
      {value > 0 ? <IArrowUp width={12} height={12} /> : <IArrowDown width={12} height={12} />}{value > 0 ? '+' : ''}{value}
    </span>
  );
}

/** Totales del conjunto filtrado (todo el portafolio, o la cartera de un asesor). */
function YearSummary({ rows, advisor }: { rows: CompanySummary[]; advisor: string }) {
  const ys = rows.map((r) => r.yoy).filter((y): y is NonNullable<CompanySummary['yoy']> => !!y);
  if (!ys.length) return null;
  const y0 = ys[0]!;
  const cur = ys.reduce((a, y) => a + y.current, 0);
  const prev = ys.reduce((a, y) => a + y.previous, 0);
  const sevCur = ys.reduce((a, y) => a + y.severeCurrent, 0);
  const sevPrev = ys.reduce((a, y) => a + y.severePrevious, 0);
  const up = ys.filter((y) => y.current > y.previous).length;
  const down = ys.filter((y) => y.current < y.previous).length;
  const fresh = ys.filter((y) => y.previous === 0 && y.current > 0).length;
  const gone = ys.filter((y) => y.current === 0 && y.previous > 0).length;
  const withY = rows.filter((r) => r.yoy);
  const topPrev = [...withY].sort((a, b) => b.yoy!.previousFullYear - a.yoy!.previousFullYear)[0];
  const topCur = [...withY].sort((a, b) => b.yoy!.current - a.yoy!.current)[0];
  return (
    <section className="kpis kpis-3" style={{ marginBottom: 16 }} aria-label="Resumen año contra año">
      <div className="kpi">
        <div className="kpi-label">{advisor ? `Cartera de ${advisorLabel(advisor)}` : 'Portafolio filtrado'}</div>
        <div className="kpi-value">{n0(prev)} → {n0(cur)}</div>
        <div className="kpi-meta"><Delta value={prev ? (cur - prev) / prev : null} /> accidentes, {y0.previousLabel} vs {y0.currentLabel}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Eventos graves</div>
        <div className="kpi-value">{n0(sevPrev)} → {n0(sevCur)}</div>
        <div className="kpi-meta">mismos meses</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Empresas que suben / bajan</div>
        <div className="kpi-value"><span style={{ color: 'var(--crit-ink)' }}>{up}</span> / <span style={{ color: 'var(--ctrl-ink)' }}>{down}</span></div>
        <div className="kpi-meta">{ys.length - up - down} sin cambio</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Nuevas / sin eventos este año</div>
        <div className="kpi-value">{fresh} / {gone}</div>
        <div className="kpi-meta">con accidentes solo en {y0.currentYear} / solo en {y0.previousYear}</div>
      </div>
      {topPrev && topPrev.yoy!.previousFullYear > 0 && (
        <Link className="kpi" to={`/empresas/${topPrev.key}?tab=anual`} style={{ textDecoration: 'none' }}>
          <div className="kpi-label">Más accidentes en {y0.previousYear}</div>
          <div className="kpi-value text">{topPrev.name}</div>
          <div className="kpi-meta">{n0(topPrev.yoy!.previousFullYear)} en {y0.previousYear} completo</div>
        </Link>
      )}
      {topCur && topCur.yoy!.current > 0 && (
        <Link className="kpi" to={`/empresas/${topCur.key}?tab=anual`} style={{ textDecoration: 'none' }}>
          <div className="kpi-label">Más accidentes en {y0.currentYear}</div>
          <div className="kpi-value text">{topCur.name}</div>
          <div className="kpi-meta">{n0(topCur.yoy!.current)} en {y0.currentLabel}</div>
        </Link>
      )}
    </section>
  );
}
