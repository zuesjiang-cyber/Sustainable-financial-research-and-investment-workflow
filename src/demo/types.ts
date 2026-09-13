/**
 * Demo-only domain model for FinTrust's three product pillars.
 *
 * ISOLATION CONTRACT
 *   Everything under `src/demo/` is static, read-only showcase material. It
 *   must never import from `src/server/**`, never call `fetch`, never create a
 *   project or run, and never write Research Memory. Nothing in the real
 *   pipeline (`src/server/v1/**`, `src/components/research/**`) imports this
 *   module either. The separation is structural, not a comment.
 *
 * THE THREE PILLARS
 *   1. 面向状态的投研管理 — the durable asset is a versioned ResearchState, not
 *      a conversation. Arguments keep a stable identity across rounds.
 *   2. 数字与语义双通道 — numbers go through deterministic code behind a
 *      comparability gate; meaning goes through the model behind a citation
 *      gate. Each channel produces its own verdict, then they compose.
 *   3. 论述拆到论据，只有强事实支撑的才作为论据 — a thesis is decomposed into
 *      atomic arguments, each independently verified. Weakly supported
 *      arguments are NOT admitted as evidence, and the thesis status is an
 *      aggregation over admitted arguments only.
 */

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                    */
/* ------------------------------------------------------------------ */

export type ArgumentStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "WEAKENED"
  | "UNRESOLVED";

/** Deadline of the verification window — deliberately NOT folded into status. */
export type Maturity = "NOT_DUE" | "IN_PROGRESS" | "DUE";

/** Pace signal within an immature window — also kept separate from status. */
export type InterimSignal = "ABOVE" | "ON_TRACK" | "BELOW" | "UNKNOWN";

/**
 * Pillar 3 gate output for a single atomic argument.
 *
 * STRONG  — admitted as evidence; participates in the thesis roll-up.
 * WEAK    — related but insufficiently supported; recorded and displayed, but
 *           explicitly NOT admitted as evidence and NOT counted in the roll-up.
 * PENDING — no evidence yet in this period.
 */
export type SupportLevel = "STRONG" | "WEAK" | "PENDING";

/* ------------------------------------------------------------------ */
/* Pillar 2 — numeric channel (deterministic code)                      */
/* ------------------------------------------------------------------ */

export interface NumericOperand {
  label: string;
  value: string;
  unit: string;
  period: string;
  scope: string;
  /** Physical PDF page + locator, so a number is never free-floating. */
  source: { fileName: string; page: number; locator: string };
}

export interface ComparabilityCheck {
  code: "ENTITY_MATCH" | "PERIOD_MATCH" | "SCOPE_MATCH" | "NON_ZERO_DENOMINATOR" | "BASIS_MATCH";
  label: string;
  passed: boolean;
  explanation: string;
}

export interface NumericChannel {
  /** The registered formula, shown verbatim — the model never does arithmetic. */
  formula: string;
  formulaId: string;
  formulaVersion: string;
  operands: NumericOperand[];
  checks: ComparabilityCheck[];
  /** Decimal string result, or null when a check refused to compute. */
  result: string | null;
  resultDisplay: string;
  /** When checks fail, the refusal itself is the honest output. */
  refusalReason?: string;
  target: string | null;
  targetDisplay?: string;
  gapDisplay?: string | null;
  status: ArgumentStatus;
  maturity: Maturity;
  interimSignal: InterimSignal;
  /** What the numeric channel alone is allowed to conclude. */
  verdict: string;
}

/* ------------------------------------------------------------------ */
/* Pillar 2 — semantic channel (model, citation-gated)                  */
/* ------------------------------------------------------------------ */

export interface SemanticEvidence {
  quote: string;
  fileName: string;
  page: number;
  headingPath: string[];
  textHash: string;
  quality: "NATIVE" | "OCR_RELIABLE" | "LOW_CONFIDENCE";
}

export type SemanticRelation = "SUPPORTS" | "REFUTES" | "RELATED_ONLY" | "INSUFFICIENT";

export interface Attribution {
  kind: "MANAGEMENT_EXPLANATION" | "DISCLOSED_FACT" | "SYSTEM_HYPOTHESIS";
  label: string;
  text: string;
  evidenceIndex: number | null;
}

export interface MissingEvidence {
  what: string;
  whereToLook: string;
}

export interface SemanticChannel {
  evidence: SemanticEvidence[];
  relation: SemanticRelation;
  /** The second, short adversarial pass over the semantic judgement. */
  adversarialCheck: {
    asked: string;
    findings: string[];
    /** Two passes disagreeing keeps the more cautious status. */
    agreed: boolean;
  };
  attributions: Attribution[];
  missingEvidence: MissingEvidence[];
  status: ArgumentStatus;
  verdict: string;
}

