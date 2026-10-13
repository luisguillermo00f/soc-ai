import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DatasetSummary, InspectResult, ScanStage } from '@shared/types.ts';
import { get, send, stream, upload } from '../lib/api.ts';
import { useCan } from '../lib/session.tsx';
import { dateEs, dateTimeEs, n0, pct } from '../lib/format.ts';
import { Spinner, useToast } from '../components/ui.tsx';
import { ICheck, IClose, IShield, IUpload, IArrowRight } from '../components/Icons.tsx';

const ROLE_LABEL: Record<string, string> = {
  company: 'Empresa', companyId: 'NIT de la empresa', contract: 'Contrato', eventId: 'Número de siniestro', eventDate: 'Fecha de ocurrencia',
  qualificationDate: 'Fecha de calificación', eventClass: 'Clase (AT/EL)', eventType: 'Tipo de siniestro', mechanism: 'Mecanismo', daysLost: 'Días de incapacidad',
  affiliateType: 'Tipo de afiliado', workerName: 'Nombre del trabajador', workerId: 'Documento del trabajador', workCenter: 'Centro de trabajo',
  municipality: 'Municipio', careLevel: 'Nivel de atención', pcl: 'Pérdida de capacidad laboral', advisor: 'Asesor asignado', advisorSecondary: 'Asesor APA',
  contactStatus: 'Estado de gestión SOC', jobTitle: 'Cargo', bodyPart: 'Parte del cuerpo', injuryType: 'Tipo de lesión', area: 'Área', process: 'Proceso',
  eventTime: 'Hora', description: 'Descripción',
};

const STAGE_PLAN: ScanStage[] = [
  { id: 'archivo', label: 'Validando archivo y esquema', status: 'pending' },
  { id: 'normalizacion', label: 'Normalizando empresas, fechas y categorías', status: 'pending' },
  { id: 'almacenamiento', label: 'Cifrando y guardando el dataset', status: 'pending' },
  { id: 'empresas', label: 'Analizando empresas y calculando puntajes de riesgo', status: 'pending' },
  { id: 'anomalias', label: 'Buscando anomalías temporales', status: 'pending' },
  { id: 'patrones', label: 'Detectando recurrencias y patrones', status: 'pending' },
  { id: 'insights', label: 'Generando hallazgos proactivos', status: 'pending' },
  { id: 'ia', label: 'Lectura ejecutiva', status: 'pending' },
  { id: 'planes', label: 'Preparando planes de choque', status: 'pending' },
];

