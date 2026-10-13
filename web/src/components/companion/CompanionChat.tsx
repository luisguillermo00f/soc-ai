import { useEffect, useRef, useState } from 'react';
import { useCompanion } from '../../lib/companion.tsx';
import { useSession } from '../../lib/session.tsx';
import { Markdown } from '../Markdown.tsx';
import { CompanionBot } from './CompanionBot.tsx';
import { engineName } from '../ai.tsx';
import { ISend, IClose } from '../Icons.tsx';
import { Spinner } from '../ui.tsx';

export const SUGGESTIONS = [
  '¿Qué empresa debería visitar primero?',
  '¿Qué accidente se repite más?',
  '¿Qué patrón encuentras que yo no haya visto?',
  '¿Qué asesor tiene empresas con más accidentes?',
  '¿Cuál fue la empresa con más accidentes en 2025?',
  '¿Por qué aumentaron los accidentes?',
  '¿Qué debería investigar un profesional SST?',
];

export function CompanionChat({ compact = false }: { compact?: boolean }) {
  const { msgs, busy, ask, stop, context, setContext, botState } = useCompanion();
  const { user, ai } = useSession();
  const [input, setInput] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [msgs]);
  useEffect(() => { if (!busy) ta.current?.focus(); }, [busy]);

  const send = (q: string) => { if (!q.trim() || busy) return; ask(q); setInput(''); if (ta.current) ta.current.style.height = 'auto'; };

  return (
    <div className={`cchat${compact ? ' cchat-compact' : ''}`}>
      <div className="cchat-scroll" ref={scroll}>
        {!msgs.length && (
          <div className="cchat-empty">
            {!compact && <CompanionBot size={112} state={botState} flyIn />}
            <h2>¿En qué te ayudo, {user.name.split(' ')[0]}?</h2>
            <p>Consulto el dataset con el motor estadístico antes de responder. Separo dato, interpretación e hipótesis, y enlazo a cada empresa.</p>
            <div className="suggestions">{SUGGESTIONS.slice(0, compact ? 4 : 7).map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => {
          const isLast = i === msgs.length - 1;
          return (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
              <div className="who" aria-hidden="true">
                {m.role === 'user' ? user.name.slice(0, 1).toUpperCase() : <CompanionBot size={34} still state={isLast && busy ? botState : 'idle'} />}
              </div>
              <div className="msg-body">
                {m.role === 'user' ? <p>{m.content}</p> : (
                  <>
                    {m.status && <div className="msg-status"><Spinner />{m.status}…</div>}
                    {m.content && <Markdown text={m.content} unverified={m.unverified} />}
                    {m.error && <div className="error-box" role="alert">{m.error}</div>}
                    {!m.pending && m.engine && (
                      <div className="msg-meta">
                        <span className={`engine ${m.engine}`} title={m.note ? `Motores que no respondieron: ${m.note}` : undefined}><span className="dot" />{engineName(m.engine, m.model)}</span>
                        {m.engine !== 'reglas' && (m.unverified?.length
                          ? <span className="verify-note warn">{m.unverified.length} cifra(s) sin respaldo en las consultas (subrayadas)</span>
                          : <span className="verify-note">Cifras verificadas contra las consultas al dataset</span>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cchat-foot">
        {context && (
          <div className="row" style={{ marginBottom: 8, fontSize: 'var(--t-sm)' }}>
            <span className="tag" style={{ gap: 6 }}>
              Contexto: {context.name}
              <button className="btn btn-ghost btn-sm" style={{ height: 18, padding: '0 2px' }} onClick={() => setContext(null)} aria-label="Quitar contexto"><IClose width={12} height={12} /></button>
            </span>
          </div>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea
            ref={ta}
            rows={1}
            value={input}
            placeholder={ai.enabled ? 'Pregúntale a SOC Companion…' : 'Pregunta (motor de reglas)…'}
            aria-label="Pregunta para SOC Companion"
            onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          />
          {busy
            ? <button type="button" className="btn" onClick={stop}>Detener</button>
            : <button type="submit" className="btn btn-primary" disabled={!input.trim()} aria-label="Enviar"><ISend /></button>}
        </form>
      </div>
    </div>
  );
}
