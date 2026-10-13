// Conjunto de íconos de línea (1.5 px, currentColor). Un solo estilo en toda la aplicación.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (d: React.ReactNode) => (props: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{d}</svg>
);

export const IHome = base(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>);
export const IScan = base(<><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></>);
export const IBuilding = base(<><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" /><path d="M15 9h4a1 1 0 0 1 1 1v11" /><path d="M8 8h3M8 12h3M8 16h3M3 21h18" /></>);
export const IList = base(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>);
export const IPattern = base(<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="8" r="2.2" /><circle cx="9" cy="18" r="2.2" /><path d="M8 7l8 1M7 8l1.6 8M16.5 10l-6 6.3" /></>);
export const ITrend = base(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>);
export const IAlert = base(<><path d="M12 3 2.5 19.5h19L12 3Z" /><path d="M12 10v4M12 17.2v.1" /></>);
export const IPlan = base(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
export const IBulb = base(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></>);
export const ICompare = base(<><path d="M8 3v18M16 3v18" /><path d="M3 8h5M3 14h5M16 10h5M16 16h5" /></>);
export const IChat = base(<><path d="M4 5h16v11H9l-5 4V5Z" /></>);
export const IReport = base(<><path d="M6 3h9l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>);
export const ISettings = base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const ISearch = base(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>);
export const IUpload = base(<><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>);
export const IClose = base(<path d="M6 6l12 12M18 6 6 18" />);
export const ICheck = base(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IArrowRight = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IArrowUp = base(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IArrowDown = base(<path d="M12 5v14M6 13l6 6 6-6" />);
export const IEvidence = base(<><path d="M4 4h10l6 6v10H4z" /><circle cx="11" cy="14" r="2.5" /><path d="m13 16 2.5 2.5" /></>);
export const IPrint = base(<><path d="M7 8V3h10v5" /><rect x="4" y="8" width="16" height="9" rx="1.5" /><path d="M7 14h10v7H7z" /></>);
export const IInfo = base(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></>);
export const IRefresh = base(<><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>);
export const ILogout = base(<><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 16l4-4-4-4M14 12H4" /></>);
export const IDownload = base(<><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 19h16" /></>);
export const ISend = base(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
export const IUsers = base(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" /><path d="M16 4.8a3.2 3.2 0 0 1 0 6.4M17.5 14.7c1.9.6 3.2 2.5 3.5 5.3" /></>);
export const IShield = base(<><path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z" /></>);

/** Marca de SOC AI: arco SOC (naranja de marca) sobre una retícula de datos. */
export function SocMark(props: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="8" fill="#18181b" />
      <path d="M6.5 15.5c3.2-5.2 7-7.6 11.2-7.6 3.2 0 5.7 1.4 7.8 3.6" stroke="#E0791A" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M8.5 17.8c2.6-3.4 5.6-5 8.7-5 2.4 0 4.3.9 5.9 2.4" stroke="#FBCB3E" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.9" />
      <rect x="9" y="21" width="2.6" height="4.5" rx="1" fill="#fff" />
      <rect x="14.7" y="19" width="2.6" height="6.5" rx="1" fill="#fff" />
      <rect x="20.4" y="22.5" width="2.6" height="3" rx="1" fill="#fff" />
    </svg>
  );
}

export function AiSpark(props: P) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M8 1.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5-.4-2.9-1.6-4.1-4.5-4.5 2.9-.4 4.1-1.6 4.5-4.5Z" fill="#E0791A" />
      <path d="M12.5 10c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z" fill="#E0791A" opacity="0.7" />
    </svg>
  );
}