export function Import() {
  const can = useCan('analista');
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<ScanStage[] | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const nav = useNavigate();

  const inspectM = useMutation({
    mutationFn: (f: File) => upload<InspectResult>('/datasets/inspect', f),
    onSuccess: (r) => { setInspect(r); setError(null); },
    onError: (e) => { setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.'); setFile(null); },
  });

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm|csv)$/i.test(f.name)) { setError('Formato no soportado. Sube un .xlsx, .xlsm o .csv.'); return; }
    if (f.size > 25 * 1024 * 1024) { setError('El archivo supera 25 MB.'); return; }
    setFile(f);
    setInspect(null);
    setError(null);
    inspectM.mutate(f);
  };

  const startScan = async () => {
    if (!inspect) return;
    setStages(STAGE_PLAN.map((s) => ({ ...s })));
    setDone(false);
    try {
      await stream('/datasets/scan', { stagingId: inspect.stagingId }, (ev) => {
        if (ev.type === 'stage') {
          setStages((prev) => {
            const list = [...(prev ?? [])];
            const i = list.findIndex((s) => s.id === ev.stage.id);
            if (i >= 0) list[i] = ev.stage; else list.push(ev.stage);
            return list;
          });
        } else if (ev.type === 'complete') {
          setDone(true);
          qc.invalidateQueries();
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'El escaneo falló.');
    }
  };

  const reset = () => { setFile(null); setInspect(null); setStages(null); setDone(false); setError(null); };

  if (!can) {
    return <div className="panel"><div className="empty"><h3>Importar requiere rol de analista</h3><p>Tu cuenta es de solo lectura. Un administrador puede cambiar tu rol en Ajustes.</p></div></div>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Escaneo SOC AI</h1>
          <p className="sub">Sube la base de siniestralidad tal como sale del sistema de la ARL. SOC AI detecta las hojas y columnas, limpia los datos y ejecuta el análisis completo. No se asume ninguna estructura fija.</p>
        </div>
      </div>

      {stages ? (
        <ScanProgress stages={stages} done={done} error={error} onOpen={() => nav('/')} onReset={reset} />
      ) : !inspect ? (
        <>
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            aria-label="Arrastra tu Excel aquí o haz clic para elegirlo"
          >
            {inspectM.isPending ? (
              <>
                <Spinner />
                <h2>Leyendo {file?.name}</h2>
                <p>Detectando hojas, encabezados, tipos de datos y calidad…</p>
              </>
            ) : (
              <>
                <IUpload />
                <h2>Arrastra tu Excel aquí</h2>
                <p>o haz clic para elegirlo · .xlsx, .xlsm o .csv · hasta 25 MB</p>
              </>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          {error && <div className="error-box" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <div className="notice" style={{ marginTop: 16 }}>
            <IShield />
            <span>El archivo original no se guarda. Los nombres y documentos de los trabajadores se reemplazan por un seudónimo cifrado antes de almacenar nada, los eventos se guardan cifrados y a la IA solo llegan cifras agregadas.</span>
          </div>
          <DatasetHistory />
        </>
      ) : (
        <Preview r={inspect} onScan={startScan} onCancel={reset} />
      )}
    </>
  );
}

function Preview({ r, onScan, onCancel }: { r: InspectResult; onScan: () => void; onCancel: () => void }) {
  const events = r.sheets.filter((s) => s.role === 'events');
  const q = r.quality;
  return (
    <div className="stack">
      <section className="kpis">
        <div className="kpi"><div className="kpi-label">Archivo</div><div className="kpi-value text" title={r.filename}>{r.filename}</div><div className="kpi-meta">{n0(r.sizeBytes / 1024)} KB</div></div>
        <div className="kpi"><div className="kpi-label">Hojas encontradas</div><div className="kpi-value">{r.sheets.length}</div><div className="kpi-meta">{events.length} con eventos</div></div>
        <div className="kpi"><div className="kpi-label">Registros detectados</div><div className="kpi-value">{n0(r.records)}</div><div className="kpi-meta">{n0(q.duplicatesRemoved)} duplicados eliminados</div></div>
        <div className="kpi"><div className="kpi-label">Columnas interpretadas</div><div className="kpi-value">{events.reduce((n, s) => n + s.columns.filter((c) => c.role).length, 0)}</div><div className="kpi-meta">de {events.reduce((n, s) => n + s.columns.length, 0)} en total</div></div>
        <div className="kpi"><div className="kpi-label">Empresas detectadas</div><div className="kpi-value">{n0(r.companies)}</div><div className="kpi-meta">unificadas por NIT y nombre</div></div>
        <div className="kpi"><div className="kpi-label">Período</div><div className="kpi-value text">{dateEs(r.periodStart)} – {dateEs(r.periodEnd)}</div></div>
      </section>

      <section className="grid-main">
        <div className="panel">
          <div className="panel-head"><div><h2>Calidad del dataset</h2><p className="question">¿Qué tan confiables son los datos para el análisis?</p></div></div>
          <div className="panel-body">
            <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
              <div className="quality-ring" style={{ ['--p' as string]: q.score }}><span>{q.score} %</span></div>
              <div style={{ flex: 1 }} className="stack">
                {q.checks.map((c) => (
                  <div key={c.id} className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 'var(--t-md)', alignItems: 'flex-start' }}>
                    <div><b style={{ fontWeight: 550 }}>{c.label}</b><div className="faint" style={{ fontSize: 'var(--t-sm)' }}>{c.detail}</div></div>
                    <span className="num" style={{ fontWeight: 600 }}>{pct(c.value, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
            {q.warnings.length > 0 && (
              <ul className="stack" style={{ margin: '16px 0 0', paddingLeft: 18, gap: 4, fontSize: 'var(--t-md)', color: 'var(--muted)' }}>
                {q.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Qué permite analizar</h2><p className="question">Según las columnas que trae el archivo.</p></div></div>
          <div className="panel-body stack" style={{ gap: 8 }}>
            {r.capabilities.map((c) => (
              <div key={c.id} className="row" style={{ gap: 10, alignItems: 'flex-start', fontSize: 'var(--t-md)' }}>
                <span style={{ color: c.available ? 'var(--ctrl-ink)' : 'var(--faint)', marginTop: 2 }}>{c.available ? <ICheck width={15} height={15} /> : <IClose width={15} height={15} />}</span>
                <div><b style={{ fontWeight: 550, color: c.available ? 'var(--ink)' : 'var(--faint)' }}>{c.label}</b><div className="faint" style={{ fontSize: 'var(--t-sm)' }}>{c.reason}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {r.sheets.map((s) => (
        <section key={s.name} className="panel">
          <div className="panel-head">
            <div><h2>Hoja "{s.name}"</h2><p className="question">{s.reason}{s.role === 'events' ? ` Encabezados en la fila ${s.headerRow}; ${n0(s.rows)} filas de datos.` : ''}</p></div>
            <span className={`tag ${s.role === 'events' ? '' : 'baja'}`}>{s.role === 'events' ? (s.eventClass === 'EL' ? 'Enfermedad laboral' : 'Accidentes de trabajo') : s.role === 'pivot' ? 'Tabla dinámica, omitida' : 'No analizada'}</span>
          </div>
          {s.columns.length > 0 && (
            <div className="panel-body">
              <div className="col-map">
                <div className="hd">Columna del Excel</div><div className="hd">Interpretada como</div><div className="hd">Detalle</div>
                {s.columns.map((c) => (
                  <div key={c.index} style={{ display: 'contents' }}>
                    <div title={c.header}><b style={{ fontWeight: 550 }}>{c.header}</b></div>
                    <div>{c.role ? <span>{ROLE_LABEL[c.role] ?? c.role} <span className="faint num">{Math.round(c.confidence * 100)} %</span></span> : <span className="faint">No usada</span>}</div>
                    <div className="faint" style={{ fontSize: 'var(--t-sm)' }} title={c.sample.join(' · ')}>{c.reason}{c.note ? ` · ${c.note}` : ''} · {pct(c.fill, 0)} lleno</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      {q.unified.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><h2>Variantes unificadas</h2><p className="question">Categorías escritas de formas distintas que se agruparon.</p></div></div>
          <div className="panel-body">
            <table className="data">
              <thead><tr><th>Variable</th><th>Valor unificado</th><th>Grafías encontradas</th><th className="r">Registros</th></tr></thead>
              <tbody>
                {q.unified.slice(0, 12).map((u, i) => (
                  <tr key={i}><td className="muted">{u.field}</td><td style={{ fontWeight: 550 }}>{u.canonical}</td><td className="mono faint" style={{ fontSize: 'var(--t-xs)' }}>{u.variants.join(' · ')}</td><td className="r">{n0(u.count)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>Previsualización</h2><p className="question">Primeros registros ya normalizados. Los datos personales no se muestran.</p></div></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Fecha</th><th>Siniestro</th><th>Empresa</th><th>Mecanismo</th><th>Centro</th><th>Atención</th><th className="r">Días</th></tr></thead>
            <tbody>
              {r.preview.map((e, i) => (
                <tr key={i}><td className="num">{dateEs(e.date)}</td><td className="mono">{e.eventNo}</td><td>{e.company}</td><td>{e.mechanism ?? '–'}</td><td>{e.workCenter ?? '–'}</td><td>{e.careLevel ?? '–'}</td><td className="r">{n0(e.daysLost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 16 }}>
        <button className="btn btn-lg" onClick={onCancel}>Elegir otro archivo</button>
        <button className="btn btn-primary btn-lg" onClick={onScan}>Iniciar escaneo SOC AI<IArrowRight /></button>
      </div>
    </div>
  );
}

function ScanProgress({ stages, done, error, onOpen, onReset }: { stages: ScanStage[]; done: boolean; error: string | null; onOpen: () => void; onReset: () => void }) {
  const finished = stages.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return (
    <div className="grid-main" style={{ alignItems: 'start' }}>
      <section className="panel">
        <div className="panel-head">
          <div><h2>{done ? 'Escaneo completo' : 'Escaneando el dataset'}</h2><p className="question">Cada etapa refleja un paso real del procesamiento, con su tiempo medido.</p></div>
          <span className="num faint">{finished}/{stages.length}</span>
        </div>
        <div className="panel-body">
          <div className="stages" aria-live="polite">
            {stages.map((s) => (
              <div key={s.id} className={`stage ${s.status}`}>
                <span className="si">{s.status === 'done' && <ICheck />}{s.status === 'error' && <IClose />}</span>
                <div>
                  <div className="sl">{s.label}</div>
                  {s.detail && <div className="sd">{s.detail}</div>}
                </div>
                <span className="sms">{s.ms !== undefined ? `${n0(s.ms)} ms` : ''}</span>
              </div>
            ))}
          </div>
          {error && <div className="error-box" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </section>
      <section className="panel panel-pad stack">
        <h2 style={{ fontSize: 'var(--t-lg)' }}>SOC AI Executive Report</h2>
        <p className="muted">Al terminar, el reporte ejecutivo muestra el estado general, las empresas críticas con su puntaje explicado, los patrones, la tendencia, los insights y las acciones recomendadas.</p>
        <button className="btn btn-primary btn-lg" disabled={!done} onClick={onOpen}>{done ? 'Ver reporte ejecutivo' : <><Spinner />Procesando</>}</button>
        {done && <button className="btn" onClick={onReset}>Importar otro archivo</button>}
      </section>
    </div>
  );
}

function DatasetHistory() {
  const q = useQuery({ queryKey: ['datasets'], queryFn: () => get<{ datasets: DatasetSummary[] }>('/datasets') });
  const qc = useQueryClient();
  const toast = useToast();
  const activate = useMutation({
    mutationFn: (id: string) => send('POST', `/datasets/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries(); toast('Dataset activado.'); },
  });
  const list = q.data?.datasets ?? [];
  if (!list.length) return null;
  return (
    <section className="section">
      <div className="section-title"><div><h2>Datasets importados</h2><p className="question">Solo uno está activo; los análisis y planes se guardan por dataset.</p></div></div>
      <div className="panel">
        <table className="data">
          <thead><tr><th>Archivo</th><th>Importado</th><th className="r">Eventos</th><th className="r">Empresas</th><th>Período</th><th className="r">Calidad</th><th /></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td style={{ fontWeight: 550 }}>{d.filename}</td>
                <td className="muted">{dateTimeEs(d.uploadedAt)} · {d.uploadedBy}</td>
                <td className="r">{n0(d.events)}</td>
                <td className="r">{n0(d.companies)}</td>
                <td className="num muted">{dateEs(d.periodStart)} – {dateEs(d.periodEnd)}</td>
                <td className="r">{d.quality} %</td>
                <td className="r">{d.active ? <span className="tag">Activo</span> : <button className="btn btn-sm" onClick={() => activate.mutate(d.id)}>Activar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