/* ------------------------------------------------------------------ */
/* Pillar 2 — channel composition                                       */
/* ------------------------------------------------------------------ */

export interface ChannelComposition {
  numericConclusion: string;
  semanticConclusion: string;
  rule: string;
  resultingStatus: ArgumentStatus;
  /** Shown when the two channels disagree, which is the interesting case. */
  tension?: string;
}

/* ------------------------------------------------------------------ */
/* Pillar 3 — atomic arguments and the admission gate                   */
/* ------------------------------------------------------------------ */

export interface ArgumentVersion {
  status: ArgumentStatus;
  maturity: Maturity;
  interimSignal: InterimSignal;
  supportLevel: SupportLevel;
  /** The gate's reasoning, stated as a rule rather than a vibe. */
  gateReason: string;
  /** Which channels actually produced evidence this round. */
  activeChannels: Array<"NUMERIC" | "SEMANTIC">;
  numeric?: NumericChannel;
  semantic?: SemanticChannel;
  composition?: ChannelComposition;
  /** What changed relative to the previous version, if anything. */
  changeNote?: string;
  nextQuestion?: { text: string; requiredEvidence: string };
}

export type ClaimKind =
  | "NUMERIC_TARGET"
  | "TREND"
  | "CAUSAL_LINK"
  | "DISCLOSURE_DEPENDENT";

export interface AtomicClaim {
  /** Stable across every version — this is the argument's identity. */
  argumentId: string;
  kind: ClaimKind;
  kindLabel: string;
  /** The atomic, single-verifiable-object proposition. */
  statement: string;
  /** What would have to be true, stated observably. */
  verificationTarget: string;
  /** Where the criterion came from — never silently rewritten. */
  criterionOrigin: "REPORT_EXPLICIT" | "SYSTEM_PROPOSED" | "USER_CONFIRMED";
  versions: Record<string, ArgumentVersion>;
}

/* ------------------------------------------------------------------ */
/* Pillar 3 — roll-up from admitted arguments only                      */
/* ------------------------------------------------------------------ */

export interface RollUp {
  /** The aggregation rule, stated explicitly and applied in order. */
  rule: string[];
  admitted: string[];
  rejected: Array<{ argumentId: string; reason: string }>;
  pending: string[];
  resultingStatus: ArgumentStatus;
  /**
   * The sentence a summarising chatbot would have produced, and why this
   * system refuses to produce it.
   */
  naiveSummary: string;
  honestConclusion: string;
}

/* ------------------------------------------------------------------ */
/* Pillar 1 — versioned research state                                  */
/* ------------------------------------------------------------------ */

export type ThesisStatus = ArgumentStatus;

export interface ThesisVersionView {
  status: ThesisStatus;
  maturity: Maturity;
  /** One substantive sentence — no fabricated confidence percentages. */
  summary: string;
  rollUp: RollUp;
  /** The researcher's own words, kept separate from system output. */
  userJudgment: string | null;
  userJudgmentCarriedFrom?: string | null;
}

export interface Thesis {
  /** Stable across all versions. */
  thesisId: string;
  /** The report's own words, never rewritten by later rounds. */
  originalStatement: string;
  originalSource: { fileName: string; page: number; locator: string };
  /** Current revision text — may differ from the original after user edits. */
  currentStatement: string;
  revision: number;
  priority: number;
  claims: AtomicClaim[];
  versions: Record<string, ThesisVersionView>;
}

export interface SourceDoc {
  role: "THESIS_SOURCE" | "FINANCIAL_FILING";
  fileName: string;
  publishedAt: string;
  period: string;
  sha256Short: string;
  pages: number;
}

export interface UserCorrection {
  type: "THESIS_TEXT" | "CRITERION" | "USER_JUDGMENT" | "RESEARCH_PREFERENCE";
  label: string;
  before: string;
  after: string;
  reason: string;
  /** Corrections are highest-priority context for every later round. */
  carriedForward: boolean;
}

export interface ResolvedQuestion {
  text: string;
  status: "OPEN" | "ANSWERED" | "DEFERRED";
  answer?: string;
  createdIn: string;
}

export interface ResearchVersion {
  version: string;
  label: string;
  confirmedAt: string;
  asOf: string;
  trigger: string;
  documents: SourceDoc[];
  /** What moved relative to the previous version. */
  stateDelta: {
    headline: string;
    changed: string[];
    unchanged: string[];
    newlyUnresolved: string[];
  };
  corrections: UserCorrection[];
  questions: ResolvedQuestion[];
  modelCalls: { count: number; inputTokens: number; outputTokens: number; note: string };
}

