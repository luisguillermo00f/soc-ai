import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, send } from '../lib/api.ts';
import { SocMark } from '../components/Icons.tsx';
import { Spinner } from '../components/ui.tsx';

export function Auth({ onDone }: { onDone: () => void }) {
  const state = useQuery({ queryKey: ['auth-state'], queryFn: () => get<{ setupRequired: boolean; presentation?: boolean }>('/auth/state') });
  const setup = state.data?.setupRequired;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send('POST', setup ? '/auth/setup' : '/auth/login', setup ? { email, name, password } : { email, password });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-form">
        <div className="row" style={{ gap: 10 }}>
          <SocMark width={32} height={32} />
          <div>
            <div className="brand-name">SOC AI</div>
            <div className="brand-sub">Salud Ocupacional del Caribe</div>
          </div>
        </div>
        <h1>{state.isLoading ? ' ' : setup ? 'Configura el administrador' : 'Ingresa a SOC AI'}</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          {setup
            ? 'Es la primera vez que se abre esta instalación. Esta cuenta podrá crear usuarios y ajustar la metodología.'
            : 'La información de siniestralidad es confidencial. El acceso queda registrado.'}
        </p>
        <form onSubmit={submit} noValidate>
          {setup && (
            <div className="field">
              <label htmlFor="name">Nombre</label>
              <input id="name" className="input" style={{ height: 38 }} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" className="input" style={{ height: 38 }} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" className="input" style={{ height: 38 }} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} required aria-describedby={setup ? 'pw-help' : undefined} />
            {setup && <span id="pw-help" className="help">Mínimo 10 caracteres, con letras y números.</span>}
          </div>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !email || !password || (setup && !name)}>
            {busy && <Spinner />}{setup ? 'Crear administrador e ingresar' : 'Ingresar'}
          </button>
        </form>
        {state.data?.presentation && !setup && (
          <button type="button" className="btn btn-ai btn-lg" style={{ marginTop: 12, maxWidth: 360, width: '100%' }} disabled={busy}
            onClick={async () => { setBusy(true); try { await send('POST', '/auth/presentation'); onDone(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo entrar.'); } finally { setBusy(false); } }}>
            Entrar sin contraseña (presentación)
          </button>
        )}
      </section>
      <section className="auth-side" aria-hidden="true">
        <h2>De la base de siniestralidad a decisiones defendibles.</h2>
        <div className="auth-flow">
          <div><b>Datos.</b> El Excel tal como llega, sin limpiarlo a mano.</div>
          <div><b>Patrones.</b> Recurrencias, rachas y anomalías con prueba estadística.</div>
          <div><b>Hallazgos.</b> Qué está pasando en cada empresa, con evidencia.</div>
          <div><b>Acciones.</b> Planes de choque adaptados a cada caso.</div>
        </div>
      </section>
    </div>
  );
}
