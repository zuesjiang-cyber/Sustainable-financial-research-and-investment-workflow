import { z } from "zod";

export type UUID = string;
export type DecimalString = string;
export type ISODate = string;
export type ISODateTime = string;

export const OutcomeSchema = z.enum(["SUPPORTED", "PARTIALLY_SUPPORTED", "WEAKENED", "UNRESOLVED"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const MaturitySchema = z.enum(["NOT_DUE", "IN_PROGRESS", "DUE"]);
export type Maturity = z.infer<typeof MaturitySchema>;

export const InterimSignalSchema = z.enum(["ABOVE", "ON_TRACK", "BELOW", "UNKNOWN"]);
export type InterimSignal = z.infer<typeof InterimSignalSchema>;

export const ScopeSchema = z.enum(["CONSOLIDATED", "PARENT", "SEGMENT"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const PeriodBasisSchema = z.enum(["YEAR", "YTD", "QUARTER", "INSTANT"]);
export type PeriodBasis = z.infer<typeof PeriodBasisSchema>;

export const UnitSchema = z.enum(["CURRENCY", "RATIO", "COUNT", "CUSTOM"]);
export type Unit = z.infer<typeof UnitSchema>;

export const DocumentRoleSchema = z.enum(["THESIS_SOURCE", "FINANCIAL_FILING", "SUPPLEMENT"]);
export type DocumentRole = z.infer<typeof DocumentRoleSchema>;

export const CriterionOriginSchema = z.enum(["REPORT_EXPLICIT", "SYSTEM_PROPOSED", "USER_CONFIRMED"]);
export type CriterionOrigin = z.infer<typeof CriterionOriginSchema>;

export const RunKindSchema = z.enum(["INITIAL_REPORT", "ADD_REPORT", "REFRESH_FILINGS", "REVIEW_STATE"]);
export type RunKind = z.infer<typeof RunKindSchema>;

export const RunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_USER",
  "AWAITING_REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "SUPERSEDED",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const PhaseSchema = z.enum([
  "PARSE_REPORT",
  "IDENTIFY_COMPANY",
  "EXTRACT_THESES",
  "DISCOVER_FILINGS",
  "EXTRACT_FACTS",
  "VERIFY",
  "BUILD_DIFF",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const PeriodSchema = z.object({
  start: z.string().nullable(),
  end: z.string(),
  basis: PeriodBasisSchema,
});
export type Period = z.infer<typeof PeriodSchema>;

export const CompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  exchange: z.enum(["SSE", "SZSE"]),
  securityCode: z.string().min(1),
  issuerIds: z.record(z.string(), z.string()).default({}),
  aliases: z.array(z.string()).default([]),
});
export type Company = z.infer<typeof CompanySchema>;

export const RegionSchema = z.object({
  pageNumber: z.number().int().positive(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export type Region = z.infer<typeof RegionSchema>;

export const EvidenceSpanSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  parseId: z.string().uuid(),
  regions: z.array(RegionSchema).default([]),
  quote: z.string(),
  textHash: z.string(),
  headingPath: z.array(z.string()).default([]),
  tableCell: z
    .object({
      tableId: z.string(),
      row: z.number().int(),
      col: z.number().int(),
    })
    .optional(),
  quality: z.enum(["NATIVE", "OCR_RELIABLE", "OCR_UNCERTAIN", "LEGACY"]),
});
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export const SourceDocumentSchema = z.object({
  id: z.string().uuid(),
  role: DocumentRoleSchema,
  title: z.string(),
  fileName: z.string(),
  mimeType: z.enum(["application/pdf", "text/plain"]),
  sha256: z.string(),
  companyId: z.string().uuid().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
  period: PeriodSchema.nullable().default(null),
  origin: z.enum(["USER_UPLOAD", "OFFICIAL_DISCLOSURE", "LEGACY_TEXT"]),
  officialUrl: z.string().nullable().default(null),
  providerId: z.string().nullable().default(null),
  supersedesDocumentId: z.string().uuid().nullable().default(null),
  isSynthetic: z.boolean().default(false),
  createdAt: z.string(),
});
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export interface UploadParseSummary {
  status: "COMPLETED";
  parserVersion: string;
  pageCount: number;
  blockCount: number;
  tableCount: number;
  spanCount: number;
  quality: {
    nativeTextRatio: number;
    hasOcrPages: boolean;
    lowConfidencePages: number[];
    issues: string[];
  };
}

export const UploadParseSummarySchema = z.object({
  status: z.literal("COMPLETED"),
  parserVersion: z.string(),
  pageCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
  tableCount: z.number().int().nonnegative(),
  spanCount: z.number().int().nonnegative(),
  quality: z.object({
    nativeTextRatio: z.number(),
    hasOcrPages: z.boolean(),
    lowConfidencePages: z.array(z.number().int().positive()),
    issues: z.array(z.string()),
  }),
});

export interface UploadReceipt {
  uploadId: UUID;
  document: SourceDocument;
  parseSummary: UploadParseSummary;
}

export const UploadReceiptSchema = z.object({
  uploadId: z.string().uuid(),
  document: SourceDocumentSchema,
  parseSummary: UploadParseSummarySchema,
});

export const FactSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  companyId: z.string().uuid(),
  metric: z.string(),
  labelOriginal: z.string(),
  segment: z.string().nullable().default(null),
  period: PeriodSchema,
  accountingStandard: z.literal("CAS").default("CAS"),
  scope: ScopeSchema,
  nature: z.enum(["ACTUAL", "FORECAST", "GUIDANCE"]),
  value: z.string(),
  unit: UnitSchema,
  currency: z.string().nullable().default(null),
  customUnit: z.string().nullable().default(null),
  originalValue: z.string(),
  originalUnit: z.string(),
  scale: z.string().default("1"),
  publishedAt: z.string(),
  restatementKey: z.string(),
  evidenceIds: z.array(z.string().uuid()).default([]),
  extractionVersion: z.string(),
});
export type Fact = z.infer<typeof FactSchema>;

export const CalculationSchema = z.object({
  id: z.string().uuid(),
  formulaId: z.string(),
  formulaVersion: z.string(),
  operandFactIds: z.array(z.string().uuid()).default([]),
  operandCalculationIds: z.array(z.string().uuid()).default([]),
  result: z.string().nullable(),
  unit: UnitSchema,
  displayUnit: z.string(),
  criterionRef: z
    .object({
      thesisRevisionId: z.string().uuid(),
      conditionPath: z.string(),
    })
    .optional(),
  checks: z.array(
    z.object({
      code: z.string(),
      passed: z.boolean(),
      explanation: z.string(),
    })
  ).default([]),
});
export type Calculation = z.infer<typeof CalculationSchema>;

// Recursive ConditionSchema
export type Condition = (
  | {
      kind: "COMPARE";
      metric: string;
      op: "GT" | "GTE" | "EQ" | "LTE" | "LT";
      target: DecimalString;
      unit: Unit;
      period: Period;
      scope: Scope;
      segment?: string;
    }
  | {
      kind: "TREND";
      metric: string;
      direction: "UP" | "DOWN" | "STABLE";
      period: Period;
      comparePeriod: Period;
      scope: Scope;
      tolerance: DecimalString | null;
    }
  | {
      kind: "SEMANTIC";
      proposition: string;
      requiredEvidence: string[];
      horizonEnd: ISODate | null;
    }
  | {
      kind: "ALL" | "ANY";
      children: Condition[];
    }
) & { origin: CriterionOrigin };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(
  () =>
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("COMPARE"),
        metric: z.string(),
        op: z.enum(["GT", "GTE", "EQ", "LTE", "LT"]),
        target: z.string(),
        unit: UnitSchema,
        period: PeriodSchema,
        scope: ScopeSchema,
        segment: z.string().optional(),
        origin: CriterionOriginSchema,
      }),
      z.object({
        kind: z.literal("TREND"),
        metric: z.string(),
        direction: z.enum(["UP", "DOWN", "STABLE"]),
        period: PeriodSchema,
        comparePeriod: PeriodSchema,
        scope: ScopeSchema,
        tolerance: z.string().nullable(),
        origin: CriterionOriginSchema,
      }),
      z.object({
        kind: z.literal("SEMANTIC"),
        proposition: z.string(),
        requiredEvidence: z.array(z.string()),
        horizonEnd: z.string().nullable(),
        origin: CriterionOriginSchema,
      }),
      z.object({
        kind: z.enum(["ALL", "ANY"]),
        children: z.array(ConditionSchema),
        origin: CriterionOriginSchema,
      }),
    ]) as any
);

