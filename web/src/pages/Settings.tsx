import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role, ScoringConfig } from '@shared/types.ts';
import { get, send } from '../lib/api.ts';
import { useCan, useSession } from '../lib/session.tsx';
import { dateTimeEs } from '../lib/format.ts';
import { RiskBadge, Seg, Spinner, useToast } from '../components/ui.tsx';
import { IShield } from '../components/Icons.tsx';

type Tab = 'metodologia' | 'ia' | 'usuarios' | 'auditoria';

export function Settings() {
  const admin = useCan('admin');
  const [tab, setTab] = useState<Tab>('metodologia');
  return (
    <>
      <div className="page-head"><div><h1>Ajustes</h1><p className="sub">Metodología del puntaje, estado de la IA, usuarios y registro de auditoría.</p></div></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'metodologia'} onClick={() => setTab('metodologia')}>Metodología</button>
        <button role="tab" aria-selected={tab === 'ia'} onClick={() => setTab('ia')}>Inteligencia artificial</button>
        {admin && <button role="tab" aria-selected={tab === 'usuarios'} onClick={() => setTab('usuarios')}>Usuarios</button>}
        {admin && <button role="tab" aria-selected={tab === 'auditoria'} onClick={() => setTab('auditoria')}>Auditoría</button>}
      </div>
      {tab === 'metodologia' && <Methodology />}
      {tab === 'ia' && <AiPanel />}
      {tab === 'usuarios' && admin && <Users />}
      {tab === 'auditoria' && admin && <Audit />}
    </>
  );
}

