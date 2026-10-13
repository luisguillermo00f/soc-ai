import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import './styles/app.css';
import './styles/companion.css';
import { SessionGate } from './lib/session.tsx';
import { EvidenceProvider } from './lib/evidence.tsx';
import { CompanionProvider } from './lib/companion.tsx';
import { Shell } from './components/Shell.tsx';
import { PageSkeleton, ToastProvider } from './components/ui.tsx';
import { Auth } from './pages/Auth.tsx';
import { Home } from './pages/Home.tsx';

const Import = lazy(() => import('./pages/Import.tsx').then((m) => ({ default: m.Import })));
const Companies = lazy(() => import('./pages/Companies.tsx').then((m) => ({ default: m.Companies })));
const ApaAdvisors = lazy(() => import('./pages/ApaAdvisors.tsx').then((m) => ({ default: m.ApaAdvisors })));
const Advisors = lazy(() => import('./pages/Advisors.tsx').then((m) => ({ default: m.Advisors })));
const Company = lazy(() => import('./pages/Company.tsx').then((m) => ({ default: m.Company })));
const Accidents = lazy(() => import('./pages/Accidents.tsx').then((m) => ({ default: m.Accidents })));
const Patterns = lazy(() => import('./pages/Patterns.tsx').then((m) => ({ default: m.Patterns })));
const Trends = lazy(() => import('./pages/Trends.tsx').then((m) => ({ default: m.Trends })));
const Critical = lazy(() => import('./pages/Critical.tsx').then((m) => ({ default: m.Critical })));
const Plans = lazy(() => import('./pages/Plans.tsx').then((m) => ({ default: m.Plans })));
const Insights = lazy(() => import('./pages/Insights.tsx').then((m) => ({ default: m.Insights })));
const Compare = lazy(() => import('./pages/Compare.tsx').then((m) => ({ default: m.Compare })));
const Assistant = lazy(() => import('./pages/Assistant.tsx').then((m) => ({ default: m.Assistant })));
const Reports = lazy(() => import('./pages/Reports.tsx').then((m) => ({ default: m.Reports })));
const CompanyReport = lazy(() => import('./pages/Reports.tsx').then((m) => ({ default: m.CompanyReport })));
const ExecutiveReport = lazy(() => import('./pages/Reports.tsx').then((m) => ({ default: m.ExecutiveReport })));
const Settings = lazy(() => import('./pages/Settings.tsx').then((m) => ({ default: m.Settings })));

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: (n, err: any) => n < 1 && !(err?.status >= 400 && err?.status < 500) } },
});

function App() {
  return (
    <SessionGate fallback={(refresh) => <Auth onDone={refresh} />}>
      <EvidenceProvider>
        <CompanionProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="importar" element={<Import />} />
            <Route path="empresas" element={<Companies />} />
            <Route path="empresas/:key" element={<Company />} />
            <Route path="asesores" element={<Advisors />} />
            <Route path="asesores-apa" element={<ApaAdvisors />} />
            <Route path="accidentes" element={<Accidents />} />
            <Route path="patrones" element={<Patterns />} />
            <Route path="tendencias" element={<Trends />} />
            <Route path="criticas" element={<Critical />} />
            <Route path="planes" element={<Plans />} />
            <Route path="insights" element={<Insights />} />
            <Route path="comparar" element={<Compare />} />
            <Route path="asistente" element={<Assistant />} />
            <Route path="reportes" element={<Reports />} />
            <Route path="reportes/empresa/:key" element={<CompanyReport />} />
            <Route path="reportes/ejecutivo" element={<ExecutiveReport />} />
            <Route path="ajustes" element={<Settings />} />
            <Route path="*" element={<div className="empty"><h3>Esta página no existe</h3></div>} />
          </Route>
        </Routes>
        </CompanionProvider>
      </EvidenceProvider>
    </SessionGate>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="content"><PageSkeleton /></div>}>
            <App />
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