export const ThesisRevisionSchema = z.object({
  id: z.string().uuid(),
  thesisId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  groupId: z.string().uuid(),
  text: z.string(),
  originalText: z.string(),
  sourceEvidenceIds: z.array(z.string().uuid()).default([]),
  type: z.enum(["NUMERIC_FORECAST", "DIRECTIONAL", "CAUSAL", "QUALITATIVE", "HISTORICAL"]),
  criterion: ConditionSchema,
  priority: z.number().int().default(0),
  derivedFromThesisIds: z.array(z.string().uuid()).default([]),
  extractionIssues: z.array(z.string()).default([]),
});
export type ThesisRevision = z.infer<typeof ThesisRevisionSchema>;

export const CitedStatementSchema = z.object({
  text: z.string(),
  evidenceIds: z.array(z.string().uuid()).default([]),
  factIds: z.array(z.string().uuid()).default([]),
  calculationIds: z.array(z.string().uuid()).default([]),
});
export type CitedStatement = z.infer<typeof CitedStatementSchema>;

export const ResearchQuestionSchema = z.object({
  id: z.string().uuid(),
  thesisId: z.string().uuid(),
  text: z.string(),
  requiredEvidence: z.string(),
  triggerPeriod: PeriodSchema.nullable().default(null),
  status: z.enum(["OPEN", "ANSWERED", "DEFERRED"]),
  answer: CitedStatementSchema.nullable().default(null),
});
export type ResearchQuestion = z.infer<typeof ResearchQuestionSchema>;

