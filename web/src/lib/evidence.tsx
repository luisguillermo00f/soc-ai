// "Ver evidencia": cualquier conclusión abre este panel con los hechos y los registros que la producen.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { EventFilter, FactRef } from '@shared/types.ts';
import { EvidenceDrawer } from '../components/EvidenceDrawer.tsx';

export interface EvidenceRequest {
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string }[];
  facts?: FactRef[];
  highlight?: string[];
  eventIds?: string[];
  filter?: EventFilter;
}

const Ctx = createContext<(r: EvidenceRequest) => void>(() => {});
export const useEvidence = () => useContext(Ctx);

export function EvidenceProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<EvidenceRequest | null>(null);
  const open = useCallback((r: EvidenceRequest) => setReq(r), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {req && <EvidenceDrawer req={req} onClose={() => setReq(null)} />}
    </Ctx.Provider>
  );
}
