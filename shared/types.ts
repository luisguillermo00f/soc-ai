// Contrato de datos compartido entre el servidor y la interfaz.
// Todo lo que cruza la red está tipado aquí.

/* ───────────────────────── Esquema detectado ───────────────────────── */

export type FieldRole =
  | 'company' | 'companyId' | 'contract' | 'eventId' | 'eventDate' | 'qualificationDate'
  | 'eventClass' | 'eventType' | 'mechanism' | 'daysLost' | 'affiliateType'
  | 'workerName' | 'workerId' | 'workCenter' | 'municipality' | 'careLevel' | 'pcl'
  | 'advisor' | 'advisorSecondary' | 'contactStatus' | 'jobTitle' | 'bodyPart'
  | 'injuryType' | 'area' | 'process' | 'eventTime' | 'description';

export type SheetRole = 'events' | 'pivot' | 'empty' | 'unrecognized';

export interface ColumnProfile {
  index: number;
  header: string;
  role: FieldRole | null;
  confidence: number;          // 0..1
  reason: string;              // por qué se asignó (o no) el rol
  fill: number;                // 0..1 celdas no vacías
  distinct: number;
  kind: 'date' | 'number' | 'text' | 'empty' | 'mixed';
  sample: string[];            // valores de ejemplo (sin datos personales)
  note?: string;               // p. ej. "constante: un solo valor"
}

export interface SheetProfile {
  name: string;
  role: SheetRole;
  headerRow: number;           // 1-based
  rows: number;                // filas de datos leídas
  skippedRows: number;         // filas de nota/vacías descartadas
  eventClass: 'AT' | 'EL' | 'mixed' | null;
  columns: ColumnProfile[];
  reason: string;
}

/* ───────────────────────── Eventos normalizados ───────────────────────── */

export type EventClass = 'AT' | 'EL';

export interface EventRec {
  id: string;                  // id interno estable (E00001)
  sheet: string;
  row: number;                 // fila original en el Excel (1-based)
  eventNo: string | null;      // número de siniestro
  cls: EventClass;
  company: string;             // clave canónica de empresa
  date: string | null;         // ocurrencia ISO yyyy-mm-dd
  qualDate: string | null;     // calificación ISO
  eventType: string | null;
  mechanism: string | null;    // valor detallado normalizado
  mechGroup: string | null;    // familia de mecanismo
  daysLost: number | null;
  affiliateType: string | null;
  worker: string | null;       // seudónimo T-xxxxxx (nunca nombre ni documento)
  workCenter: string | null;
  municipality: string | null;
  careLevel: string | null;
  careRank: number | null;     // 1 leve … 5 UCI
  pcl: number | null;
  advisor: string | null;
  advisorSecondary: string | null;
  contactStatus: string | null;
  extra: Partial<Record<'jobTitle' | 'bodyPart' | 'injuryType' | 'area' | 'process' | 'eventTime', string>>;
  severity: number;            // índice 0..100
  severe: boolean;
}

export interface CompanyRec {
  key: string;
  name: string;                // nombre para mostrar
  nit: string | null;
  contracts: string[];
  aliases: string[];           // variantes de nombre unificadas
}

/* ───────────────────────── Calidad ───────────────────────── */

export interface QualityCheck {
  id: string;
  label: string;
  value: number;               // 0..1
  weight: number;
  detail: string;
}

export interface UnifiedVariant {
  field: string;
  canonical: string;
  variants: string[];
  count: number;
}

export interface QualityReport {
  score: number;               // 0..100
  checks: QualityCheck[];
  rowsRead: number;
  eventsKept: number;
  duplicatesRemoved: number;
  probableDuplicates: number;
  invalidDates: number;
  missingCompany: number;
  unknownMechanism: number;
  unified: UnifiedVariant[];
  warnings: string[];
}

/* ───────────────────────── Dataset ───────────────────────── */

export interface DatasetSummary {
  id: string;
  filename: string;
  uploadedAt: string;
  uploadedBy: string;
  events: number;
  eventsAT: number;
  eventsEL: number;
  companies: number;
  periodStart: string | null;
  periodEnd: string | null;
  quality: number;
  active: boolean;
}

export interface InspectResult {
  stagingId: string;
  filename: string;
  sizeBytes: number;
  sheets: SheetProfile[];
  records: number;
  companies: number;
  periodStart: string | null;
  periodEnd: string | null;
  quality: QualityReport;
  preview: PreviewRow[];
  capabilities: Capability[];
}

