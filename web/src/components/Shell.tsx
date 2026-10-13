import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DatasetSummary } from '@shared/types.ts';
import { get } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { useFacets, useOverview } from '../lib/queries.ts';
import { dateEs, initials, LEVEL_LABEL } from '../lib/format.ts';
import {
  IAlert, IBuilding, IUsers, IShield, IBulb, IChat, ICompare, IHome, IList, ILogout, IPattern, IPlan, IReport, IScan, ISearch, ISettings, ITrend, SocMark,
} from './Icons.tsx';
import { PageSkeleton } from './ui.tsx';
import { CompanionDock } from './companion/CompanionDock.tsx';

const NAV: { group?: string; items: { to: string; label: string; icon: (p: any) => ReactNode; end?: boolean; badge?: 'critical' }[] }[] = [
  { items: [{ to: '/', label: 'Inicio', icon: IHome, end: true }] },
  { group: 'Datos', items: [{ to: '/importar', label: 'Escaneo', icon: IScan }, { to: '/accidentes', label: 'Accidentes', icon: IList }] },
  {
    group: 'Análisis',
    items: [
      { to: '/empresas', label: 'Empresas', icon: IBuilding },
      { to: '/asesores', label: 'Asesores', icon: IUsers, end: true },
      { to: '/asesores-apa', label: 'Asesores APA', icon: IShield },
      { to: '/criticas', label: 'Empresas críticas', icon: IAlert, badge: 'critical' },
      { to: '/patrones', label: 'Patrones', icon: IPattern },
      { to: '/tendencias', label: 'Tendencias', icon: ITrend },
      { to: '/insights', label: 'Insights', icon: IBulb },
      { to: '/comparar', label: 'Comparar', icon: ICompare },
    ],
  },
  {
    group: 'Acción',
    items: [
      { to: '/planes', label: 'Planes de choque', icon: IPlan },
      { to: '/asistente', label: 'SOC Companion IA', icon: IChat },
      { to: '/reportes', label: 'Reportes', icon: IReport },
    ],
  },
];

export function Shell() {
  const { user, logout } = useSession();
  const overview = useOverview();
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: () => get<{ datasets: DatasetSummary[] }>('/datasets') });
  const active = datasets.data?.datasets.find((d) => d.active);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setPalette(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const critical = overview.data?.levels.critico ?? 0;

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <NavLink to="/" className="brand" aria-label="SOC AI, inicio">
          <SocMark className="brand-mark" />
          <span className="brand-text">
            <div className="brand-name">SOC AI</div>
            <div className="brand-sub">Intelligent Occupational Safety</div>
          </span>
        </NavLink>
        <nav className="nav">
          {NAV.map((g, gi) => (
            <div key={gi} style={{ display: 'contents' }}>
              {g.group && <div className="nav-group">{g.group}</div>}
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} title={it.label}>
                  <it.icon />
                  <span>{it.label}</span>
                  {it.badge === 'critical' && critical > 0 && <span className="count" aria-label={`${critical} críticas`}>{critical}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <nav className="nav">
            <NavLink to="/ajustes" title="Ajustes"><ISettings /><span>Ajustes</span></NavLink>
          </nav>
          <p className="foot-text faint" style={{ fontSize: 'var(--t-xs)', padding: '10px 10px 0' }}>Salud Ocupacional del Caribe S.A.S.</p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="dataset">
            {active ? (
              <>
                <span className="faint">Dataset</span>
                <b title={active.filename}>{active.filename}</b>
                <span className="faint num">{dateEs(active.periodStart)} – {dateEs(active.periodEnd)}</span>
              </>
            ) : <span className="faint">Sin dataset activo</span>}
          </div>
          <div className="spacer" />
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Buscar empresas y secciones">
            <ISearch width={15} height={15} /><span className="label">Buscar empresa o sección</span><kbd>Ctrl K</kbd>
          </button>
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="uname">{user.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => logout()} aria-label="Cerrar sesión" title="Cerrar sesión"><ILogout /></button>
          </div>
        </header>
        <main className="content" id="contenido">
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </main>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
      <CompanionDock />
    </div>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const facets = useFacets();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const items = useMemo(() => {
    const pages = NAV.flatMap((g) => g.items).map((i) => ({ to: i.to, label: i.label, type: 'Sección' }))
      .concat([{ to: '/ajustes', label: 'Ajustes', type: 'Sección' }]);
    const companies = (facets.data?.companies ?? []).map((c) => ({ to: `/empresas/${c.key}`, label: c.name, type: `${LEVEL_LABEL[c.level]} · ${c.events} accidentes` }));
    const f = fold(q.trim());
    const all = [...pages, ...companies];
    return (f ? all.filter((i) => fold(i.label).includes(f)) : pages).slice(0, 12);
  }, [q, facets.data]);
  useEffect(() => setSel(0), [q]);
  const go = (to: string) => { nav(to); onClose(); };
  return (
    <div className="palette-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa, NIT o sección"
          aria-label="Buscar"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            else if (e.key === 'Enter' && items[sel]) go(items[sel].to);
          }}
        />
        <ul role="listbox">
          {items.map((it, i) => (
            <li key={it.to} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)}>
              <button type="button" onClick={() => go(it.to)}><span>{it.label}</span><span className="ptype">{it.type}</span></button>
            </li>
          ))}
          {!items.length && <li className="faint" style={{ padding: 12, fontSize: 'var(--t-md)' }}>Sin resultados para "{q}".</li>}
        </ul>
      </div>
    </div>
  );
}
