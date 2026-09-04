/**
 * FinTrust report-first V1 design contract. Not wired into the current app.
 * Decimal values cross every API as strings. Dates are ISO 8601.
 * Runtime implementation must provide matching Zod validators.
 */
export type UUID = string;
export type DecimalString = string;
export type ISODate = string;
export type ISODateTime = string;
export type Outcome = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'WEAKENED' | 'UNRESOLVED';
export type Maturity = 'NOT_DUE' | 'IN_PROGRESS' | 'DUE';
export type InterimSignal = 'ABOVE' | 'ON_TRACK' | 'BELOW' | 'UNKNOWN';
export type Scope = 'CONSOLIDATED' | 'PARENT' | 'SEGMENT';
export type PeriodBasis = 'YEAR' | 'YTD' | 'QUARTER' | 'INSTANT';
export type Unit = 'CURRENCY' | 'RATIO' | 'COUNT' | 'CUSTOM';
export type DocumentRole = 'THESIS_SOURCE' | 'FINANCIAL_FILING' | 'SUPPLEMENT';
export type CriterionOrigin = 'REPORT_EXPLICIT' | 'SYSTEM_PROPOSED' | 'USER_CONFIRMED';
export type RunKind = 'INITIAL_REPORT' | 'ADD_REPORT' | 'REFRESH_FILINGS' | 'REVIEW_STATE';
export type RunStatus = 'QUEUED' | 'RUNNING' | 'WAITING_USER' | 'AWAITING_REVIEW'
  | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SUPERSEDED';
export type Phase = 'PARSE_REPORT' | 'IDENTIFY_COMPANY' | 'EXTRACT_THESES'
  | 'DISCOVER_FILINGS' | 'EXTRACT_FACTS' | 'VERIFY' | 'BUILD_DIFF';

