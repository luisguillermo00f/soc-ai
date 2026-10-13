import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompanion } from '../lib/companion.tsx';
import { useSession } from '../lib/session.tsx';
import { useFacets } from '../lib/queries.ts';
import { CompanionBot } from '../components/companion/CompanionBot.tsx';
import { CompanionChat } from '../components/companion/CompanionChat.tsx';

const STATE_TEXT = { idle: 'Listo para ayudarte', thinking: 'Consultando el dataset', talking: 'Respondiendo', happy: 'Respuesta lista', alert: 'Algo salió mal', sleep: 'En reposo' } as const;

export function Assistant() {
  const { ai } = useSession();
  const { msgs, reset, botState, setContext, setOpen } = useCompanion();
  const [params] = useSearchParams();
  const facets = useFacets();
  const empresa = params.get('empresa');

  useEffect(() => { setOpen(false); }, [setOpen]);
  useEffect(() => {
    const c = facets.data?.companies.find((x) => x.key === empresa);
    if (c) setContext({ key: c.key, name: c.name });
  }, [empresa, facets.data, setContext]);

  return (
    <div className="companion-page">
      <div className="companion-hero">
        <CompanionBot size={92} state={botState} flyIn />
        <div style={{ flex: 1 }}>
          <h1>SOC Companion IA</h1>
          <p className="sub" style={{ color: 'var(--muted)', marginTop: 2 }}>
            {STATE_TEXT[botState]}. {ai.enabled
              ? `Razona con ${ai.model} (${ai.provider}) y consulta las cifras con las herramientas del motor estadístico; no responde de memoria.`
              : 'Sin clave de IA configurada: responde el motor de reglas a preguntas frecuentes, con cifras del dataset.'}
          </p>
        </div>
        {msgs.length > 0 && <button className="btn" onClick={reset}>Nueva conversación</button>}
      </div>
      <div className="panel"><CompanionChat /></div>
    </div>
  );
}
