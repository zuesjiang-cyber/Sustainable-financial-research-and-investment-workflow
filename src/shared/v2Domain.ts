export type V2RunKind = "FAST" | "BACKGROUND" | "DEEP" | "MONITOR" | "REPLAY";
export type V2RunStatus =
  | "QUEUED"
  | "RUNNING"
  | "PARTIAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BUDGET_PAUSED";

export type V2VerificationStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "CONFLICTING"
  | "CORRECTED"
  | "REJECTED";

export type V2EventStage =
  | "ANNOUNCED"
  | "PLANNED"
  | "IN_PROGRESS"
  | "PERFORMED"
  | "RECOGNIZED"
  | "CORRECTED";

export type V2SourceKind =
  | "USER_TEXT"
  | "USER_URL"
  | "USER_PDF"
  | "OFFICIAL_DISCLOSURE"
  | "EXTERNAL_REPORT"
  | "REPRINT"
  | "REPLAY";

export type V2Importance = "HIGH" | "MEDIUM" | "LOW";

export interface CompanyIdentity {
  name: string;
  securityCode: string;
  exchange: "SSE" | "SZSE";
  aliases?: string[];
}

export interface CompanyCandidate extends CompanyIdentity {
  score: number;
  reason: string;
}

export interface UserStanceVersion {
  id: string;
  version: number;
  rawText: string;
  summary: string;
  reasons: string[];
  coreReasons: string[];
  auxiliaryReasons: string[];
  thresholds: Array<{ metric: string; op: string; value: string; source: "USER_EXPLICIT" }>;
  horizon: string | null;
  createdAt: string;
  supersedesId: string | null;
  changeReason: string | null;
}

export interface MaterialView {
  id: string;
  author: string;
  sourceEvidenceId: string;
  text: string;
  publishedAt: string | null;
  observationScope: string;
  endorsedByUser: false;
}

export interface EvidenceRecord {
  id: string;
  projectId: string;
  sourceKind: V2SourceKind;
  title: string;
  url: string | null;
  documentId: string | null;
  quote: string;
  occurredAt: string | null;
  disclosedAt: string | null;
  discoveredAt: string;
  originKey: string;
  parentOriginKey: string | null;
  companyName: string | null;
  securityCode: string | null;
  page: number | null;
  bbox: [number, number, number, number] | null;
  reprintOf: string | null;
  quality: "NATIVE" | "OCR" | "EXTRACT";
  rawHash: string;
}

export interface ResearchEvent {
  id: string;
  projectId: string;
  description: string;
  stage: V2EventStage;
  proposition: string;
  occurredAt: string | null;
  disclosedAt: string | null;
  discoveredAt: string;
  verification: V2VerificationStatus;
  evidenceIds: string[];
  originKey: string;
  correctionOf: string | null;
  checkScope: string[];
  limitations: string[];
  attributedSpeaker: string | null;
}

export interface ResearchLead {
  id: string;
  projectId: string;
  text: string;
  discoveredAt: string;
  nextCheckAt: string;
  attempts: number;
  status: "OPEN" | "PROMOTED" | "DROPPED";
  evidenceIds: string[];
}

export interface AnalysisRecord {
  id: string;
  projectId: string;
  runId: string;
  stanceVersion: number;
  eventIds: string[];
  evidenceIds: string[];
  text: string;
  assumptionsUnmet: string[];
  importance: V2Importance;
  supportsStance: "SUPPORTS" | "CHALLENGES" | "NEUTRAL" | "UNKNOWN";
  createdAt: string;
}

export interface PreliminaryJudgment {
  headline: string;
  summary: string;
  supported: string[];
  needsRevision: string[];
  unverified: string[];
  openQuestions: string[];
  modelUsed: string | null;
  generatedAt: string;
}

export interface V2RunEvent {
  seq: number;
  at: string;
  phase: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface V2Run {
  id: string;
  projectId: string;
  kind: V2RunKind;
  status: V2RunStatus;
  parentRunId: string | null;
  idempotencyKey: string | null;
  input: {
    text: string;
    url: string | null;
    documentId: string | null;
    question: string | null;
  };
  preliminary: PreliminaryJudgment | null;
  modelCalls: number;
  documentsRead: number;
  limits: { modelCalls: number; documents: number };
  coverage: {
    official: "COMPLETE" | "INCOMPLETE" | "FAILED" | "NOT_STARTED";
    external: "COMPLETE" | "INCOMPLETE" | "FAILED" | "NOT_STARTED";
    notes: string[];
  };
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  events: V2RunEvent[];
  resultSummary: string | null;
}

export interface V2Notification {
  id: string;
  projectId: string;
  kind: "IMPORTANT_CHANGE" | "CORRECTION" | "DAILY_DIGEST" | "CHECK_FAILED" | "BUDGET";
  title: string;
  body: string;
  eventIds: string[];
  analysisIds: string[];
  importance: V2Importance;
  createdAt: string;
  readAt: string | null;
  reason: string;
  correctionOf: string | null;
}

export interface V2Monitoring {
  enabled: boolean;
  officialEveryMinutes: number;
  externalEveryHours: number;
  earlyLeadAlerts: boolean;
  browserNotify: boolean;
  lastOfficialCheckAt: string | null;
  lastExternalCheckAt: string | null;
  lastOfficialSuccessAt: string | null;
  lastExternalSuccessAt: string | null;
  lastDigestAt: string | null;
}

export interface V2Project {
  id: string;
  company: CompanyIdentity | null;
  companyCandidates: CompanyCandidate[];
  identityStatus: "IDENTIFIED" | "AMBIGUOUS" | "UNKNOWN";
  title: string;
  summary: string;
  isReplay: boolean;
  replayAsOf: string | null;
  monitoring: V2Monitoring;
  currentStance: UserStanceVersion | null;
  stanceHistory: UserStanceVersion[];
  materialViews: MaterialView[];
  evidence: EvidenceRecord[];
  events: ResearchEvent[];
  leads: ResearchLead[];
  analyses: AnalysisRecord[];
  messages: Array<{
    id: string;
    rawText: string;
    createdAt: string;
    parsedStanceChange: string | null;
    undone: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface V2Settings {
  monthlyBudgetCny: number;
  spentCny: number;
  reservedCny: number;
  comparisonBudgetCny: number;
  comparisonSpentCny: number;
  models: {
    fast: string | null;
    research: string | null;
    review: string | null;
  };
  tavilyConfigured: boolean;
  llmConfigured: boolean;
  maxTrackedCompanies: number;
}

export interface UsageRecord {
  id: string;
  at: string;
  kind: "MODEL" | "SEARCH" | "EXTRACT";
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCny: number;
  runId: string | null;
  reserved: boolean;
  settled: boolean;
}

export const FAST_LIMITS = { modelCalls: 2, documents: 4 } as const;
export const BACKGROUND_LIMITS = { modelCalls: 6, documents: 12 } as const;
export const DEEP_LIMITS = { modelCalls: 12, documents: 24 } as const;

export const DEFAULT_MONITORING: V2Monitoring = {
  enabled: true,
  officialEveryMinutes: 30,
  externalEveryHours: 12,
  earlyLeadAlerts: false,
  browserNotify: false,
  lastOfficialCheckAt: null,
  lastExternalCheckAt: null,
  lastOfficialSuccessAt: null,
  lastExternalSuccessAt: null,
  lastDigestAt: null,
};

export const DEFAULT_MONTHLY_BUDGET_CNY = 80;
export const COMPARISON_BUDGET_CNY = 60;
export const MAX_TRACKED_COMPANIES = 5;
