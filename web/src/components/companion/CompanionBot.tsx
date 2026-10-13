// SOC Companion: robot helicóptero. Rotor principal, rotor de cola, propulsores laterales y patines.
// Toda la animación es CSS (transform/opacity) y depende de `state`:
//   idle      flota suave, rotor a ritmo normal, parpadea
//   thinking  rotor rápido, se inclina hacia adelante, los ojos buscan de lado a lado
//   talking   rotor rápido, los ojos laten y la "boca" de luz se mueve
//   happy     ojos en arco, pequeño salto
//   alert     led y ojos en rojo, se sacude una vez
//   sleep     rotor lento, ojos entrecerrados, flota bajo

export type BotState = 'idle' | 'thinking' | 'talking' | 'happy' | 'alert' | 'sleep';

export function CompanionBot({ state = 'idle', size = 96, title = 'SOC Companion', flyIn = false, still = false }: {
  state?: BotState;
  size?: number;
  title?: string;
  flyIn?: boolean;
  still?: boolean;
}) {
  return (
    <span className={`cbot${flyIn ? ' cbot-flyin' : ''}${still ? ' cbot-still' : ''}`} data-state={state} style={{ width: size, height: size }} role="img" aria-label={`${title}: ${STATE_LABEL[state]}`}>
      <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="cb-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34343a" />
            <stop offset="0.45" stopColor="#1d1d21" />
            <stop offset="1" stopColor="#121214" />
          </linearGradient>
          <linearGradient id="cb-blade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#E0791A" />
            <stop offset="0.14" stopColor="#3f3f46" />
            <stop offset="0.86" stopColor="#3f3f46" />
            <stop offset="1" stopColor="#FBCB3E" />
          </linearGradient>
          <radialGradient id="cb-eye" cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#FFE7A3" />
            <stop offset="0.55" stopColor="#FBCB3E" />
            <stop offset="1" stopColor="#E0791A" />
          </radialGradient>
          <filter id="cb-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <ellipse className="cb-shadow" cx="80" cy="150" rx="34" ry="5" />

        <g className="cb-fly">
          <g className="cb-tilt">
            {/* Rotor principal */}
            <ellipse className="cb-rotor-blur" cx="80" cy="24" rx="62" ry="5" />
            <g className="cb-rotor">
              <rect x="18" y="21" width="124" height="6" rx="3" fill="url(#cb-blade)" />
            </g>
            <rect x="76.5" y="24" width="7" height="16" rx="2.5" fill="#27272a" />
            <ellipse cx="80" cy="24" rx="9" ry="3.6" fill="#3f3f46" />
            <circle cx="80" cy="23.4" r="2" fill="#E0791A" />

            {/* Cola y rotor de cola */}
            <path d="M114 84 L146 80 Q150 80 150 84 L150 86 Q150 89 146 89 L114 92 Z" fill="#232327" />
            <path d="M144 80 L149 68 L153 68 L151 81 Z" fill="#2c2c31" />
            <g className="cb-tailrotor">
              <rect x="146.5" y="62" width="5" height="22" rx="2.5" fill="#52525b" />
              <rect x="138" y="70.5" width="22" height="5" rx="2.5" fill="#52525b" />
            </g>
            <circle cx="149" cy="73" r="2.6" fill="#E0791A" />

            {/* Patines */}
            <path d="M62 108 L55 125 M98 108 L105 125" stroke="#3f3f46" strokeWidth="4" strokeLinecap="round" />
            <rect x="40" y="123" width="80" height="5" rx="2.5" fill="#3f3f46" />
            <rect x="36" y="123" width="10" height="5" rx="2.5" fill="#52525b" />

            {/* Propulsores laterales */}
            <g className="cb-pod cb-pod-l">
              <rect x="26" y="64" width="13" height="26" rx="6.5" fill="#27272a" />
              <ellipse className="cb-thrust" cx="32.5" cy="94" rx="4.5" ry="5" fill="#FBCB3E" filter="url(#cb-glow)" />
            </g>
            <g className="cb-pod cb-pod-r">
              <rect x="121" y="64" width="13" height="26" rx="6.5" fill="#27272a" />
              <ellipse className="cb-thrust" cx="127.5" cy="94" rx="4.5" ry="5" fill="#FBCB3E" filter="url(#cb-glow)" />
            </g>

            {/* Cuerpo */}
            <rect x="38" y="38" width="84" height="74" rx="30" fill="url(#cb-body)" />
            <path d="M52 46 Q80 36 108 46" stroke="#4a4a52" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />

            {/* Visor */}
            <rect x="48" y="52" width="64" height="36" rx="16" fill="#0a0a0c" />
            <rect x="48" y="52" width="64" height="36" rx="16" fill="none" stroke="#3a3a41" strokeWidth="1.5" />
            <circle className="cb-led" cx="105" cy="57" r="2.2" />

            {/* Ojos */}
            <g className="cb-eyes" filter="url(#cb-glow)">
              <g className="cb-eye-open">
                <rect className="cb-eye cb-eye-l" x="60" y="61" width="12" height="17" rx="6" fill="url(#cb-eye)" />
                <rect className="cb-eye cb-eye-r" x="88" y="61" width="12" height="17" rx="6" fill="url(#cb-eye)" />
              </g>
              <g className="cb-eye-happy">
                <path d="M59 72 Q66 62 73 72" stroke="#FBCB3E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
                <path d="M87 72 Q94 62 101 72" stroke="#FBCB3E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
              </g>
            </g>
            {/* "Boca" de luz: tres barras que se mueven al hablar */}
            <g className="cb-mouth">
              <rect className="cb-bar cb-bar-1" x="73" y="81" width="3" height="3" rx="1.5" />
              <rect className="cb-bar cb-bar-2" x="78.5" y="81" width="3" height="3" rx="1.5" />
              <rect className="cb-bar cb-bar-3" x="84" y="81" width="3" height="3" rx="1.5" />
            </g>

            {/* Insignia SOC: los arcos del logo, en forma de sonrisa */}
            <path d="M64 96 Q80 106 96 96" stroke="#E0791A" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M69 101 Q80 108 91 101" stroke="#FBCB3E" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </span>
  );
}

const STATE_LABEL: Record<BotState, string> = {
  idle: 'en espera', thinking: 'pensando', talking: 'respondiendo', happy: 'listo', alert: 'algo salió mal', sleep: 'en reposo',
};
