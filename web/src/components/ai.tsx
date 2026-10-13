// Piezas de presentación para resultados de SOC AI: procedencia, verificación de cifras y evidencia.

import type { ReactNode } from 'react';
import type { AiEngine, AiMeta, FactRef } from '@shared/types.ts';
import { useEvidence } from '../lib/evidence.tsx';
import { dateTimeEs } from '../lib/format.ts';
import { AiSpark, ICheck, IEvidence, IRefresh, IAlert } from './Icons.tsx';
import { Spinner } from './ui.tsx';

/** Nombre legible del motor que produjo un resultado. */
export function engineName(engine: AiEngine | undefined, model?: string | null): string {
  if (engine === 'claude') return model ?? 'Claude';
  if (engine === 'gemini') return `${model ?? 'Gemini'} · Google`;
  if (engine === 'groq') return `${model ?? 'gpt-oss'} · Groq`;
  return 'Motor de reglas SOC AI';
}

export function EngineBadge({ meta }: { meta: AiMeta }) {
  const title = meta.engine === 'reglas'
    ? `Reglas determinísticas y biblioteca SST de SOC; sin modelo generativo.${meta.note ? ` Los modelos de IA no respondieron: ${meta.note}` : ''}`
    : `Razonamiento de ${meta.model}.${meta.note ? ` Se usó como respaldo: ${meta.note}` : ''}`;
  return (
    <span className={`engine ${meta.engine}`} title={title}>
      <span className="dot" />
      {engineName(meta.engine, meta.model)} · {dateTimeEs(meta.generatedAt)}
    </span>
  );
}

export function VerifyNote({ meta }: { meta: AiMeta }) {
  if (meta.verified) {
    return <span className="verify-note"><ICheck width={13} height={13} />Todas las cifras están en el paquete de evidencia</span>;
  }
  return (
    <span className="verify-note warn" title={meta.unverified.map((u) => u.value).join(', ')}>
      <IAlert width={13} height={13} />{meta.unverified.length} cifra{meta.unverified.length > 1 ? 's' : ''} sin respaldo en los datos (subrayadas)
    </span>
  );
}

export function AiHeader({ title, meta, onRegenerate, busy, children }: { title: string; meta?: AiMeta | null; onRegenerate?: () => void; busy?: boolean; children?: ReactNode }) {
  return (
    <div className="ai-head">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <span className="ai-mark"><AiSpark />{title}</span>
        {meta && <EngineBadge meta={meta} />}
      </div>
      <div className="row" style={{ gap: 12 }}>
        {meta && <VerifyNote meta={meta} />}
        {children}
        {onRegenerate && (
          <button className="btn btn-sm btn-ghost" onClick={onRegenerate} disabled={busy}>
            {busy ? <Spinner /> : <IRefresh />}Regenerar
          </button>
        )}
      </div>
    </div>
  );
}

/** Texto con las cifras no verificadas subrayadas. */
export function VText({ text, unverified }: { text: string; unverified?: string[] }) {
  if (!unverified?.length) return <>{text}</>;
  const esc = unverified.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![\\d.,])(${esc.join('|')})(?![\\d])`, 'g');
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => (unverified.includes(p)
        ? <span key={i} className="unverified" title="Esta cifra no aparece en el paquete de evidencia del dataset">{p}</span>
        : <span key={i}>{p}</span>))}
    </>
  );
}

export function unverifiedFor(meta: AiMeta | null | undefined, fieldPrefix: string): string[] {
  return meta?.unverified.filter((u) => u.field === fieldPrefix || u.field.startsWith(`${fieldPrefix}.`)).map((u) => u.value) ?? [];
}

export function FactChips({ ids, facts, title }: { ids: string[]; facts: FactRef[]; title: string }) {
  const open = useEvidence();
  const valid = ids.filter((id) => facts.some((f) => f.id === id));
  if (!valid.length) return null;
  return (
    <span className="row wrap" style={{ gap: 4 }}>
      {valid.map((id) => {
        const f = facts.find((x) => x.id === id)!;
        return (
          <button key={id} type="button" className="fact-chip" title={`${f.label}: ${f.value}`} onClick={() => open({ title, facts, highlight: valid })}>
            {id}
          </button>
        );
      })}
    </span>
  );
}

export function EvidenceButton({ label = 'Ver evidencia', onClick }: { label?: string; onClick: () => void }) {
  return <button type="button" className="evidence-link" onClick={onClick}><IEvidence />{label}</button>;
}
