import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTrends } from '../lib/queries.ts';
import { monthLong, monthShort, n0, n1, pct, signedPct } from '../lib/format.ts';
import { ErrorState, PageSkeleton, TrendDelta } from '../components/ui.tsx';
import { Columns, LineChart, MultiLine, Sparkline, COMPARE_COLORS } from '../components/charts.tsx';

export function Trends() {
  const q = useTrends();
  const [selected, setSelected] = useState<string[] | null>(null);
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const t = q.data;
  const p = t.period;
  const anomaly = new Map(t.anomalies.map((a) => [a.month, a.kind]));
  const sel = selected ?? t.byMechanism.slice(0, 3).map((m) => m.key);
  const toggle = (k: string) => setSelected(sel.includes(k) ? sel.filter((x) => x !== k) : sel.length >= 4 ? [...sel.slice(1), k] : [...sel, k]);
  const severeShare = t.severityMonthly.map((m) => (m.count ? m.severe / m.count : 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tendencias</h1>
          <p className="sub">
            {p.completeMonths.length} meses completos ({monthLong(p.completeMonths[0]!)} a {monthLong(p.completeMonths[p.completeMonths.length - 1]!)}).
            {p.partialMonth && ` El mes de ${monthLong(p.partialMonth)} está incompleto en el corte y se excluye para no sesgar la tendencia.`} Los cambios entre semestres se evalúan con prueba binomial exacta; el asterisco marca los significativos.
          </p>
        </div>
      </div>

      <section className="grid-main">
        <div className="panel">
          <div className="panel-head"><div><h2>Accidentes por mes</h2><p className="question">¿Hay meses fuera de lo normal? Punto rojo: pico; verde: caída (Poisson, p &lt; 0,01).</p></div></div>
          <div className="panel-body">
            <LineChart ariaLabel="Accidentes por mes en el portafolio" height={250}
              points={t.monthly.map((m) => ({ label: monthShort(m.month), value: m.count, tip: `${m.severe} graves · ${n0(m.days)} días`, flag: anomaly.get(m.month) as 'spike' | 'drop' | undefined }))} />
            {t.anomalies.map((a, i) => <p key={i} className="faint" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>{a.kind === 'spike' ? 'Pico' : 'Caída'}: {a.label}.</p>)}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Año contra año</h2><p className="question">¿Los mismos meses están mejor o peor que el año anterior?</p></div></div>
          <div className="panel-body">
            {t.yoy ? (
              <>
                <Columns ariaLabel="Comparación año contra año" height={220}
                  name={p.ytd!.current.label.slice(-4)} name2={p.ytd!.previousYear.label.slice(-4)}
                  items={t.yoy.map((y) => ({ label: y.label, value: y.current, value2: y.previous }))} />
                <p className="faint" style={{ fontSize: 'var(--t-sm)', marginTop: 8 }}>
                  Total {n0(t.yoy.reduce((a, y) => a + y.current, 0))} frente a {n0(t.yoy.reduce((a, y) => a + y.previous, 0))} ({signedPct(t.yoy.reduce((a, y) => a + y.current, 0) / Math.max(1, t.yoy.reduce((a, y) => a + y.previous, 0)) - 1)}).
                </p>
              </>
            ) : <p className="muted">Se necesita más de un año de datos para comparar los mismos meses.</p>}
          </div>
        </div>
      </section>

      <section className="section panel">
        <div className="panel-head"><div><h2>Mecanismos en el tiempo</h2><p className="question">¿Qué tipo de accidente está creciendo? Elige hasta 4 para compararlos.</p></div></div>
        <div className="panel-body grid-main" style={{ alignItems: 'start' }}>
          <MultiLine ariaLabel="Accidentes por mecanismo y mes" height={260} labels={t.months.map(monthShort)}
            series={t.byMechanism.filter((m) => sel.includes(m.key)).map((m) => ({ name: m.label, values: m.series, color: COMPARE_COLORS[sel.indexOf(m.key)]! }))} />
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Mecanismo</th><th>Serie</th><th className="r">Semestres</th></tr></thead>
              <tbody>
                {t.byMechanism.map((m) => (
                  <tr key={m.key} className="clickable" onClick={() => toggle(m.key)} aria-selected={sel.includes(m.key)}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <input type="checkbox" checked={sel.includes(m.key)} readOnly aria-label={`Mostrar ${m.label}`} />
                        <span style={{ fontWeight: sel.includes(m.key) ? 600 : 400 }}>{m.label}</span>
                      </span>
                    </td>
                    <td><Sparkline values={m.series} width={80} height={20} /></td>
                    <td className="r"><TrendDelta trend={m.trend} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section grid-2">
        <div className="panel">
          <div className="panel-head"><div><h2>Empresas que más suben</h2><p className="question">{p.previous.label} → {p.recent.label}</p></div></div>
          <table className="data">
            <thead><tr><th>Empresa</th><th className="r">Antes</th><th className="r">Ahora</th><th className="r">Cambio</th></tr></thead>
            <tbody>
              {t.risers.map((r) => (
                <tr key={r.key}>
                  <td><Link className="name" to={`/empresas/${r.key}`}>{r.name}</Link></td>
                  <td className="r">{r.trend.previous}</td><td className="r"><b>{r.trend.recent}</b></td><td className="r"><TrendDelta trend={r.trend} /></td>
                </tr>
              ))}
              {!t.risers.length && <tr><td colSpan={4} className="muted">Ninguna empresa con al menos 4 eventos muestra aumento.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Empresas que más bajan</h2><p className="question">Casos para documentar qué funcionó.</p></div></div>
          <table className="data">
            <thead><tr><th>Empresa</th><th className="r">Antes</th><th className="r">Ahora</th><th className="r">Cambio</th></tr></thead>
            <tbody>
              {t.fallers.map((r) => (
                <tr key={r.key}>
                  <td><Link className="name" to={`/empresas/${r.key}`}>{r.name}</Link></td>
                  <td className="r">{r.trend.previous}</td><td className="r"><b>{r.trend.recent}</b></td><td className="r"><TrendDelta trend={r.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section grid-3">
        <div className="panel">
          <div className="panel-head"><div><h3>Día de la semana</h3><p className="question">¿Cuándo ocurren?</p></div></div>
          <div className="panel-body">
            <Columns ariaLabel="Accidentes por día de la semana" height={170} items={t.weekdays.map((d) => ({ label: d.label.slice(0, 3), value: d.count, tip: pct(d.share) }))} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Proporción de eventos graves</h3><p className="question">¿La severidad sube o baja?</p></div></div>
          <div className="panel-body">
            <LineChart ariaLabel="Eventos graves por mes" height={170} name="Graves"
              points={t.severityMonthly.map((m, i) => ({ label: monthShort(m.month), value: m.severe, tip: `${pct(severeShare[i]!)} de ${m.count}` }))} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Oportunidad de la calificación</h3><p className="question">¿Cuánto tarda en calificarse un accidente?</p></div></div>
          <div className="panel-body stack" style={{ gap: 10 }}>
            {t.lag ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Mediana</span><b className="num">{n1(t.lag.median)} días</b></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Percentil 90</span><b className="num">{n1(t.lag.p90)} días</b></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Más de 15 días</span><b className="num">{n0(t.lag.over15)} de {n0(t.lag.n)}</b></div>
                <p className="faint" style={{ fontSize: 'var(--t-sm)' }}>La Resolución 1401 de 2007 pide investigar el accidente dentro de los 15 días siguientes; una calificación tardía suele retrasar esa investigación.</p>
              </>
            ) : <p className="muted">El archivo no trae fecha de calificación.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
