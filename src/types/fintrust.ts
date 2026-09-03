export type ThesisStatus = "加强" | "保持" | "削弱" | "待评估" | "支持" | "部分支持" | "不足以判断";
export type ClaimStatus = "VERIFIED" | "MISMATCH" | "UNSUPPORTED" | "INSUFFICIENT_EVIDENCE" | "CONTRADICTED";
export type ProvenanceType = "calculated" | "source" | "inference" | "ai" | "unverified_sample";

export interface CaseMeta {
  case_id: string;
  company: string;
  ticker: string;
  base_period: string;
  current_period: string;
  currency: string;
  accounting_scope: string;
}

export interface Fact {
  metric: string;
  period: string;
  value: string;
  unit: string;
  evidence_id: string;
}

export interface NarrativeSnippet {
  period?: string;
  source?: string;
  text: string;
  page: number;
  section?: string;
  evidence_id: string;
  is_verified_fact?: boolean; // false if sample/unverified claim
}

export interface NarrativePair {
  topic: string;
  label: string;
  base: NarrativeSnippet;
  current: NarrativeSnippet;
}

export interface StructuredCondition {
  metric: string;
  operator: ">=" | ">" | "<=" | "<" | "==" | "between";
  value: number;
  value2?: number;
  unit: string;
  label?: string;
}

export interface ThesisPillar {
  id: string;
  title: string;
  original_view: string;
  baseline_threshold: string;
  strengthen_threshold: string;
  weaken_threshold: string;
  monitor_next: string;
  structured_conditions?: {
    baseline?: StructuredCondition;
    strengthen?: StructuredCondition;
    weaken?: StructuredCondition;
  };
}

export interface DraftClaim {
  id: string;
  claim_text: string;
  claim_type: string;
  metric_key?: string;
  target_value?: string;
  unit?: string;
  topic?: string;
  keywords?: string[];
  draft_error?: string;
  evidence_id?: string;
}

export interface EvidenceItem {
  evidence_id: string;
  period: string;
  document: string;
  page: number;
  snippet: string;
  image: string;
  is_synthetic_illustration?: boolean;
  checksum?: string;
  audit_disclaimer?: string;
}

export interface CaseInput {
  case: CaseMeta;
  facts: Fact[];
  narrative_pairs: NarrativePair[];
  thesis_pillars: ThesisPillar[];
  claims: DraftClaim[];
  evidence: EvidenceItem[];
}

export interface MetricResult {
  metric_key: string;
  label: string;
  unit: string;
  base_value?: string;
  current_value?: string;
  delta_value?: string;
  delta_type?: "percentage" | "pct_points" | "ratio" | "incalculable";
  description: string;
  provenance_type?: ProvenanceType;
  calculation_note?: string;
}

export interface DeltaResult {
  category: "numeric" | "narrative";
  topic_or_metric: string;
  label: string;
  source_tag: string;
  summary: string;
  detail: string;
  relevance: string;
  evidence_ids: string[];
  provenance_type?: ProvenanceType;
  change_type?: "ADVANCEMENT" | "MODIFIED" | "STABLE" | "UNVERIFIED_SAMPLE" | "DEGRADED";
}

export interface ThesisResult {
  pillar_id: string;
  title: string;
  original_view: string;
  status: ThesisStatus;
  status_tag: string;
  trigger_data: string;
  reason: string;
  monitor_next: string;
  evidence_ids: string[];
  provenance_type?: ProvenanceType;
  structured_rule_evaluation?: string;
}

export interface ClaimAuditResult {
  claim_id: string;
  claim_text: string;
  status: ClaimStatus;
  draft_claim: string;
  recalculated_truth: string;
  explanation: string;
  evidence_id?: string;
  evidence_snippet?: string;
  provenance_type?: ProvenanceType;
  math_verified: boolean;
  source_verified: boolean;
}

export interface KeyFinding {
  rank: number;
  title: string;
  impact: string;
  related_pillar_id: string;
  evidence_id?: string;
  provenance_type?: ProvenanceType;
}

export interface AnalysisMeta {
  model_name: string;
  llm_calls: number;
  latency_ms: number;
  retry_count: number;
  execution_mode: "real_gemini" | "replay_stub" | "offline_math_only" | "degraded_error";
  error_message?: string;
}

export interface AnalysisOutput {
  case_meta: CaseMeta;
  metrics: Record<string, MetricResult>;
  numeric_deltas: DeltaResult[];
  narrative_deltas: DeltaResult[];
  thesis_updates: ThesisResult[];
  claim_audits: ClaimAuditResult[];
  key_findings: KeyFinding[];
  published_summary: string;
  analysis_meta: AnalysisMeta;
}

// ----------------------------------------------------
// ROUND 2: Continuous Research State & Memory Models
// ----------------------------------------------------

export interface GapExplanation {
  observed: string;
  disclosed_reason: string;
  unverified_hypotheses: string;
}

export interface FollowUpQuestion {
  id: string;
  question_text: string;
  status: "未解决" | "部分解决" | "已解决";
  created_in_version: string;
  resolved_in_version?: string | null;
  answer_notes: string;
  updated_at: string;
}

export interface ResearchThesis {
  id: string;
  project_id: string;
  title: string;
  original_view: string;
  formed_at: string;
  basis: string;
  verification_criteria: string;
  verification_timeframe: string;
  current_status: ThesisStatus;
  citations: string[];
  updated_at: string;
}

export interface ThesisDelta {
  thesis_id: string;
  title: string;
  previous_status: ThesisStatus;
  new_status: ThesisStatus;
  reason: string;
  gap_explanation: GapExplanation;
  evidence_ids: string[];
  next_steps: string;
}

export interface ResearchDocument {
  id: string;
  project_id: string;
  source_type: "notes" | "annual_report" | "quarterly_update" | "qualitative_brief";
  title: string;
  disclosure_date: string;
  content: string;
  added_at: string;
  evidence_snippets: Array<{
    id: string;
    page: number;
    text: string;
    section?: string;
  }>;
}

export interface ResearchUpdate {
  id: string;
  project_id: string;
  version: "T0" | "T1" | "T2" | string;
  parent_version: string | null;
  title: string;
  material_id: string;
  thesis_deltas: ThesisDelta[];
  user_revisions: Record<string, string>; // thesis_id -> user edited explanation
  follow_up_questions: FollowUpQuestion[];
  confirmed_at: string;
  confirmed_by: string;
  summary: string;
}

export interface ProjectState {
  id: string;
  name: string;
  company: string;
  ticker: string;
  current_version: "T0" | "T1" | "T2" | string;
  status: "active" | "archived";
  summary: string;
  created_at: string;
  updated_at: string;
  theses: ResearchThesis[];
  documents: ResearchDocument[];
  updates: ResearchUpdate[];
  open_questions: FollowUpQuestion[];
}

export interface SnapshotExport {
  export_version: string;
  exported_at: string;
  project: ProjectState;
}