export interface PhilosophyDemo {
  meta: {
    company: string;
    securityCode: string;
    exchange: string;
    industry: string;
    accountingStandard: string;
    defaultScope: string;
    /** Explicit synthetic marking — this is not a real disclosure. */
    isSynthetic: true;
    dataNote: string;
  };
  versions: ResearchVersion[];
  theses: Thesis[];
  /** The three pillars, stated for the overview panel. */
  pillars: Array<{
    id: string;
    index: string;
    title: string;
    claim: string;
    howItShows: string;
    antiPattern: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Presentation brief — the four-line card                              */
/* ------------------------------------------------------------------ */

/**
 * The compact card copy required by 01_产品定义与交互.md §4 and the wireframe
 * in 10_前端实现设计.md §2. Kept separate from the verification data above so
 * that the deep evidence model stays authoritative and the surface prose stays
 * short: a card is four lines, and everything else is reachable by expanding.
 *
 * Field order follows DESIGN.md 信息层级:
 *   旧观点 → 最新财报事实 → 差距 → 原因 → 下一步问题
 */
export interface ThesisBrief {
  /** 最新事实 — the 1–3 most relevant figures, one line, with a [来源] hook. */
  keyFact: string;
  /** Page the key fact comes from; drives the [来源] affordance. */
  keyFactSource: { fileName: string; page: number } | null;
  /** 差距 — observedGap per 06 §8: how far actual is from target. */
  gap: string | null;
  /** 当前判断 — one substantive sentence, not a restatement of the status. */
  assessment: string;
  /** 接下来盯什么 — a concrete evidence request, never "持续关注". */
  nextStep: string;
  /**
   * 本次变化 — set only when this thesis actually moved or gained evidence in
   * this round. Drives the [本次变化] filter. Per 03 §2, a thesis the new
   * report does not touch keeps its status but must say 本次无新增证据 rather
   * than pretending to have been re-verified.
   */
  change: string | null;
  /** True when the round produced no new evidence for this thesis. */
  noNewEvidence?: boolean;
}

/* ------------------------------------------------------------------ */
/* 画面二 — 事实与推论                                                   */
/* ------------------------------------------------------------------ */

/**
 * The output of a round, split strictly in two.
 *
 * A FACT is binary: it holds or it does not. There is no "partly holds" and no
 * hedging, because a fact is either verifiable against the disclosure or it is
 * not. Facts never require the user to take a position.
 *
 * An INFERENCE is the model's judgement. It is restrained by construction: it
 * must carry its basis, its limitation and the gap that would close it, or it is
 * not emitted at all. An inference never becomes a fact however confident the
 * model is, and a fact is never diluted into an inference because another
 * explanation is conceivable.
 */

export type FactVerdict = "HOLDS" | "FAILS";

export type FactKind =
  /** A measured value against a threshold. */
  | "NUMERIC"
  /** Whether the disclosure says something, quoted verbatim. */
  | "DISCLOSURE"
  /** Whether the evidence needed to settle a claim exists at all. */
  | "EVIDENCE_EXISTS";

/**
 * What kind of document a figure came from. This caps what a numeric fact may
 * claim: an unaudited forecast can move the user's attention but can never make
 * a fact hold.
 */
export type EvidenceNature =
  | "AUDITED"
  | "UNAUDITED_ACTUAL"
  | "PRELIMINARY"
  | "FORECAST"
  | "NARRATIVE"
  | "THIRD_PARTY";

export interface Fact {
  /** A single, binary, verifiable proposition. */
  statement: string;
  verdict: FactVerdict;
  kind: FactKind;
  nature: EvidenceNature;
  /** Provenance — clickable through to the evidence drawer. */
  source: { fileName: string; page: number; locator: string } | null;
  /** Links to the argument whose calculation produced this fact, if any. */
  argumentId?: string;
  /**
   * Why it fails, when it fails. Required for FAILS: a bare "不成立" without a
   * reason is not an audit trail.
   */
  failReason?: string;
}

export interface Inference {
  /** The judgement itself, worded with restraint. */
  text: string;
  /** 依据 — checkable facts or figures it rests on. */
  basis: string;
  /** 局限 — why it cannot be confirmed. */
  limitation: string;
  /** 缺口 — what would close it. */
  gap: string;
  /**
   * Restraint level. Affects visual weight only; it never affects a fact and
   * never contributes to the thesis status.
   */
  strength: "MODERATE" | "TENTATIVE";
  /**
   * Set when the inference rests on an unaudited forecast or express report, so
   * the downgrade is stated rather than implied.
   */
  natureCaveat?: string;
}

export interface RoundFindings {
  facts: Fact[];
  inferences: Inference[];
  /**
   * Coverage statement, when this round's disclosure does not touch the thesis
   * at all. Neither fact nor inference: a declaration that nothing was
   * re-verified. Omitting it would let the system imply it had checked.
   */
  notTouched?: string;
}

/** Where a thesis came from — 用户已经拥有的观点 is not always in a report. */
export type ThesisOrigin = "REPORT_EXTRACTED" | "USER_REVISED" | "USER_AUTHORED";
