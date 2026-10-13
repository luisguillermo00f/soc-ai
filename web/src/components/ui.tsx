import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Nature, RiskLevel, Trend } from '@shared/types.ts';
import { LEVEL_BARS, LEVEL_LABEL, signedPct } from '../lib/format.ts';
import { ApiError } from '../lib/api.ts';
import { IArrowDown, IArrowUp, IInfo } from './Icons.tsx';
import { Link } from 'react-router-dom';

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const on = LEVEL_BARS[level];
  return (
    <span className={`risk ${level}`} title={`Nivel ${LEVEL_LABEL[level]}${score !== undefined ? `, ${score}/100` : ''}`}>
      <span className="risk-bars" aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= on ? 'on' : ''} />)}</span>
      {LEVEL_LABEL[level]}{score !== undefined && <span className="num" style={{ fontWeight: 500, opacity: 0.85 }}>· {score}</span>}
    </span>
  );
}

const NATURE_LABEL: Record<Nature, string> = { dato: 'Dato', patron: 'Patrón', hallazgo: 'Hallazgo', hipotesis: 'Hipótesis', recomendacion: 'Recomendación' };
export function NatureChip({ nature }: { nature: Nature }) {
  return <span className={`nature ${nature}`}>{NATURE_LABEL[nature]}</span>;
}

export function ConfTag({ c, prefix = 'Confianza' }: { c: 'alta' | 'media' | 'baja'; prefix?: string }) {
  return <span className={`tag c-${c}`} title={`Confianza ${c}: depende del tamaño de muestra y de la significancia estadística`}>{prefix} {c}</span>;
}

/** Variación con flecha y signo. "up" es malo en accidentalidad (texto crítico). */
export function TrendDelta({ trend, compact }: { trend: Trend; compact?: boolean }) {
  if (trend.direction === 'new') return <span className="delta up"><IArrowUp width={12} height={12} />nuevo</span>;
  if (trend.change === null) return <span className="delta flat">–</span>;
  const cls = trend.change > 0.1 ? 'up' : trend.change < -0.1 ? 'down' : 'flat';
  return (
    <span className={`delta ${cls}`} title={`${trend.previous} → ${trend.recent} entre semestres${trend.significant ? ' (significativo)' : ''}`}>
      {cls === 'up' && <IArrowUp width={12} height={12} />}{cls === 'down' && <IArrowDown width={12} height={12} />}
      {compact ? `${trend.previous}→${trend.recent}` : signedPct(trend.change)}
      {trend.significant && <span aria-label="significativo" title="Cambio estadísticamente significativo">*</span>}
    </span>
  );
}

export function Delta({ value, goodWhenDown = true }: { value: number | null; goodWhenDown?: boolean }) {
  if (value === null) return <span className="delta flat">–</span>;
  const up = value > 0.005;
  const down = value < -0.005;
  const cls = !up && !down ? 'flat' : (up === goodWhenDown ? 'up' : 'down');
  return <span className={`delta ${cls}`}>{up && <IArrowUp width={12} height={12} />}{down && <IArrowDown width={12} height={12} />}{signedPct(value)}</span>;
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skel" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Cargando">
      <Skeleton h={28} w={280} />
      <Skeleton h={96} />
      <div className="grid-main"><Skeleton h={280} /><Skeleton h={280} /></div>
      <Skeleton h={220} />
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  if (error instanceof ApiError && error.code === 'NO_DATASET') {
    return (
      <div className="panel">
        <Empty title="Aún no hay datos para analizar" action={<Link className="btn btn-primary" to="/importar">Importar Excel</Link>}>
          Sube el Excel de siniestralidad (AT y EL). SOC AI detecta las columnas, limpia los datos y ejecuta el escaneo completo.
        </Empty>
      </div>
    );
  }
  return (
    <div className="error-box" role="alert">
      <span>{error instanceof Error ? error.message : 'No se pudo cargar la información.'}</span>
      {retry && <button className="btn btn-sm" onClick={retry}>Reintentar</button>}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className="faint" title={typeof children === 'string' ? children : undefined} style={{ display: 'inline-flex' }}><IInfo width={13} height={13} /></span>;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ── Toasts ── */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}
