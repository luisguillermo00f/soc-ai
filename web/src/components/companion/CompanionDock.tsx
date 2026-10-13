// Lanzador flotante: el robot vuela en la esquina; al tocarlo despega y abre el panel de conversación.
// La primera vez en la sesión, avisa con una burbuja del hallazgo más importante del escaneo.

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCompanion } from '../../lib/companion.tsx';
import { useSession } from '../../lib/session.tsx';
import { useOverview } from '../../lib/queries.ts';
import { CompanionBot } from './CompanionBot.tsx';
import { CompanionChat } from './CompanionChat.tsx';
import { engineName } from '../ai.tsx';
import { IClose, IArrowRight } from '../Icons.tsx';

const BUBBLE_KEY = 'socai.companion.bubble';

export function CompanionDock() {
  const { open, setOpen, botState, busy, ask, msgs } = useCompanion();
  const { ai } = useSession();
  const loc = useLocation();
  const overview = useOverview();
  const [taking, setTaking] = useState(false);
  const [bubble, setBubble] = useState(false);
  const lastEngine = [...msgs].reverse().find((m) => m.role === 'assistant' && m.engine);
  const hidden = loc.pathname.startsWith('/asistente') || loc.pathname.startsWith('/reportes/');

  const top = overview.data?.insights.find((i) => i.severity === 'alta');
  useEffect(() => {
    if (!top || hidden) return;
    let seen = false;
    try { seen = sessionStorage.getItem(BUBBLE_KEY) === '1'; } catch { /* sin almacenamiento */ }
    if (seen) return;
    const t = setTimeout(() => setBubble(true), 2600);
    return () => clearTimeout(t);
  }, [top, hidden]);

  const dismissBubble = () => { setBubble(false); try { sessionStorage.setItem(BUBBLE_KEY, '1'); } catch { /* */ } };
  const launch = () => {
    dismissBubble();
    setTaking(true);
    setTimeout(() => { setOpen(true); setTaking(false); }, 260);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (hidden) return null;

  if (open) {
    return (
      <section className="companion-panel" role="dialog" aria-label="SOC Companion IA">
        <header className="companion-head">
          <CompanionBot size={46} state={botState} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ch-title">SOC Companion IA</div>
            <div className="ch-sub"><span className={`dot${busy ? ' busy' : ''}`} />{busy ? (botState === 'thinking' ? 'Consultando el dataset' : 'Respondiendo') : lastEngine ? `Respondió ${engineName(lastEngine.engine, lastEngine.model)}` : ai.enabled ? `${ai.model} · ${ai.provider.replace(/ \(.*$/, '')}` : 'Motor de reglas'}</div>
          </div>
          <Link className="btn btn-ghost btn-sm" to="/asistente" onClick={() => setOpen(false)} title="Abrir en pantalla completa">Ampliar</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Cerrar SOC Companion"><IClose /></button>
        </header>
        <div className="companion-body"><CompanionChat compact /></div>
      </section>
    );
  }

  return (
    <div className="companion-dock">
      {bubble && top && (
        <div className="companion-bubble" role="status">
          <b>Encontré algo que deberías revisar</b>
          {top.title}.
          <br />
          <button className="bubble-cta" onClick={() => { launch(); ask(`Explícame este hallazgo y qué debería hacer SOC: ${top.title}`); }}>
            Cuéntame más <IArrowRight width={12} height={12} style={{ verticalAlign: '-2px' }} />
          </button>
          <button className="bubble-x" onClick={dismissBubble} aria-label="Cerrar aviso"><IClose width={14} height={14} /></button>
        </div>
      )}
      <button className={`companion-launch${taking ? ' taking-off' : ''}`} onClick={launch} aria-label={`Abrir SOC Companion IA${msgs.length ? ` (${Math.floor(msgs.length / 2)} preguntas en esta sesión)` : ''}`} title="SOC Companion IA">
        <CompanionBot size={86} state={taking ? 'thinking' : busy ? botState : bubble ? 'happy' : botState} flyIn />
      </button>
    </div>
  );
}

/** Marca la empresa abierta como contexto del Companion. */
export function useCompanionContext(key?: string, name?: string) {
  const { setContext } = useCompanion();
  useEffect(() => {
    if (key && name) setContext({ key, name });
    return () => setContext(null);
  }, [key, name, setContext]);
}