export const ThesisAssessmentSchema = z.object({
  id: z.string().uuid(),
  thesisId: z.string().uuid(),
  thesisRevisionId: z.string().uuid(),
  inputHash: z.string(),
  status: OutcomeSchema,
  maturity: MaturitySchema,
  interimSignal: InterimSignalSchema,
  summary: z.string(),
  factIds: z.array(z.string().uuid()).default([]),
  calculationIds: z.array(z.string().uuid()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  observedGap: CitedStatementSchema.nullable().default(null),
  disclosedCauses: z.array(
    CitedStatementSchema.extend({
      attribution: z.enum(["MANAGEMENT_EXPLANATION", "DISCLOSED_FACT"]),
    })
  ).default([]),
  hypotheses: z.array(
    z.object({
      text: z.string(),
      supportingEvidenceIds: z.array(z.string().uuid()).default([]),
      missingEvidence: z.array(z.string()).default([]),
    })
  ).default([]),
  conditions: z.array(
    z.object({
      path: z.string(),
      result: z.enum(["MET", "NOT_MET", "UNKNOWN"]),
      reason: z.string(),
      evidenceIds: z.array(z.string().uuid()).default([]),
      calculationIds: z.array(z.string().uuid()).default([]),
    })
  ).default([]),
  nextQuestions: z.array(ResearchQuestionSchema).default([]),
  limitations: z.array(z.string()).default([]),
});
export type ThesisAssessment = z.infer<typeof ThesisAssessmentSchema>;

export const SourceManifestSchema = z.object({
  asOf: z.string(),
  hash: z.string(),
  documents: z.array(
    z.object({
      documentId: z.string().uuid(),
      sha256: z.string(),
      purpose: z.string(),
    })
  ).default([]),
  latestCoveredPeriod: PeriodSchema.nullable().default(null),
  checkedAt: z.string(),
  discoveryStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED", "NOT_REQUIRED"]),
  missing: z.array(z.string()).default([]),
});
export type SourceManifest = z.infer<typeof SourceManifestSchema>;

export const ResearchMethodSchema = z.object({
  version: z.number().int().default(1),
  focusMetrics: z.array(z.string()).default([]),
  aliases: z.record(z.string(), z.array(z.string())).default({}),
  focusQuestions: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
});
export type ResearchMethod = z.infer<typeof ResearchMethodSchema>;

export const StateItemSchema = z.object({
  thesis: ThesisRevisionSchema,
  lifecycle: z.enum(["ACTIVE", "ARCHIVED"]),
  assessment: ThesisAssessmentSchema,
  userJudgment: z.string().nullable().default(null),
});
export type StateItem = z.infer<typeof StateItemSchema>;

export const ResearchStateSchema = z.object({
  schemaVersion: z.literal("1.0").default("1.0"),
  projectId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  updateId: z.string().uuid(),
  confirmedAt: z.string(),
  items: z.array(StateItemSchema),
  questions: z.array(ResearchQuestionSchema).default([]),
  method: ResearchMethodSchema.default({
    version: 1,
    focusMetrics: [],
    aliases: {},
    focusQuestions: [],
    preferences: [],
  }),
  sourceManifest: SourceManifestSchema,
});
export type ResearchState = z.infer<typeof ResearchStateSchema>;

export const UserCorrectionSchema = z.object({
  id: z.string().uuid(),
  thesisId: z.string().uuid().nullable().default(null),
  type: z.enum(["THESIS_TEXT", "CRITERION", "USER_JUDGMENT", "RESEARCH_PREFERENCE"]),
  action: z.enum(["SET", "CLEAR"]),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().default(""),
  baseStateVersion: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type UserCorrection = z.infer<typeof UserCorrectionSchema>;

export const DraftItemSchema = z.object({
  thesis: ThesisRevisionSchema,
  previous: ThesisAssessmentSchema.nullable().default(null),
  proposed: ThesisAssessmentSchema,
  change: z.enum(["NEW", "CHANGED", "UNCHANGED", "ARCHIVED"]),
  changeReason: z.string(),
  include: z.boolean().default(true),
  userJudgment: z.string().nullable().default(null),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const DraftSchema = z.object({
  schemaVersion: z.literal("1.0").default("1.0"),
  id: z.string().uuid(),
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  baseStateVersion: z.number().int().nonnegative(),
  sourceManifest: SourceManifestSchema,
  items: z.array(DraftItemSchema),
  staleThesisIds: z.array(z.string().uuid()).default([]),
  questions: z.array(ResearchQuestionSchema).default([]),
  corrections: z.array(UserCorrectionSchema).default([]),
  method: ResearchMethodSchema.default({
    version: 1,
    focusMetrics: [],
    aliases: {},
    focusQuestions: [],
    preferences: [],
  }),
});
export type Draft = z.infer<typeof DraftSchema>;

export const RequiredInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("COMPANY_SELECTION"),
    candidates: z.array(CompanySchema),
    explanation: z.string(),
  }),
  z.object({
    kind: z.literal("REPORT_DATE"),
    documentId: z.string().uuid(),
    suggestedDate: z.string().nullable(),
    quote: z.string(),
  }),
  z.object({
    kind: z.literal("MISSING_SOURCE"),
    missing: z.array(z.string()),
    canContinueWithAvailable: z.boolean(),
  }),
]);
export type RequiredInput = z.infer<typeof RequiredInputSchema>;

export const RunBudgetSchema = z.object({
  inputTokens: z.number().int().default(0),
  outputTokens: z.number().int().default(0),
  modelCalls: z.number().int().default(0),
  toolCalls: z.number().int().default(0),
  maxInputTokens: z.number().int().default(200000),
  maxOutputTokens: z.number().int().default(30000),
  maxModelCalls: z.number().int().default(12),
  maxToolCalls: z.number().int().default(30),
});
export type RunBudget = z.infer<typeof RunBudgetSchema>;

export const RunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: RunKindSchema,
  status: RunStatusSchema,
  phase: PhaseSchema.nullable().default(null),
  baseStateVersion: z.number().int().nonnegative(),
  asOf: z.string(),
  sourceManifest: SourceManifestSchema.nullable().default(null),
  requiredInput: RequiredInputSchema.nullable().default(null),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    })
    .nullable()
    .default(null),
  completionReason: z.enum(["CONFIRMED", "NO_CHANGE"]).nullable().default(null),
  cancelRequested: z.boolean().default(false),
  budget: RunBudgetSchema.default({
    inputTokens: 0,
    outputTokens: 0,
    modelCalls: 0,
    toolCalls: 0,
    maxInputTokens: 200000,
    maxOutputTokens: 30000,
    maxModelCalls: 12,
    maxToolCalls: 30,
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Run = z.infer<typeof RunSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  company: CompanySchema.nullable().default(null),
  currentVersion: z.number().int().nonnegative().default(0),
  archived: z.boolean().default(false),
  monitor: z
    .object({
      enabled: z.boolean().default(false),
      timezone: z.literal("Asia/Shanghai").default("Asia/Shanghai"),
      localTime: z.literal("09:00").default("09:00"),
      lastCheckedAt: z.string().nullable().default(null),
      nextCheckAt: z.string().nullable().default(null),
    })
    .default({
      enabled: false,
      timezone: "Asia/Shanghai",
      localTime: "09:00",
      lastCheckedAt: null,
      nextCheckAt: null,
    }),
  currentState: ResearchStateSchema.nullable().default(null),
  activeRun: RunSchema.nullable().default(null),
});
export type Project = z.infer<typeof ProjectSchema>;