export interface Period {
  start: ISODate | null; // null only for INSTANT
  end: ISODate;
  basis: PeriodBasis;
}
export interface Company {
  id: UUID;
  name: string;
  exchange: 'SSE' | 'SZSE';
  securityCode: string;
  issuerIds: Record<string, string>;
  aliases: string[];
}
export interface Region {
  pageNumber: number; // PDF physical page, one-based
  bbox: [number, number, number, number]; // normalized top-left, unrotated
}
export interface EvidenceSpan {
  id: UUID;
  documentId: UUID;
  parseId: UUID;
  regions: Region[]; // empty only for LEGACY_TEXT / plain text
  quote: string;
  textHash: string;
  headingPath: string[];
  tableCell?: { tableId: string; row: number; col: number };
  quality: 'NATIVE' | 'OCR_RELIABLE' | 'OCR_UNCERTAIN' | 'LEGACY';
}
export interface SourceDocument {
  id: UUID;
  role: DocumentRole;
  title: string;
  fileName: string;
  mimeType: 'application/pdf' | 'text/plain';
  sha256: string;
  companyId: UUID | null;
  publishedAt: ISODateTime | null;
  period: Period | null;
  origin: 'USER_UPLOAD' | 'OFFICIAL_DISCLOSURE' | 'LEGACY_TEXT';
  officialUrl: string | null;
  providerId: string | null;
  supersedesDocumentId: UUID | null;
  isSynthetic: boolean;
  createdAt: ISODateTime;
}
export interface Fact {
  id: UUID;
  documentId: UUID;
  companyId: UUID;
  metric: string;
  labelOriginal: string;
  segment: string | null;
  period: Period;
  accountingStandard: 'CAS';
  scope: Scope;
  nature: 'ACTUAL' | 'FORECAST' | 'GUIDANCE';
  value: DecimalString;
  unit: Unit;
  currency: string | null;
  customUnit: string | null;
  originalValue: string;
  originalUnit: string;
  scale: DecimalString;
  publishedAt: ISODateTime;
  restatementKey: string;
  evidenceIds: UUID[];
  extractionVersion: string;
}
export interface Calculation {
  id: UUID;
  formulaId: string;
  formulaVersion: string;
  operandFactIds: UUID[];
  operandCalculationIds: UUID[];
  result: DecimalString | null;
  unit: Unit;
  displayUnit: string;
  criterionRef?: { thesisRevisionId: UUID; conditionPath: string }; // target_gap provenance
  checks: { code: string; passed: boolean; explanation: string }[];
}
export type Condition = (
  | { kind: 'COMPARE'; metric: string; op: 'GT' | 'GTE' | 'EQ' | 'LTE' | 'LT';
      target: DecimalString; unit: Unit; period: Period; scope: Scope; segment?: string }
  | { kind: 'TREND'; metric: string; direction: 'UP' | 'DOWN' | 'STABLE';
      period: Period; comparePeriod: Period; scope: Scope; tolerance: DecimalString | null }
  | { kind: 'SEMANTIC'; proposition: string; requiredEvidence: string[];
      horizonEnd: ISODate | null }
  | { kind: 'ALL' | 'ANY'; children: Condition[] }
) & { origin: CriterionOrigin };
export interface ThesisRevision {
  id: UUID;
  thesisId: UUID;
  revision: number;
  groupId: UUID;
  text: string;
  originalText: string;
  sourceEvidenceIds: UUID[];
  type: 'NUMERIC_FORECAST' | 'DIRECTIONAL' | 'CAUSAL' | 'QUALITATIVE' | 'HISTORICAL';
  criterion: Condition;
  priority: number;
  derivedFromThesisIds: UUID[];
  extractionIssues: string[];
}
export interface CitedStatement {
  text: string;
  evidenceIds: UUID[];
  factIds: UUID[];
  calculationIds: UUID[];
}
export interface ResearchQuestion {
  id: UUID;
  thesisId: UUID;
  text: string;
  requiredEvidence: string;
  triggerPeriod: Period | null;
  status: 'OPEN' | 'ANSWERED' | 'DEFERRED';
  answer: CitedStatement | null;
}
export interface ThesisAssessment {
  id: UUID;
  thesisId: UUID;
  thesisRevisionId: UUID;
  inputHash: string;
  status: Outcome;
  maturity: Maturity;
  interimSignal: InterimSignal;
  summary: string;
  factIds: UUID[];
  calculationIds: UUID[];
  evidenceIds: UUID[];
  observedGap: CitedStatement | null;
  disclosedCauses: (CitedStatement & { attribution: 'MANAGEMENT_EXPLANATION' | 'DISCLOSED_FACT' })[];
  hypotheses: { text: string; supportingEvidenceIds: UUID[]; missingEvidence: string[] }[];
  conditions: { path: string; result: 'MET' | 'NOT_MET' | 'UNKNOWN'; reason: string;
    evidenceIds: UUID[]; calculationIds: UUID[] }[];
  nextQuestions: ResearchQuestion[];
  limitations: string[];
}
export interface SourceManifest {
  asOf: ISODateTime;
  hash: string;
  documents: { documentId: UUID; sha256: string; purpose: string }[];
  latestCoveredPeriod: Period | null;
  checkedAt: ISODateTime;
  discoveryStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'NOT_REQUIRED';
  missing: string[];
}
export interface ResearchMethod {
  version: number;
  focusMetrics: string[];
  aliases: Record<string, string[]>;
  focusQuestions: string[];
  preferences: string[];
}
export interface StateItem {
  thesis: ThesisRevision;
  lifecycle: 'ACTIVE' | 'ARCHIVED';
  assessment: ThesisAssessment;
  userJudgment: string | null;
}
export interface ResearchState {
  schemaVersion: '1.0';
  projectId: UUID;
  version: number;
  updateId: UUID;
  confirmedAt: ISODateTime;
  items: StateItem[];
  questions: ResearchQuestion[];
  method: ResearchMethod;
  sourceManifest: SourceManifest;
}
export interface UserCorrection {
  id: UUID;
  thesisId: UUID | null;
  type: 'THESIS_TEXT' | 'CRITERION' | 'USER_JUDGMENT' | 'RESEARCH_PREFERENCE';
  action: 'SET' | 'CLEAR';
  before: unknown;
  after: unknown;
  reason: string;
  baseStateVersion: number;
  createdAt: ISODateTime;
}
export interface DraftItem {
  thesis: ThesisRevision;
  previous: ThesisAssessment | null;
  proposed: ThesisAssessment;
  change: 'NEW' | 'CHANGED' | 'UNCHANGED' | 'ARCHIVED';
  changeReason: string;
  include: boolean;
  userJudgment: string | null;
}
export interface Draft {
  schemaVersion: '1.0';
  id: UUID;
  runId: UUID;
  projectId: UUID;
  revision: number;
  baseStateVersion: number;
  sourceManifest: SourceManifest;
  items: DraftItem[];
  staleThesisIds: UUID[];
  questions: ResearchQuestion[];
  corrections: UserCorrection[];
  method: ResearchMethod;
}
export type RequiredInput =
  | { kind: 'COMPANY_SELECTION'; candidates: Company[]; explanation: string }
  | { kind: 'REPORT_DATE'; documentId: UUID; suggestedDate: ISODate | null; quote: string }
  | { kind: 'MISSING_SOURCE'; missing: string[]; canContinueWithAvailable: boolean };
