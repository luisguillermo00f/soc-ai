import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiEngine, RiskLevel } from '@shared/types.ts';
import { engineName } from '../components/ai.tsx';
import { get, send } from '../lib/api.ts';
import { useCompanies } from '../lib/queries.ts';
import { AdvisorSelect, matchAdvisor, useAdvisor } from '../lib/advisor.tsx';
import { useCan, useSession } from '../lib/session.tsx';
import { dateTimeEs } from '../lib/format.ts';
import { ErrorState, PageSkeleton, RiskBadge, Spinner, useToast } from '../components/ui.tsx';
import { AiSpark, IPrint } from '../components/Icons.tsx';

interface PlanRow { company: string; name: string; level: RiskLevel | null; score: number | null; engine: string; createdAt: string }

export function Plans() {
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => get<{ plans: PlanRow[] }>('/ai/plans') });
  const companies = useCompanies();
  const can = useCan('analista');
  const { ai } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [advisor, setAdvisor] = useAdvisor();
  const gen = useMutation({
    mutationFn: (key: string) => { setPending(key); return send('POST', `/ai/company/${key}/plan`, {}); },
    onSuccess: (_d, key) => { qc.invalidateQueries({ queryKey: ['plans'] }); qc.invalidateQueries({ queryKey: ['company', key] }); nav(`/empresas/${key}?tab=plan`); },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo generar el plan.'),
    onSettled: () => setPending(null),
  });

  if (plans.isLoading || companies.isLoading) return <PageSkeleton />;
  if (plans.isError || companies.isError) return <ErrorState error={plans.error ?? companies.error} retry={() => { plans.refetch(); companies.refetch(); }} />;
  const byKey = new Map(companies.data!.companies.map((s) => [s.key, s]));
  const planRows = plans.data!.plans.filter((p) => { const s = byKey.get(p.company); return !advisor || (s && matchAdvisor(s, advisor)); });
  const have = new Set(plans.data!.plans.map((p) => p.company));
  const missing = companies.data!.companies.filter((s) => matchAdvisor(s, advisor) && (s.score.level === 'critico' || s.score.level === 'prioritario') && !have.has(s.key));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planes de choque</h1>
          <p className="sub">Cada plan se construye a partir de los problemas que muestran los datos de la empresa: el mecanismo que domina, un aumento reciente, la reincidencia, la severidad o la gestión pendiente. No hay una plantilla común.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Planes generados</h2><p className="question">{planRows.length} planes{advisor ? ' en la cartera filtrada' : ' para el dataset activo'}.</p></div><AdvisorSelect value={advisor} onChange={setAdvisor} /></div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Empresa</th><th>Nivel</th><th>Generado por</th><th>Fecha</th><th /></tr></thead>
            <tbody>
              {planRows.map((p) => (
                <tr key={p.company} className="clickable" onClick={() => nav(`/empresas/${p.company}?tab=plan`)}>
                  <td><Link className="name" to={`/empresas/${p.company}?tab=plan`} onClick={(e) => e.stopPropagation()}>{p.name}</Link></td>
                  <td>{p.level && <RiskBadge level={p.level} score={p.score ?? undefined} />}</td>
                  <td><span className={`engine ${p.engine}`}><span className="dot" />{engineName(p.engine as AiEngine)}</span></td>
                  <td className="muted">{dateTimeEs(p.createdAt)}</td>
                  <td className="r"><Link className="btn btn-sm" to={`/reportes/empresa/${p.company}`} onClick={(e) => e.stopPropagation()}><IPrint />Reporte</Link></td>
                </tr>
              ))}
              {!planRows.length && <tr><td colSpan={5} className="muted">Aún no hay planes. Genera el primero desde la lista de abajo.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {missing.length > 0 && (
        <section className="section panel">
          <div className="panel-head">
            <div><h2>Empresas que necesitan plan</h2><p className="question">Críticas o prioritarias sin plan generado.</p></div>
            {!ai.enabled && <span className="faint" style={{ fontSize: 'var(--t-sm)' }}>Sin clave de Claude: se usará el motor de reglas.</span>}
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead><tr><th>Empresa</th><th>Nivel</th><th>Motivo principal</th><th /></tr></thead>
              <tbody>
                {missing.map((s) => (
                  <tr key={s.key}>
                    <td><Link className="name" to={`/empresas/${s.key}`}>{s.name}</Link></td>
                    <td><RiskBadge level={s.score.level} score={s.score.score} /></td>
                    <td className="muted" style={{ maxWidth: 420 }}>{s.score.factors[0]?.reason}</td>
                    <td className="r">
                      {can && (
                        <button className="btn btn-ai btn-sm" onClick={() => gen.mutate(s.key)} disabled={!!pending}>
                          {pending === s.key ? <Spinner /> : <AiSpark width={13} height={13} />}Generar plan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