export interface PreviewRow {
  eventNo: string | null;
  date: string | null;
  company: string;
  mechanism: string | null;
  workCenter: string | null;
  careLevel: string | null;
  daysLost: number | null;
  cls: EventClass;
}

/** Qué análisis habilita el archivo, según las columnas presentes. */
export interface Capability {
  id: string;
  label: string;
  available: boolean;
  reason: string;
}

/* ───────────────────────── Escaneo ───────────────────────── */

export interface ScanStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  detail?: string;
  ms?: number;
}

/* ───────────────────────── Analítica ───────────────────────── */

export type RiskLevel = 'critico' | 'prioritario' | 'atencion' | 'controlado';

export interface MonthPoint { month: string; count: number; days: number; severe: number }

export interface Period {
  start: string;               // yyyy-mm
  end: string;                 // yyyy-mm (incluido)
  label: string;
  months: number;
}

export interface PeriodInfo {
  dataStart: string | null;    // fecha ISO
  dataEnd: string | null;      // fecha ISO (corte)
  completeMonths: string[];    // yyyy-mm con mes completo
  partialMonth: string | null; // último mes incompleto, excluido de tendencias
  recent: Period;              // últimos 6 meses completos
  previous: Period;            // 6 meses anteriores
  ytd: { current: Period; previousYear: Period } | null;
}

export interface Dist { key: string; label: string; count: number; share: number; days?: number; severe?: number }

export interface ScoreFactor {
  id: string;
  label: string;
  weight: number;
  value: number;               // 0..1
  points: number;
  reason: string;
}

export interface CompanyScore {
  score: number;
  level: RiskLevel;
  factors: ScoreFactor[];
  caps: string[];              // reglas que limitaron el puntaje
}

export interface Trend {
  recent: number;
  previous: number;
  change: number | null;       // relativo (0.32 = +32 %)
  pValue: number | null;
  direction: 'up' | 'down' | 'flat' | 'new';
  significant: boolean;
}

/** Mismo tramo de meses en dos años (p. ej. ene–sep 2026 vs ene–sep 2025). */
export interface YearOverYear {
  currentLabel: string;        // "ene 2026 – sep 2026"
  previousLabel: string;
  currentYear: number;
  previousYear: number;
  current: number;
  previous: number;
  change: number | null;
  pValue: number | null;
  significant: boolean;
  direction: 'up' | 'down' | 'flat' | 'new';
  severeCurrent: number;
  severePrevious: number;
  daysCurrent: number;
  daysPrevious: number;
  previousFullYear: number;    // total del año anterior completo (referencia)
}

export interface YearCompareRow { key: string; label: string; current: number; previous: number }

export interface YearCompare {
  yoy: YearOverYear;
  monthly: { month: string; label: string; current: number; previous: number }[];
  mechanisms: YearCompareRow[];
  workCenters: YearCompareRow[];
  careLevels: YearCompareRow[];
  workers: { current: number; previous: number; repeatCurrent: number; repeatPrevious: number };
  newMechanisms: string[];     // mecanismos que aparecen este año y no el anterior
  goneMechanisms: string[];    // los que desaparecieron
}

export interface AdvisorCompany {
  key: string;
  name: string;
  level: RiskLevel;
  score: number;
  events: number;            // accidentes de la empresa atendidos por este asesor
  previousFullYear: number;  // los mismos, en el año anterior completo
  yoyPrevious: number;
  yoyCurrent: number;
}

export interface AdvisorSummary {
  key: string;               // "a:Nombre" o "p:Nombre" (mismo formato del filtro)
  name: string;
  role: 'asignado' | 'apa';
  companies: number;
  events: number;
  severe: number;
  daysLost: number;
  previousFullYear: number;
  yoyPrevious: number;
  yoyCurrent: number;
  critical: number;
  priority: number;
  contactDone: number;       // 0..1 de sus eventos con cita ejecutada
  companiesList: AdvisorCompany[];
}

/** Detalle de un asesor APA para la vista dedicada. */
export interface ApaAdvisor extends AdvisorSummary {
  months: string[];
  monthly: number[];
  trend: Trend;                 // últimos 6 meses completos vs 6 anteriores
  daysPerEvent: number;
  mechanisms: Dist[];
  careLevels: Dist[];
  contactStatuses: Dist[];
  elEvents: number;             // enfermedades laborales calificadas asignadas al asesor
  elCompanies: number;
  contactGapCompanies: number;  // empresas suyas sin cita ejecutada en la mayoría de sus eventos
  workers: number;
  repeatWorkers: number;
}

