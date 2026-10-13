import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { EventFilter } from '@shared/types.ts';
import type { EvidenceRequest } from '../lib/evidence.tsx';
import { EventsTable } from './EventsTable.tsx';
import { IClose } from './Icons.tsx';

export function EvidenceDrawer({ req, onClose }: { req: EvidenceRequest; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [onClose]);

  const hl = new Set(req.highlight ?? []);
  const facts = req.facts ?? [];
  const shown = hl.size ? [...facts.filter((f) => hl.has(f.id)), ...facts.filter((f) => !hl.has(f.id))] : facts;
  const linkedIds = [...new Set(facts.filter((f) => hl.has(f.id)).flatMap((f) => f.eventIds ?? []))];
  const linkedFilter = facts.find((f) => hl.has(f.id) && f.filter)?.filter;
  const filter: EventFilter | undefined = req.eventIds?.length ? { ids: req.eventIds }
    : req.filter ?? (linkedIds.length ? { ids: linkedIds } : linkedFilter);
  const accidentsLink = filter && !filter.ids ? `/accidentes?f=${encodeURIComponent(JSON.stringify(filter))}` : null;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={`Evidencia: ${req.title}`} tabIndex={-1} ref={ref} style={{ width: 'min(780px, 100vw)' }}>
        <div className="drawer-head">
          <div>
            <div className="faint" style={{ fontSize: 'var(--t-sm)' }}>Evidencia</div>
            <h2>{req.title}</h2>
            {req.subtitle && <p className="muted" style={{ marginTop: 4, fontSize: 'var(--t-md)' }}>{req.subtitle}</p>}
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar evidencia"><IClose /></button>
        </div>
        <div className="drawer-body stack">
          {req.stats && req.stats.length > 0 && (
            <div className="facts">
              {req.stats.map((s, i) => (
                <div className="fact" key={i} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  <div className="flabel">{s.label}</div><div className="fval num">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {shown.length > 0 && (
            <div>
              <h3 style={{ fontSize: 'var(--t-base)', marginBottom: 4 }}>Hechos del paquete de evidencia</h3>
              <p className="faint" style={{ fontSize: 'var(--t-sm)', marginBottom: 10 }}>
                Calculados por el motor estadístico. Es la única información que recibe la IA{hl.size ? '; los resaltados sustentan esta conclusión' : ''}.
              </p>
              <div className="facts">
                {shown.map((f) => (
                  <div key={f.id} className={`fact${hl.has(f.id) ? ' hl' : ''}`}>
                    <span className="fid">{f.id}</span>
                    <div><div className="flabel">{f.label}</div><div className="fval">{f.value}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {filter && (
            <div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ fontSize: 'var(--t-base)' }}>Registros que lo producen</h3>
                {accidentsLink && <Link className="btn btn-sm" to={accidentsLink} onClick={onClose}>Abrir en Accidentes</Link>}
              </div>
              <div className="panel"><EventsTable filter={filter} pageSize={15} /></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
