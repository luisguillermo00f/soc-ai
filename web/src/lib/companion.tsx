// Conversación de SOC Companion, compartida entre el panel flotante y la página completa.
// Se guarda en sessionStorage: sobrevive a la navegación, no a cerrar la pestaña.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AiEngine } from '@shared/types.ts';
import type { BotState } from '../components/companion/CompanionBot.tsx';
import { stream } from './api.ts';

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  engine?: AiEngine;
  model?: string | null;
  unverified?: string[];
  note?: string;
  error?: string;
  pending?: boolean;
}

interface Companion {
  msgs: Msg[];
  busy: boolean;
  botState: BotState;
  open: boolean;
  setOpen: (v: boolean) => void;
  context: { key: string; name: string } | null;
  setContext: (c: { key: string; name: string } | null) => void;
  ask: (q: string) => void;
  stop: () => void;
  reset: () => void;
}

const STORE = 'socai.companion.chat';
const Ctx = createContext<Companion | null>(null);

export function useCompanion(): Companion {
  const c = useContext(Ctx);
  if (!c) throw new Error('Sin CompanionProvider');
  return c;
}

function load(): Msg[] {
  try { return (JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as Msg[]).filter((m) => !m.pending); } catch { return []; }
}

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<{ key: string; name: string } | null>(null);
  const [mood, setMood] = useState<BotState | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(msgs.filter((m) => !m.pending))); } catch { /* sin almacenamiento */ }
  }, [msgs]);

  const flash = (s: BotState) => { setMood(s); setTimeout(() => setMood(null), s === 'happy' ? 1800 : 2400); };

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = msgs.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', pending: true, status: 'Pensando' }]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((list) => { const copy = [...list]; copy[copy.length - 1] = fn(copy[copy.length - 1]!); return copy; });
    let failed = false;
    try {
      await stream('/ai/chat', { question: q, history, context: context ? `empresa:${context.key} (${context.name})` : null }, (ev) => {
        if (ev.type === 'text') patch((m) => ({ ...m, content: m.content + ev.delta, status: undefined }));
        else if (ev.type === 'status') patch((m) => ({ ...m, status: ev.text }));
        else if (ev.type === 'done') patch((m) => ({ ...m, pending: false, status: undefined, engine: ev.engine, model: ev.model, unverified: ev.unverified, note: ev.note }));
        else if (ev.type === 'error') { failed = true; patch((m) => ({ ...m, pending: false, status: undefined, error: ev.message })); }
      }, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) { failed = true; patch((m) => ({ ...m, pending: false, status: undefined, error: e instanceof Error ? e.message : 'Error de conexión.' })); }
    } finally {
      patch((m) => ({ ...m, pending: false, status: undefined }));
      setBusy(false);
      flash(failed ? 'alert' : 'happy');
    }
  }, [busy, msgs, context]);

  const stop = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => { abort.current?.abort(); setMsgs([]); }, []);

  const last = msgs[msgs.length - 1];
  const botState: BotState = busy ? (last?.content ? 'talking' : 'thinking') : mood ?? 'idle';

  const value = useMemo(() => ({ msgs, busy, botState, open, setOpen, context, setContext, ask, stop, reset }), [msgs, busy, botState, open, context, ask, stop, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