export const RunEventSchema = z.object({
  id: z.string(),
  runId: z.string().uuid(),
  type: z.enum(["run.status", "run.progress", "run.input_required", "draft.ready", "run.error"]),
  status: RunStatusSchema,
  phase: PhaseSchema.nullable(),
  completed: z.number().int().optional(),
  total: z.number().int().optional(),
  message: z.string(),
  createdAt: z.string(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const CreateRunRequestSchema = z.object({
  kind: RunKindSchema,
  projectId: z.string().uuid().optional(),
  uploadIds: z.array(z.string().uuid()).optional(),
  asOf: z.string().optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

/**
 * Local report-first V1 routes use the uploaded document id as their explicit
 * input. Keep these request contracts next to the shared domain validators so
 * the browser and the HTTP layer cannot silently drift apart.
 */
export const V1InitialReportRunRequestSchema = z.object({
  kind: z.literal("INITIAL_REPORT"),
  reportDocumentId: z.string().uuid(),
});
export type V1InitialReportRunRequest = z.infer<typeof V1InitialReportRunRequestSchema>;

export const V1FilingRunRequestSchema = z.object({
  filingDocumentId: z.string().uuid(),
  period: PeriodSchema,
  publishedAt: z.string().min(1),
  scope: ScopeSchema,
});
export type V1FilingRunRequest = z.infer<typeof V1FilingRunRequestSchema>;

export const DraftPatchSchema = z.object({
  edits: z
    .array(
      z.object({
        thesisId: z.string().uuid(),
        include: z.boolean().optional(),
        text: z.string().optional(),
        criterion: ConditionSchema.optional(),
        userJudgment: z.string().nullable().optional(),
      })
    )
    .default([]),
  questionEdits: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        text: z.string().optional(),
        status: z.enum(["OPEN", "ANSWERED", "DEFERRED"]).optional(),
      })
    )
    .default([]),
  method: ResearchMethodSchema.optional(),
});
export type DraftPatch = z.infer<typeof DraftPatchSchema>;

export const ConfirmRequestSchema = z.object({
  baseStateVersion: z.number().int().nonnegative(),
  draftRevision: z.number().int().nonnegative(),
});
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;

export const ConfirmResponseSchema = z.object({
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  updateId: z.string().uuid(),
  runId: z.string().uuid(),
});
export type ConfirmResponse = z.infer<typeof ConfirmResponseSchema>;

export const EvidenceBundleSchema = z.object({
  documents: z.array(SourceDocumentSchema),
  spans: z.array(EvidenceSpanSchema),
  facts: z.array(FactSchema),
  calculations: z.array(CalculationSchema),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
