import type { AiResult, PlanAction, ShockPlan, WhatsHappening } from '@shared/types.ts';
import { ConfTag, NatureChip } from './ui.tsx';
import { FactChips, VText, unverifiedFor } from './ai.tsx';

const PRIORITY = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const;

export function WhatsView({ r, print }: { r: AiResult<WhatsHappening>; print?: boolean }) {
  const c = r.content;
  const m = r.meta;
  const uv = (f: string) => unverifiedFor(m, f);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <p className="ai-headline"><VText text={c.headline} unverified={uv('headline')} /></p>
        <p className="ai-summary"><VText text={c.summary} unverified={uv('summary')} /></p>
      </div>
      <div className="qa">
        <div><h5>¿Dónde está pasando?</h5><p><VText text={c.where} unverified={uv('where')} /></p></div>
        <div><h5>¿Cuándo está pasando?</h5><p><VText text={c.when} unverified={uv('when')} /></p></div>
        <div><h5>¿Qué tipo de evento se repite?</h5><p><VText text={c.whatRepeats} unverified={uv('whatRepeats')} /></p></div>
        <div><h5>¿Qué tan grave es?</h5><p><VText text={c.howSevere} unverified={uv('howSevere')} /></p></div>
      </div>
      <div>
        <h3 style={{ fontSize: 'var(--t-lg)', marginBottom: 4 }}>Del dato a la recomendación</h3>
        <p className="question" style={{ marginBottom: 6 }}>Cada afirmación declara su naturaleza. Las hipótesis deben validarse en campo.</p>
        {c.findings.map((f, i) => (
          <div className="finding" key={i}>
            <div><NatureChip nature={f.nature} /></div>
            <div>
              <h4>{f.title}</h4>
              <p><VText text={f.body} unverified={uv(`findings.${i}`)} /></p>
              <div className="meta">
                <ConfTag c={f.confidence} />
                {!print && <FactChips ids={f.evidence} facts={m.facts} title={f.title} />}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div>
          <h3 style={{ fontSize: 'var(--t-lg)', marginBottom: 10 }}>¿Qué podría estar provocándolo?</h3>
          <div className="stack" style={{ gap: 12 }}>
            {c.hypotheses.map((h, i) => (
              <div key={i} className="panel panel-pad" style={{ padding: 14 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}><NatureChip nature="hipotesis" /><ConfTag c={h.confidence} /></div>
                <p style={{ fontWeight: 550 }}>{h.text}</p>
                <p className="muted" style={{ fontSize: 'var(--t-md)', marginTop: 6 }}><b style={{ fontWeight: 550 }}>Base:</b> <VText text={h.basis} unverified={uv(`hypotheses.${i}`)} /></p>
                <p className="muted" style={{ fontSize: 'var(--t-md)', marginTop: 4 }}><b style={{ fontWeight: 550 }}>Cómo validarla:</b> {h.validate}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <div>
            <h3 style={{ fontSize: 'var(--t-lg)', marginBottom: 10 }}>Qué debería investigar SOC</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
              {c.fieldChecks.map((x, i) => <li key={i} style={{ fontSize: 'var(--t-md)' }}>{x}</li>)}
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: 'var(--t-lg)', marginBottom: 10 }}>Acción recomendada</h3>
            <div className="stack" style={{ gap: 10 }}>
              {c.actions.map((a, i) => (
                <div key={i} style={{ fontSize: 'var(--t-md)' }}>
                  <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><span className={`tag ${a.priority}`}>{PRIORITY[a.priority]}</span><b style={{ fontWeight: 550 }}>{a.action}</b></div>
                  {a.why && <p className="muted" style={{ marginTop: 3, paddingLeft: 2 }}>{a.why}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="notice"><span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>Límites del análisis.</b> {c.limits}</span></div>
    </div>
  );
}

function ActionList({ title, items }: { title: string; items: PlanAction[] }) {
  return (
    <div className="plan-col">
      <h4><span>{title}</span><span className="faint num">{items.length}</span></h4>
      {items.map((a, i) => (
        <div className="plan-action" key={i}>
          <div>{a.action}</div>
          <div className="pa-meta">{a.owner} · {a.due}</div>
          <div className="pa-meta">Indicador: {a.indicator}</div>
        </div>
      ))}
      {!items.length && <p className="faint" style={{ fontSize: 'var(--t-sm)' }}>Sin acciones en este horizonte.</p>}
    </div>
  );
}

export function PlanView({ r, print }: { r: AiResult<ShockPlan>; print?: boolean }) {
  const c = r.content;
  const m = r.meta;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <p className="ai-headline">{c.title}</p>
        <p className="ai-summary"><b style={{ color: 'var(--ink)', fontWeight: 600 }}>Enfoque.</b> {c.focus}</p>
        <p className="ai-summary" style={{ marginTop: 4 }}><VText text={c.context} unverified={unverifiedFor(m, 'context')} /></p>
      </div>
      {c.problems.map((p, i) => (
        <article className="plan-problem" key={i}>
          <div className="plan-problem-head">
            <div>
              <div className="faint" style={{ fontSize: 'var(--t-xs)', fontWeight: 600, marginBottom: 2 }}>Problema {i + 1}</div>
              <h3><VText text={p.problem} unverified={unverifiedFor(m, `problems.${i}.problem`)} /></h3>
              <p className="muted" style={{ marginTop: 4, fontSize: 'var(--t-md)' }}><b style={{ fontWeight: 550, color: 'var(--ink)' }}>Evidencia:</b> <VText text={p.evidenceText} unverified={unverifiedFor(m, `problems.${i}.evidenceText`)} /></p>
              <p className="muted" style={{ marginTop: 2, fontSize: 'var(--t-md)' }}><b style={{ fontWeight: 550, color: 'var(--ink)' }}>Objetivo:</b> {p.objective}</p>
              {!print && <div style={{ marginTop: 8 }}><FactChips ids={p.evidence} facts={m.facts} title={p.problem} /></div>}
            </div>
            <span className={`tag ${p.priority}`} style={{ flex: 'none' }}>Prioridad {PRIORITY[p.priority].toLowerCase()}</span>
          </div>
          <div className="plan-cols">
            <ActionList title="Inmediatas" items={p.immediate} />
            <ActionList title="Corto plazo" items={p.shortTerm} />
            <ActionList title="Estructurales" items={p.structural} />
          </div>
          <div className="plan-foot">
            <div><h5>Indicador</h5>{p.indicator}</div>
            <div><h5>Meta propuesta</h5>{p.target}</div>
            <div><h5>Justificación SOC AI</h5><VText text={p.rationale} unverified={unverifiedFor(m, `problems.${i}.rationale`)} /></div>
          </div>
        </article>
      ))}
      <div className="grid-2">
        <div className="notice"><span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>Seguimiento.</b> {c.followUp}</span></div>
        <div className="notice"><span><b style={{ color: 'var(--ink)', fontWeight: 550 }}>Supuestos.</b> {c.assumptions.join(' ')}</span></div>
      </div>
    </div>
  );
}