function Methodology() {
  const admin = useCan('admin');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['methodology'], queryFn: () => get<{ factors: { id: string; label: string; doc: string }[]; config: ScoringConfig; defaults: ScoringConfig }>('/methodology') });
  const [cfg, setCfg] = useState<ScoringConfig | null>(null);
  useEffect(() => { if (q.data) setCfg(q.data.config); }, [q.data]);
  const save = useMutation({
    mutationFn: (c: ScoringConfig) => send('PUT', '/settings/scoring', c),
    onSuccess: () => { qc.invalidateQueries(); toast('Metodología guardada. Puntajes recalculados.'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo guardar.'),
  });
  if (!q.data || !cfg) return <Spinner />;
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  const setW = (id: string, v: number) => setCfg({ ...cfg, weights: { ...cfg.weights, [id]: v } });
  const setT = (k: keyof ScoringConfig['thresholds'], v: number) => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, [k]: v } });
  return (
    <div className="grid-main" style={{ alignItems: 'start' }}>
      <section className="panel">
        <div className="panel-head"><div><h2>Pesos de los factores</h2><p className="question">Se normalizan a 100 puntos. Suma actual: {total}.</p></div></div>
        <div className="panel-body stack">
          {q.data.factors.map((f) => (
            <div key={f.id} className="field">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label htmlFor={`w-${f.id}`}>{f.label}</label>
                <span className="num" style={{ fontWeight: 600 }}>{cfg.weights[f.id] ?? 0}</span>
              </div>
              <input id={`w-${f.id}`} type="range" min={0} max={50} step={1} value={cfg.weights[f.id] ?? 0} onChange={(e) => setW(f.id, Number(e.target.value))} disabled={!admin} />
              <span className="help">{f.doc}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Umbrales de nivel</h2><p className="question">Puntaje mínimo para cada nivel.</p></div></div>
        <div className="panel-body stack">
          {(['critico', 'prioritario', 'atencion'] as const).map((k) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
              <RiskBadge level={k} />
              <input className="input num" type="number" min={1} max={100} style={{ width: 80 }} value={cfg.thresholds[k]} onChange={(e) => setT(k, Number(e.target.value))} disabled={!admin} aria-label={`Umbral ${k}`} />
            </div>
          ))}
          <div className="field">
            <label htmlFor="minev">Evidencia mínima (accidentes)</label>
            <input id="minev" className="input num" type="number" min={1} max={20} style={{ width: 80 }} value={cfg.minEvidence} onChange={(e) => setCfg({ ...cfg, minEvidence: Number(e.target.value) })} disabled={!admin} />
            <span className="help">Por debajo de este número, una empresa no puede ser crítica sin eventos graves.</span>
          </div>
          {admin ? (
            <div className="row">
              <button className="btn btn-primary" onClick={() => save.mutate(cfg)} disabled={save.isPending}>{save.isPending && <Spinner />}Guardar y recalcular</button>
              <button className="btn" onClick={() => setCfg(q.data!.defaults)}>Restaurar valores por defecto</button>
            </div>
          ) : <p className="faint">Solo un administrador puede cambiar la metodología.</p>}
        </div>
      </section>
    </div>
  );
}

function AiPanel() {
  const { ai } = useSession();
  return (
    <section className="panel panel-pad stack" style={{ maxWidth: 760 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className={`engine ${ai.enabled ? 'claude' : ''}`}><span className="dot" /></span>
        <h2 style={{ fontSize: 'var(--t-lg)' }}>{ai.enabled ? `IA activa: ${ai.model} · ${ai.provider}` : 'IA no configurada'}</h2>
      </div>
      <p className="muted">{ai.reason}</p>
      {ai.enabled && <p className="muted">Esfuerzo de razonamiento: <b>{ai.effort}</b>. Las respuestas usan salida estructurada y se verifican contra el paquete de evidencia.</p>}
      <div className="notice">
        <IShield />
        <span>
          Las claves viven solo en el servidor (archivo .env: ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY) y nunca llegan al navegador. Orden de uso: Claude si hay clave, luego Gemini y luego Groq; si ninguno responde, el motor de reglas. A la IA se envían cifras agregadas, nombres de empresas y seudónimos de trabajadores; nunca nombres ni documentos de personas.
          {!ai.enabled && ' Para activarla, agrega la clave en .env y reinicia el servidor.'}
        </span>
      </div>
      <div>
        <h3 style={{ fontSize: 'var(--t-base)', marginBottom: 6 }}>Separación de responsabilidades</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-md)' }}>
          <li>El motor estadístico calcula conteos, porcentajes, tendencias, pruebas exactas, patrones y puntajes.</li>
          <li>El modelo de IA interpreta, relaciona, formula hipótesis, prioriza y redacta planes a partir de esos resultados.</li>
          <li>Toda cifra escrita por la IA se compara con el paquete de evidencia; las que no aparecen se marcan en la interfaz.</li>
        </ul>
      </div>
    </section>
  );
}

interface UserRow { id: string; email: string; name: string; role: Role; disabled: number; created_at: string }

function Users() {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['users'], queryFn: () => get<{ users: UserRow[] }>('/admin/users') });
  const [form, setForm] = useState({ name: '', email: '', role: 'analista' as Role, password: '' });
  const create = useMutation({
    mutationFn: () => send('POST', '/admin/users', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setForm({ name: '', email: '', role: 'analista', password: '' }); toast('Usuario creado.'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo crear.'),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: Role; disabled?: boolean } }) => send('PATCH', `/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo actualizar.'),
  });
  return (
    <div className="grid-main" style={{ alignItems: 'start' }}>
      <section className="panel">
        <table className="data">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {q.data?.users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 550 }}>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>
                  {u.id === user.id ? 'Administrador' : (
                    <select className="select" value={u.role} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })} aria-label={`Rol de ${u.name}`}>
                      <option value="admin">Administrador</option><option value="analista">Analista</option><option value="lector">Lector</option>
                    </select>
                  )}
                </td>
                <td>{u.disabled ? <span className="tag alta">Desactivado</span> : <span className="tag">Activo</span>}</td>
                <td className="r">{u.id !== user.id && <button className="btn btn-sm" onClick={() => update.mutate({ id: u.id, body: { disabled: !u.disabled } })}>{u.disabled ? 'Activar' : 'Desactivar'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Nuevo usuario</h2><p className="question">Lector: consulta. Analista: importa y genera análisis. Administrador: todo.</p></div></div>
        <form className="panel-body stack" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="field"><label htmlFor="un">Nombre</label><input id="un" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="ue">Correo</label><input id="ue" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Rol</label>
            <Seg label="Rol" value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={[{ value: 'lector', label: 'Lector' }, { value: 'analista', label: 'Analista' }, { value: 'admin', label: 'Administrador' }]} />
          </div>
          <div className="field"><label htmlFor="up">Contraseña inicial</label><input id="up" type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><span className="help">Mínimo 10 caracteres, con letras y números.</span></div>
          <button className="btn btn-primary" type="submit" disabled={create.isPending || !form.name || !form.email || !form.password}>{create.isPending && <Spinner />}Crear usuario</button>
        </form>
      </section>
    </div>
  );
}

function Audit() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => get<{ entries: { at: string; action: string; detail: string | null; name: string | null }[] }>('/admin/audit') });
  const LABEL: Record<string, string> = {
    login: 'Ingreso', setup: 'Configuración inicial', 'dataset.inspect': 'Archivo inspeccionado', 'dataset.import': 'Dataset importado',
    'dataset.activate': 'Dataset activado', 'dataset.delete': 'Dataset eliminado', 'scoring.update': 'Metodología modificada',
    'user.create': 'Usuario creado', 'user.update': 'Usuario modificado', 'ai.whats': 'Análisis de empresa', 'ai.plan': 'Plan de choque',
    'ai.compare': 'Comparación', 'ai.executive': 'Lectura ejecutiva', 'assistant.ask': 'Consulta al asistente',
  };
  return (
    <section className="panel">
      <table className="data">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>
          {q.data?.entries.map((e, i) => (
            <tr key={i}>
              <td className="muted num" style={{ whiteSpace: 'nowrap' }}>{dateTimeEs(e.at)}</td>
              <td>{e.name ?? 'Sistema'}</td>
              <td style={{ fontWeight: 550 }}>{LABEL[e.action] ?? e.action}</td>
              <td className="mono faint" style={{ fontSize: 'var(--t-xs)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.detail ?? ''}>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
