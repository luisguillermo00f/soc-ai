import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiStatus, SessionUser } from '@shared/types.ts';
import { get, send } from './api.ts';

interface Session { user: SessionUser; ai: AiStatus; logout: () => Promise<void> }
const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('Sin sesión');
  return s;
}

export function useCan(min: 'analista' | 'admin'): boolean {
  const { user } = useSession();
  return min === 'admin' ? user.role === 'admin' : user.role !== 'lector';
}

export function SessionGate({ children, fallback }: { children: ReactNode; fallback: (refresh: () => void) => ReactNode }) {
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const me = useQuery({
    queryKey: ['me', tick],
    queryFn: () => get<{ user: SessionUser; ai: AiStatus }>('/auth/me'),
    retry: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    const h = () => { qc.clear(); setTick((t) => t + 1); };
    window.addEventListener('socai:unauthorized', h);
    return () => window.removeEventListener('socai:unauthorized', h);
  }, [qc]);
  if (me.isLoading) return <div style={{ minHeight: '100vh' }} aria-busy="true" />;
  if (!me.data) return <>{fallback(() => setTick((t) => t + 1))}</>;
  const logout = async () => { await send('POST', '/auth/logout'); qc.clear(); setTick((t) => t + 1); };
  return <Ctx.Provider value={{ user: me.data.user, ai: me.data.ai, logout }}>{children}</Ctx.Provider>;
}