export interface CompanySummary {
  key: string;
  name: string;
  nit: string | null;
  events: number;
  eventsAT: number;
  eventsEL: number;
  daysLost: number;
  severe: number;
  workers: number;
  repeatWorkers: number;
  first: string | null;
  last: string | null;
  topMechanism: string | null;
  topMechanismShare: number;
  trend: Trend;
  score: CompanyScore;
  advisor: string | null;
  contactStatus: string | null;      // estado más frecuente de gestión SOC
  contactGap: boolean;               // sin cita ejecutada en la mayoría de sus eventos
  sparkline: number[];               // conteo mensual en meses completos
  municipality: string | null;
  share: number;                     // participación en el total AT
  rank: number;                      // posición por número de eventos
  yoy: YearOverYear | null;          // año contra año, mismos meses
  advisors: string[];                // asesores asignados en sus eventos
  apaAdvisors: string[];             // asesores APA en sus eventos
}

export interface Anomaly {
  kind: 'spike' | 'drop' | 'burst';
  month?: string;
  start?: string;
  end?: string;
  count: number;
  expected: number;
  pValue: number;
  label: string;
}

export interface Cluster {
  mechGroup: string;
  start: string;
  end: string;
  count: number;
  days: number;
  eventIds: string[];
}

export interface CompanyProfile {
  summary: CompanySummary;
  yearCompare: YearCompare | null;
  monthly: MonthPoint[];
  mechanisms: Dist[];
  mechanismDetail: Dist[];
  workCenters: Dist[];
  careLevels: Dist[];
  eventTypes: Dist[];
  municipalities: Dist[];
  affiliateTypes: Dist[];
  contactStatuses: Dist[];
  weekdays: Dist[];
  extraDims: { dim: string; label: string; dist: Dist[] }[];
  anomalies: Anomaly[];
  clusters: Cluster[];
  repeatWorkers: { worker: string; count: number; mechGroups: string[]; eventIds: string[] }[];
  patterns: Pattern[];
  peers: { percentileEvents: number; percentileSeverity: number; daysPerEvent: number; globalDaysPerEvent: number };
  elEvents: EventRec[];
  severeEvents: EventRec[];
  eventIds: string[];
}

export type PatternKind = 'company' | 'global' | 'cluster' | 'worker' | 'cross-company' | 'temporal';

export interface PatternStep { dim: string; dimLabel: string; value: string }

export interface Pattern {
  id: string;
  kind: PatternKind;
  title: string;
  path: PatternStep[];
  company?: string;
  companyName?: string;
  count: number;
  base: number;                // n del universo comparado
  share: number;               // count/base
  expectedShare: number;       // participación esperada (global)
  lift: number;
  pValue: number;
  trend: Trend | null;
  daysLost: number;
  severe: number;
  confidence: 'alta' | 'media' | 'baja';
  score: number;               // relevancia para ordenar
  explanation: string;
  eventIds: string[];
}

export interface Insight {
  id: string;
  kind: string;
  severity: 'alta' | 'media' | 'baja';
  title: string;
  finding: string;
  evidence: { label: string; value: string }[];
  importance: string;
  action: string;
  confidence: 'alta' | 'media' | 'baja';
  company?: string;
  eventIds: string[];
  filter?: EventFilter;        // evidencia como filtro cuando el conjunto es grande
}

export interface Overview {
  dataset: DatasetSummary;
  period: PeriodInfo;
  kpis: {
    companies: number;
    companiesWithEvents: number;
    eventsAT: number;
    eventsEL: number;
    daysLost: number;
    severe: number;
    recentEvents: number;
    previousEvents: number;
    recentChange: number | null;
    recentPValue: number | null;
    ytd: { current: number; previous: number; change: number | null; label: string } | null;
    topCompany: { key: string; name: string; events: number; share: number } | null;
    topMechanism: { label: string; count: number; share: number } | null;
    criticalCompanies: number;
    priorityCompanies: number;
    recurringPatterns: number;
    repeatWorkers: number;
    daysPerEvent: number;
    top10Share: number;
  };
  levels: Record<RiskLevel, number>;
  monthly: MonthPoint[];
  mechanisms: Dist[];
  weekdays: Dist[];
  careLevels: Dist[];
  eventTypes: Dist[];
  municipalities: Dist[];
  contactStatuses: Dist[];
  advisors: Dist[];
  attention: CompanySummary[];       // críticas y prioritarias
  topPatterns: Pattern[];
  insights: Insight[];
  pareto: { companies: number; share: number }[];
}

