// Pestaña "2025 vs 2026" del perfil de empresa: los mismos meses de dos años, lado a lado.

import type { CompanyProfile, YearCompareRow } from '@shared/types.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { n0, signedPct } from '../lib/format.ts';
import { Delta } from './ui.tsx';
import { Columns } from './charts.tsx';
import { EvidenceButton } from './ai.tsx';

function lastDay(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function CompareTable({ title, question, rows, prevYear, curYear, onRow }: {
  title: string; question: string; rows: YearCompareRow[]; prevYear: number; curYear: number; onRow?: (r: YearCompareRow) => void;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.current, r.previous]));
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>{title}</h3><p className="question">{question}</p></div></div>
      <div className="panel-body" style={{ paddingTop: 8 }}>
        {rows.length ? (
          <table className="data">
            <thead><tr><th>Categoría</th><th className="r">{prevYear}</th><th className="r">{curYear}</th><th style={{ width: 120 }} aria-label="Comparación visual" /><th className="r">Cambio</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const d = r.current - r.previous;
                return (
                  <tr key={r.key} className={onRow ? 'clickable' : undefined} onClick={() => onRow?.(r)}>
                    <td style={{ maxWidth: 240 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</div></td>
                    <td className="r muted">{r.previous}</td>
                    <td className="r"><b>{r.current}</b></td>
                    <td>
                      <div style={{ display: 'grid', gap: 2 }} aria-hidden="true">
                        <span style={{ height: 5, width: `${(r.previous / max) * 100}%`, background: '#a1a1aa', borderRadius: '0 3px 3px 0', display: 'block' }} />
                        <span style={{ height: 5, width: `${(r.current / max) * 100}%`, background: 'var(--data)', borderRadius: '0 3px 3px 0', display: 'block' }} />
                      </div>
                    </td>
                    <td className="r">
                      {r.previous === 0 ? <span className="delta up">nuevo</span>
                        : r.current === 0 ? <span className="delta down">sin eventos</span>
                          : <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>{d > 0 ? '+' : ''}{d}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="muted">Sin datos en estos períodos.</p>}
      </div>
    </div>
  );
}

export function YearTab({ p }: { p: CompanyProfile }) {
  const open = useEvidence();
  const yc = p.yearCompare;
  if (!yc) return <div className="panel"><p className="muted" style={{ padding: 20 }}>El dataset no cubre los mismos meses de dos años.</p></div>;
  const y = yc.yoy;
  const s = p.summary;
  const months = yc.monthly;
  const from = (year: number) => `${year}-${months[0]!.month}-01`;
  const to = (year: number) => lastDay(`${year}-${months[months.length - 1]!.month}`);
  const yearFilter = (year: number, extra: Record<string, string> = {}) => ({ company: s.key, cls: 'AT' as const, from: from(year), to: to(year), ...extra });

  const ups = yc.mechanisms.filter((m) => m.current > m.previous).sort((a, b) => (b.current - b.previous) - (a.current - a.previous)).slice(0, 2);
  const downs = yc.mechanisms.filter((m) => m.current < m.previous).sort((a, b) => (a.current - a.previous) - (b.current - b.previous)).slice(0, 2);
  const verb = y.previous === 0 && y.current > 0 ? 'aparece con' : y.current > y.previous ? 'sube de' : y.current < y.previous ? 'baja de' : 'se mantiene en';
  const reading = [
    y.previous === 0 && y.current > 0
      ? `${s.name} no tuvo accidentes en ${y.previousLabel} y ${verb} ${y.current} en ${y.currentLabel}.`
      : y.current === y.previous
        ? `${s.name} ${verb} ${y.current} accidentes en ambos períodos.`
        : `${s.name} ${verb} ${y.previous} a ${y.current} accidentes (${signedPct(y.change)}) entre ${y.previousLabel} y ${y.currentLabel}.`,
    y.current + y.previous >= 6 ? (y.significant ? 'El cambio es estadísticamente significativo.' : 'El cambio está dentro de la variación esperada; no es significativo.') : 'Con tan pocos eventos, la diferencia no permite conclusiones firmes.',
    ups.length ? `Suben: ${ups.map((m) => `${m.label.toLowerCase()} (${m.previous} → ${m.current})`).join(', ')}.` : '',
    downs.length ? `Bajan: ${downs.map((m) => `${m.label.toLowerCase()} (${m.previous} → ${m.current})`).join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <section className="kpis kpis-4">
        <div className="kpi">
          <div className="kpi-label">Accidentes de trabajo</div>
          <div className="kpi-value">{y.previous} → {y.current}</div>
          <div className="kpi-meta">{y.previous === 0 && y.current > 0 ? <span className="delta up">nuevo</span> : <Delta value={y.change} />} {y.significant ? 'significativo' : 'no significativo'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Eventos graves</div>
          <div className="kpi-value">{y.severePrevious} → {y.severeCurrent}</div>
          <div className="kpi-meta">quirúrgicos, hospitalarios, UCI, ≥30 días o PCL</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Días de incapacidad</div>
          <div className="kpi-value">{n0(y.daysPrevious)} → {n0(y.daysCurrent)}</div>
          <div className="kpi-meta"><Delta value={y.daysPrevious ? (y.daysCurrent - y.daysPrevious) / y.daysPrevious : null} /></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Trabajadores accidentados</div>
          <div className="kpi-value">{yc.workers.previous} → {yc.workers.current}</div>
          <div className="kpi-meta">reincidentes en el año: {yc.workers.repeatPrevious} → {yc.workers.repeatCurrent}</div>
        </div>
      </section>

      <section className="section grid-main">
        <div className="panel">
          <div className="panel-head">
            <div><h2>Mes a mes</h2><p className="question">¿En qué meses {y.currentYear} está mejor o peor que {y.previousYear}?</p></div>
          </div>
          <div className="panel-body">
            <Columns ariaLabel={`Accidentes por mes, ${y.previousYear} contra ${y.currentYear}`} height={230}
              name={String(y.currentYear)} name2={String(y.previousYear)}
              items={months.map((m) => ({ label: m.label, value: m.current, value2: m.previous }))} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Lectura</h2><p className="question">Mismos meses: {y.previousLabel} frente a {y.currentLabel}.</p></div></div>
          <div className="panel-body stack" style={{ gap: 12 }}>
            <p style={{ lineHeight: 1.6 }}>{reading}</p>
            {yc.newMechanisms.length > 0 && <p className="notice">Aparecen en {y.currentYear}: {yc.newMechanisms.join(', ')}.</p>}
            {yc.goneMechanisms.length > 0 && <p className="notice">Sin eventos en {y.currentYear}: {yc.goneMechanisms.join(', ')}.</p>}
            <p className="faint" style={{ fontSize: 'var(--t-sm)' }}>Referencia: {y.previousYear} completo tuvo {y.previousFullYear} accidentes. Prueba binomial exacta, p = {(y.pValue ?? 1).toFixed(3).replace('.', ',')}.</p>
            <div className="row" style={{ gap: 16 }}>
              <EvidenceButton label={`Registros ${y.previousYear}`} onClick={() => open({ title: `${s.name} · ${y.previousLabel}`, filter: yearFilter(y.previousYear) })} />
              <EvidenceButton label={`Registros ${y.currentYear}`} onClick={() => open({ title: `${s.name} · ${y.currentLabel}`, filter: yearFilter(y.currentYear) })} />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <CompareTable title="Mecanismos" question="¿Qué tipo de accidente cambió? Clic para ver los registros del año actual." rows={yc.mechanisms}
          prevYear={y.previousYear} curYear={y.currentYear}
          onRow={(r) => open({ title: `${r.label} · ${s.name}`, subtitle: `${y.previousYear}: ${r.previous} · ${y.currentYear}: ${r.current}`, filter: yearFilter(y.currentYear, { mechGroup: r.key }) })} />
      </section>
      <section className="section grid-2">
        <CompareTable title="Centros de trabajo" question="¿Dónde cambió?" rows={yc.workCenters} prevYear={y.previousYear} curYear={y.currentYear}
          onRow={(r) => open({ title: `${r.label} · ${y.currentLabel}`, filter: yearFilter(y.currentYear, { workCenter: r.key }) })} />
        <CompareTable title="Nivel de atención" question="¿Cambió la severidad?" rows={yc.careLevels} prevYear={y.previousYear} curYear={y.currentYear}
          onRow={(r) => open({ title: `${r.label} · ${y.currentLabel}`, filter: yearFilter(y.currentYear, { careLevel: r.key }) })} />
      </section>
    </>
  );
}