export interface Run {
  id: UUID;
  projectId: UUID;
  kind: RunKind;
  status: RunStatus;
  phase: Phase | null;
  baseStateVersion: number;
  asOf: ISODateTime;
  sourceManifest: SourceManifest | null;
  requiredInput: RequiredInput | null;
  error: { code: string; message: string; retryable: boolean } | null;
  completionReason: 'CONFIRMED' | 'NO_CHANGE' | null;
  cancelRequested: boolean;
  budget: { inputTokens: number; outputTokens: number; modelCalls: number; toolCalls: number;
    maxInputTokens: number; maxOutputTokens: number; maxModelCalls: number; maxToolCalls: number };
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export interface Project {
  id: UUID;
  title: string;
  company: Company | null;
  currentVersion: number;
  archived: boolean;
  monitor: { enabled: boolean; timezone: 'Asia/Shanghai'; localTime: '09:00';
    lastCheckedAt: ISODateTime | null; nextCheckAt: ISODateTime | null };
  currentState: ResearchState | null;
  activeRun: Run | null;
}
export interface RunEvent {
  id: string; // bigint transported as a string
  runId: UUID;
  type: 'run.status' | 'run.progress' | 'run.input_required' | 'draft.ready' | 'run.error';
  status: RunStatus;
  phase: Phase | null;
  completed?: number;
  total?: number;
  message: string;
  createdAt: ISODateTime;
}
export interface CreateRunRequest {
  kind: RunKind;
  projectId?: UUID;
  uploadIds?: UUID[];
  asOf?: ISODateTime;
}
export interface V1InitialReportRunRequest {
  kind: 'INITIAL_REPORT';
  reportDocumentId: UUID;
}
export interface V1FilingRunRequest {
  filingDocumentId: UUID;
  period: Period;
  publishedAt: ISODateTime;
  scope: 'CONSOLIDATED' | 'PARENT';
}
export interface DraftPatch {
  edits: { thesisId: UUID; include?: boolean; text?: string;
    criterion?: Condition; userJudgment?: string | null }[];
  questionEdits?: { questionId: UUID; text?: string; status?: ResearchQuestion['status'] }[];
  method?: ResearchMethod;
}
export interface ConfirmRequest { baseStateVersion: number; draftRevision: number }
export interface ConfirmResponse { projectId: UUID; version: number; updateId: UUID; runId: UUID }
export interface ApiError {
  error: { code: string; message: string; retryable: boolean; requestId: string; details?: unknown };
}
export interface EvidenceBundle {
  documents: SourceDocument[];
  spans: EvidenceSpan[];
  facts: Fact[];
  calculations: Calculation[];
}
