import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries } from '@tanstack/react-query';
import type { AiResult, CompanyProfile, Comparison } from '@shared/types.ts';
import { get, send } from '../lib/api.ts';
import { useFacets } from '../lib/queries.ts';
import { useCan } from '../lib/session.tsx';
import { monthShort, n0, n1, pct } from '../lib/format.ts';
import { ErrorState, PageSkeleton, RiskBadge, TrendDelta, Spinner, useToast } from '../components/ui.tsx';
import { COMPARE_COLORS, MultiLine } from '../components/charts.tsx';
import { AiHeader, FactChips, VText, unverifiedFor } from '../components/ai.tsx';
import { AiSpark, IClose } from '../components/Icons.tsx';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Compare() {
  const [params, setParams] = useSearchParams();
  const keys = (params.get('c') ?? '').split(',').filter(Boolean).slice(0, 4);
  const facets = useFacets();
  const [search, setSearch] = useState('');
  const can = useCan('analista');
  const toast = useToast();
  const [result, setResult] = useState<AiResult<Comparison> | null>(null);

  const profiles = useQueries({
    queries: keys.map((k) => ({ queryKey: ['company', k], queryFn: () => get<{ profile: CompanyProfile }>(`/companies/${encodeURIComponent(k)}`) })),
  });
  const gen = useMutation({
    mutationFn: (force: boolean) => send<AiResult<Comparison>>('POST', '/ai/compare', { keys, force }),
    onSuccess: setResult,
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo comparar.'),
  });

  const setKeys = (ks: string[]) => { setResult(null); setParams(ks.length ? { c: ks.join(',') } : {}, { replace: true }); };
  const options = useMemo(() => {
    const f = fold(search);
    if (!f) return [];
    return (facets.data?.companies ?? []).filter((c) => !keys.includes(c.key) && fold(c.name).includes(f)).slice(0, 8);
  }, [search, facets.data, keys]);

  if (facets.isLoading) return <PageSkeleton />;
  if (facets.isError) return <ErrorState error={facets.error} retry={() => facets.refetch()} />;
  const loaded = profiles.map((p) => p.data?.profile).filter((p): p is CompanyProfile => !!p);
  const ready = loaded.length === keys.length && keys.length >= 2;
  const months = loaded[0]?.monthly.map((m) => m.month) ?? [];
  const mechKeys = [...new Set(loaded.flatMap((p) => p.mechanisms.filter((m) => m.key !== 'sin-info' && m.key !== 'otro').slice(0, 4).map((m) => m.key)))].slice(0, 7);
  const label = (k: string) => loaded.flatMap((p) => p.mechanisms).find((m) => m.key === k)?.label ?? k;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comparar empresas</h1>
          <p className="sub">Elige de 2 a 4 empresas. La comparación muestra frecuencia, tendencia, mecanismos, severidad, recurrencia y gestión, y SOC AI explica en qué se diferencian sus riesgos.</p>
        </div>
      </div>

      <div className="filters" style={{ position: 'relative' }}>
        {keys.map((k, i) => {
          const c = facets.data!.companies.find((x) => x.key === k);
          return (
            <span key={k} className="tag" style={{ height: 30, fontSize: 'var(--t-md)', gap: 8, paddingRight: 4, background: 'var(--surface)' }}>
              <i style={{ width: 10, height: 10, borderRadius: 2, background: COMPARE_COLORS[i], display: 'inline-block' }} />
              {c?.name ?? k}
              <button className="btn btn-ghost btn-sm" style={{ height: 22, padding: '0 4px' }} onClick={() => setKeys(keys.filter((x) => x !== k))} aria-label={`Quitar ${c?.name}`}><IClose /></button>
            </span>
          );
        })}
        {keys.length < 4 && (
          <div style={{ position: 'relative' }}>
            <input className="input" placeholder="Agregar empresa…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Agregar empresa a la comparación" />
            {options.length > 0 && (
              <ul className="panel" style={{ position: 'absolute', top: 36, left: 0, width: 360, zIndex: 20, listStyle: 'none', margin: 0, padding: 4, boxShadow: 'var(--shadow-pop)' }}>
                {options.map((o) => (
                  <li key={o.key}><button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => { setKeys([...keys, o.key]); setSearch(''); }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span><span className="faint num">{o.events}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {keys.length < 2 && (
        <div className="panel"><div className="empty"><h3>Elige al menos dos empresas</h3><p>Busca por nombre arriba, o abre una empresa y usa el botón Comparar.</p></div></div>
      )}

      {keys.length >= 2 && !ready && <PageSkeleton />}

      {ready && (
        <>
          <section className="panel">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Indicador</th>{loaded.map((p, i) => <th key={p.summary.key}><span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: COMPARE_COLORS[i], display: 'inline-block' }} /><Link className="name" to={`/empresas/${p.summary.key}`}>{p.summary.name}</Link></span></th>)}</tr></thead>
                <tbody>
                  <Row label="Nivel de riesgo" cells={loaded.map((p) => <RiskBadge level={p.summary.score.level} score={p.summary.score.score} />)} />
                  <Row label="Accidentes de trabajo" cells={loaded.map((p) => <b className="num">{n0(p.summary.eventsAT)}</b>)} />
                  <Row label="Semestres (anterior → último)" cells={loaded.map((p) => <span className="row" style={{ gap: 8 }}>{p.summary.trend.previous} → {p.summary.trend.recent}<TrendDelta trend={p.summary.trend} /></span>)} />
                  <Row label="Mecanismo principal" cells={loaded.map((p) => <span>{p.summary.topMechanism ?? '–'} <span className="faint">{pct(p.summary.topMechanismShare, 0)}</span></span>)} />
                  <Row label="Eventos graves" cells={loaded.map((p) => n0(p.summary.severe))} />
                  <Row label="Días por accidente" cells={loaded.map((p) => n1(p.peers.daysPerEvent))} />
                  <Row label="Trabajadores reincidentes" cells={loaded.map((p) => n0(p.summary.repeatWorkers))} />
                  <Row label="Rachas (≥3 en 60 días)" cells={loaded.map((p) => n0(p.clusters.length))} />
                  <Row label="Centro de trabajo principal" cells={loaded.map((p) => p.workCenters[0] ? `${p.workCenters[0].label} (${pct(p.workCenters[0].share, 0)})` : '–')} />
                  <Row label="Gestión SOC" cells={loaded.map((p) => p.summary.contactStatus ?? '–')} />
                </tbody>
              </table>
            </div>
          </section>

          <section className="section grid-2">
            <div className="panel">
              <div className="panel-head"><div><h2>Evolución mensual</h2><p className="question">¿Cuál empeora y cuál mejora?</p></div></div>
              <div className="panel-body">
                <MultiLine ariaLabel="Accidentes por mes de las empresas comparadas" labels={months.map(monthShort)} height={240}
                  series={loaded.map((p, i) => ({ name: p.summary.name, values: p.monthly.map((m) => m.count), color: COMPARE_COLORS[i]! }))} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><div><h2>Mecanismos</h2><p className="question">Proporción de los accidentes de cada empresa.</p></div></div>
              <div className="panel-body">
                <table className="data">
                  <thead><tr><th>Mecanismo</th>{loaded.map((p, i) => <th key={p.summary.key} className="r"><i style={{ width: 10, height: 10, borderRadius: 2, background: COMPARE_COLORS[i], display: 'inline-block' }} aria-label={p.summary.name} /></th>)}</tr></thead>
                  <tbody>
                    {mechKeys.map((k) => (
                      <tr key={k}>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(k)}</td>
                        {loaded.map((p, i) => {
                          const m = p.mechanisms.find((x) => x.key === k);
                          return (
                            <td key={p.summary.key} className="r">
                              <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                                <span className="num">{m ? pct(m.share, 0) : '–'}</span>
                                <span style={{ width: 40, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
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
            </div>
          </section>

          <section className="section ai-block">
            <AiHeader title="Conclusión comparativa" meta={result?.meta} onRegenerate={result && can ? () => gen.mutate(true) : undefined} busy={gen.isPending} />
            <div className="ai-body">
              {!result ? (
                can ? <button className="btn btn-ai" onClick={() => gen.mutate(false)} disabled={gen.isPending}>{gen.isPending ? <Spinner /> : <AiSpark width={13} height={13} />}Comparar con SOC AI</button>
                  : <p className="faint">Tu rol es de solo lectura.</p>
              ) : (
                <div className="stack" style={{ gap: 16 }}>
                  <p className="ai-headline" style={{ fontSize: 'var(--t-lg)' }}><VText text={result.content.conclusion} unverified={unverifiedFor(result.meta, 'conclusion')} /></p>
                  <div>
                    {result.content.differences.map((d, i) => (
                      <div className="finding" key={i} style={{ gridTemplateColumns: '180px minmax(0, 1fr)' }}>
                        <b style={{ fontWeight: 600 }}>{d.aspect}</b>
                        <div><p><VText text={d.detail} unverified={unverifiedFor(result.meta, `differences.${i}`)} /></p><div className="meta"><FactChips ids={d.evidence} facts={result.meta.facts} title={d.aspect} /></div></div>
                      </div>
                    ))}
                  </div>
                  <div className="grid-2">
                    <div className="notice"><span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>Riesgos compartidos.</b> <VText text={result.content.sharedRisks} unverified={unverifiedFor(result.meta, 'sharedRisks')} /></span></div>
                    <div className="notice"><span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>Recomendación.</b> {result.content.recommendation}</span></div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Row({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return <tr><td className="muted" style={{ whiteSpace: 'nowrap' }}>{label}</td>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>;
}