export interface TrendsData {
  period: PeriodInfo;
  monthly: MonthPoint[];
  byMechanism: { key: string; label: string; series: number[]; trend: Trend }[];
  months: string[];
  yoy: { month: string; label: string; current: number; previous: number }[] | null;
  weekdays: Dist[];
  severityMonthly: { month: string; severe: number; days: number; count: number }[];
  anomalies: Anomaly[];
  risers: { key: string; name: string; trend: Trend }[];
  fallers: { key: string; name: string; trend: Trend }[];
  lag: { median: number; p90: number; over15: number; n: number } | null;
}

export interface HeatmapData {
  rows: { key: string; label: string; total: number }[];
  cols: { key: string; label: string; total: number }[];
  cells: number[][];
  rowDim: string;
  colDim: string;
}

export interface ScoringConfig {
  weights: Record<string, number>;
  thresholds: { critico: number; prioritario: number; atencion: number };
  minEvidence: number;
}

/* ───────────────────────── Filtros de eventos ───────────────────────── */

export interface EventFilter {
  company?: string;
  from?: string;               // yyyy-mm-dd
  to?: string;
  mechGroup?: string;
  eventType?: string;
  careLevel?: string;
  municipality?: string;
  workCenter?: string;
  advisor?: string;
  advisorSecondary?: string;
  contactStatus?: string;
  cls?: EventClass;
  severe?: boolean;
  q?: string;
  ids?: string[];
}

export interface EventsPage {
  total: number;
  rows: (EventRec & { companyName: string })[];
  facets: Record<string, Dist[]>;
}

/* ───────────────────────── IA ───────────────────────── */

export type Nature = 'dato' | 'patron' | 'hallazgo' | 'hipotesis' | 'recomendacion';

export interface FactRef {
  id: string;
  label: string;
  value: string;
  eventIds?: string[];
  filter?: EventFilter;
}

export interface UnverifiedNumber { field: string; value: string }

export interface AiMeta {
  engine: AiEngine;
  model: string | null;
  generatedAt: string;
  ms: number;
  verified: boolean;
  unverified: UnverifiedNumber[];
  facts: FactRef[];
  usage?: { input: number; output: number } | null;
  version?: string;            // versión del motor + metodología con la que se generó
  note?: string;               // por qué se usó un motor de respaldo
}

export interface WhatsHappening {
  headline: string;
  summary: string;
  findings: {
    nature: Nature;
    title: string;
    body: string;
    confidence: 'alta' | 'media' | 'baja';
    evidence: string[];          // ids de hechos
  }[];
  where: string;
  when: string;
  whatRepeats: string;
  howSevere: string;
  hypotheses: { text: string; basis: string; validate: string; confidence: 'alta' | 'media' | 'baja' }[];
  fieldChecks: string[];
  actions: { action: string; why: string; priority: 'alta' | 'media' | 'baja' }[];
  limits: string;
}

export interface PlanAction {
  action: string;
  owner: string;
  due: string;
  indicator: string;
}

export interface PlanProblem {
  problem: string;
  evidence: string[];             // ids de hechos
  evidenceText: string;
  objective: string;
  priority: 'alta' | 'media' | 'baja';
  immediate: PlanAction[];
  shortTerm: PlanAction[];
  structural: PlanAction[];
  indicator: string;
  target: string;
  rationale: string;
}

export interface ShockPlan {
  title: string;
  focus: string;                  // por qué este plan es distinto
  context: string;
  problems: PlanProblem[];
  followUp: string;
  assumptions: string[];
}

export interface Comparison {
  conclusion: string;
  differences: { aspect: string; detail: string; evidence: string[] }[];
  sharedRisks: string;
  recommendation: string;
}

export interface ExecutiveReading {
  headline: string;
  state: string;
  priorities: { company: string; why: string; evidence: string[] }[];
  nonObvious: { title: string; body: string; nature: Nature; evidence: string[] }[];
  actions: { action: string; why: string; priority: 'alta' | 'media' | 'baja' }[];
  limits: string;
}

export interface AiResult<T> { content: T; meta: AiMeta }

export type AiEngine = 'claude' | 'gemini' | 'groq' | 'reglas';

export interface AiStatus {
  enabled: boolean;
  engine: AiEngine;
  provider: string;
  model: string;
  effort: string;
  reason: string;
}

/* ───────────────────────── Sesión ───────────────────────── */

export type Role = 'admin' | 'analista' | 'lector';

export interface SessionUser { id: string; email: string; name: string; role: Role }
