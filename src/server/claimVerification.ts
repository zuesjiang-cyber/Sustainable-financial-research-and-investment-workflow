import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type {
  ProjectState,
  ResearchClaim,
  ResearchDocument,
} from "../types/fintrust";
import {
  listProjectEvidence,
  type FinancialCalculationResult,
  type ResearchToolContext,
} from "./researchTools";

export const MAX_CLAIMS_PER_DRAFT = 80;
export const MAX_CLAIM_CHARS = 2_000;
export const MAX_QUOTE_CHARS = 4_000;

export interface ClaimVerificationResult {
  claims: ResearchClaim[];
  invalid_claim_ids: string[];
  retry_feedback: string;
  known_evidence_ids: string[];
}

export type CalculationLookup =
  | Map<string, FinancialCalculationResult>
  | Record<string, FinancialCalculationResult>
  | FinancialCalculationResult[]
  | undefined;

interface EvidenceView {
  evidence_id: string;
  text: string;
  document_id: string;
  document_title: string;
  page: number | null;
}

function asContext(
  projectOrContext: ProjectState | ResearchToolContext,
  material?: ResearchDocument
): ResearchToolContext {
  if ((projectOrContext as ResearchToolContext).project && (projectOrContext as ResearchToolContext).material) {
    return projectOrContext as ResearchToolContext;
  }
  if (!material) throw new Error("Claim validation requires the project material context");
  return { project: projectOrContext as ProjectState, material };
}

function calculationMap(calculations: CalculationLookup): Map<string, FinancialCalculationResult> {
  if (calculations instanceof Map) return calculations;
  if (Array.isArray(calculations)) {
    return new Map(calculations.filter(Boolean).map((item) => [item.calculation_id, item]));
  }
  const result = new Map<string, FinancialCalculationResult>();
  Object.entries(calculations || {}).forEach(([key, item]) => {
    if (item && typeof item === "object") result.set(item.calculation_id || key, item);
  });
  return result;
}

function claimId(raw: Record<string, unknown>, index: number): string {
  const supplied = String(raw.id || raw.claim_id || "").trim();
  return supplied.slice(0, 160) || `CLAIM_${index + 1}_${randomUUID().slice(0, 8)}`;
}

function normaliseKind(raw: Record<string, unknown>): ResearchClaim["kind"] {
  const value = String(raw.kind || raw.claim_type || raw.type || "source").toLowerCase();
  if (value === "calculated" || value === "calculation" || value === "numeric") return "calculated";
  if (value === "inference" || value === "judgement" || value === "judgment") return "inference";
  return "source";
}

function extractNumbers(text: string): Decimal[] {
  const matches = text.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) || [];
  const values: Decimal[] = [];
  for (const match of matches) {
    try {
      values.push(new Decimal(match.replace(/,/g, "")));
    } catch {
      // Ignore non-numeric fragments; the caller will remain unresolved when
      // no usable source/calculation evidence is available.
    }
  }
  return values;
}

function numberMismatch(claimText: string, sourceText: string): Decimal | null {
  const sourceValues = extractNumbers(sourceText);
  for (const claimValue of extractNumbers(claimText)) {
    if (!sourceValues.some((sourceValue) => sourceValue.eq(claimValue))) return claimValue;
  }
  return null;
}

const POSITIVE_TERMS = [
  "增长",
  "提升",
  "改善",
  "回升",
  "增加",
  "加速",
  "放量",
  "稳定",
  "达标",
  "超过",
  "压缩",
  "加强",
  "支持",
  "成功",
  "恢复",
  "改善",
];
const NEGATIVE_TERMS = [
  "下降",
  "下滑",
  "减少",
  "恶化",
  "承压",
  "削弱",
  "未改善",
  "未达",
  "不及",
  "受阻",
  "延期",
  "无法",
  "风险",
  "亏损",
  "放缓",
  "未能",
  "没有",
  "尚未",
  "未披露",
];

function containsNegatedPositive(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:未|没有|并未|尚未|不|非|未能)[^。；，,。！？!?]{0,5}${escaped}`).test(text);
}

function polarity(text: string): -1 | 0 | 1 | 2 {
  let positive = 0;
  let negative = 0;
  for (const term of POSITIVE_TERMS) {
    if (text.includes(term) && !containsNegatedPositive(text, term)) positive += 1;
  }
  for (const term of NEGATIVE_TERMS) if (text.includes(term)) negative += 1;
  if (positive > 0 && negative === 0) return 1;
  if (negative > 0 && positive === 0) return -1;
  if (positive > 0 && negative > 0) return 2;
  return 0;
}

function hasExplicitConflict(claimText: string, sourceText: string): boolean {
  const claimPolarity = polarity(claimText);
  const sourcePolarity = polarity(sourceText);
  return (
    (claimPolarity === 1 && sourcePolarity === -1) ||
    (claimPolarity === -1 && sourcePolarity === 1)
  );
}

function cleanEvidenceIds(raw: unknown, known: Map<string, EvidenceView>): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    const id = String(value || "").trim();
    if (id && known.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function quoteForEvidence(
  quote: string,
  evidenceIds: string[],
  evidence: Map<string, EvidenceView>
): string | null {
  if (!quote) return null;
  for (const evidenceId of evidenceIds) {
    if (evidence.get(evidenceId)?.text.includes(quote)) return evidenceId;
  }
  return null;
}

function expectedCalculationValue(claimText: string, calculation: FinancialCalculationResult): boolean {
  if (!calculation.value) return false;
  const result = new Decimal(calculation.value);
  const canonicalUnit = (unit: string) => ({ "%": "%", "％": "%", "pct_points": "pp", "pct": "pp", "个百分点": "pp", "倍": "x", "x": "x", "元": "元", "万元": "元", "亿元": "元" })[unit];
  const expectedUnit = canonicalUnit(calculation.unit || "");
  if (!expectedUnit) return false;
  const assertions = [...claimText.matchAll(/([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(个百分点|pct_points|亿元|万元|pct|元|%|％|倍|x)/g)];
  const matches = assertions.some((match) => {
    if (canonicalUnit(match[2]) !== expectedUnit) return false;
    const factor = match[2] === "亿元" ? 1e8 : match[2] === "万元" ? 1e4 : 1;
    return new Decimal(match[1].replace(/,/g, "")).times(factor).eq(result);
  });
  if (!matches) return false;
  if (calculation.operation === "condition") {
    const negative = /不满足|未满足|未达|不达标/.test(claimText);
    const affirmative = /满足|达标/.test(claimText) && !negative;
    if (calculation.passed === true && !affirmative) return false;
    if (calculation.passed === false && !negative) return false;
  }
  return true;
}

function normalizedSourceText(value: string): string {
  return value.replace(/[\s，,。；;：:！？!?“”"'（）()]/g, "");
}

function invalidReason(prefix: string, detail: string): string {
  return `${prefix} ${detail}`.trim();
}

function sourceTextForClaim(evidenceIds: string[], evidence: Map<string, EvidenceView>): string {
  return evidenceIds.map((id) => evidence.get(id)?.text || "").join("\n");
}

/**
 * Validate model claims independently of thesis status decisions.
 *
 * A claim can only become verified when its citations are project-local, its
 * quote is contained in the cited source, and any numbers agree with that
 * source or with a successful deterministic calculation.  This function does
 * not decide whether a thesis is supported or weakened.
 */
export function validateResearchClaims(
  rawClaims: unknown,
  projectOrContext: ProjectState | ResearchToolContext,
  materialOrCalculations?: ResearchDocument | CalculationLookup,
  maybeCalculations?: CalculationLookup
): ClaimVerificationResult {
  const isContext = Boolean(
    projectOrContext &&
      (projectOrContext as ResearchToolContext).project &&
      (projectOrContext as ResearchToolContext).material
  );
  const context = isContext
    ? asContext(projectOrContext)
    : asContext(projectOrContext, materialOrCalculations as ResearchDocument);
  const calculations = isContext ? (materialOrCalculations as CalculationLookup) : maybeCalculations;
  const evidence = new Map<string, EvidenceView>();
  listProjectEvidence(context).forEach((item) => {
    evidence.set(item.evidence_id, {
      evidence_id: item.evidence_id,
      text: item.text,
      document_id: item.document_id,
      document_title: item.document_title,
      page: item.page,
    });
  });
  const knownCalculations = calculationMap(calculations);
  const rawList = Array.isArray(rawClaims) ? rawClaims.slice(0, MAX_CLAIMS_PER_DRAFT) : [];
  const claims: ResearchClaim[] = [];
  const invalidClaimIds: string[] = [];
  const retryReasons: string[] = [];
  const thesisIds = new Set((context.project.theses || []).map((thesis) => thesis.id));

  rawList.forEach((entry, index) => {
    const raw = entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : {};
    const id = claimId(raw, index);
    const thesisId = String(raw.thesis_id || raw.pillar_id || "").trim();
    const text = String(raw.claim_text || raw.text || "").trim().slice(0, MAX_CLAIM_CHARS);
    const kind = normaliseKind(raw);
    const requestedEvidenceIds = Array.isArray(raw.evidence_ids)
      ? raw.evidence_ids
      : raw.evidence_id
      ? [raw.evidence_id]
      : [];
    const evidenceIds = cleanEvidenceIds(requestedEvidenceIds, evidence);
    const rawQuote = raw.quote === undefined ? "" : String(raw.quote).slice(0, MAX_QUOTE_CHARS);
    const calculationId = String(raw.calculation_id || "").trim();
    let verification: ResearchClaim["verification"] = "unresolved";
    let explanation = "尚未完成来源核验。";

    if (!text) {
      explanation = invalidReason("主张无有效文本。", "");
    } else if (!thesisIds.has(thesisId)) {
      explanation = invalidReason("主张未绑定项目内观点。", `未知 thesis_id：${thesisId || "(empty)"}。`);
    } else if (evidenceIds.length === 0) {
      explanation = "未提供可验证的项目内 evidence_id；不能把模型解释当作原始证据。";
    } else if (rawQuote && !quoteForEvidence(rawQuote, evidenceIds, evidence)) {
      explanation = "quote 不包含在所引用的项目原文中。";
    } else if (kind === "calculated") {
      const calculation = knownCalculations.get(calculationId);
      if (!calculation) {
        explanation = `找不到已执行的 calculation_id：${calculationId || "(empty)"}。`;
      } else if (calculation.status !== "ok") {
        explanation = `计算未通过：${calculation.error || calculation.explanation}`;
      } else if (!calculation.evidence_ids.every((evidenceId) => evidenceIds.includes(evidenceId))) {
        explanation = "主张引用没有覆盖计算实际使用的全部来源。";
      } else if (!expectedCalculationValue(text, calculation)) {
        explanation = `主张数字与确定性计算结果不一致（计算结果：${calculation.value}${calculation.unit || ""}）。`;
      } else {
        verification = "verified";
        explanation = `数字与确定性计算 ${calculation.calculation_id} 一致，输入期间、单位及来源已绑定。`;
      }
    } else {
      const sourceText = sourceTextForClaim(evidenceIds, evidence);
      const mismatch = numberMismatch(text, rawQuote || sourceText);
      if (mismatch) {
        explanation = `主张中的数字 ${mismatch.toString()} 未在引用原文中找到。`;
      } else if (!rawQuote) {
        explanation = "source/inference 主张必须提供可回溯 quote；解释文本本身不是证据。";
      } else if (hasExplicitConflict(text, rawQuote)) {
        verification = "contradicted";
        explanation = "引用原文的方向或否定表达与主张相反。";
      } else if (kind === "inference") {
        explanation = "原文引用可追溯，但推断和因果解释尚待验证，不能仅因方向词相同就标为事实。";
      } else {
        // Deterministic source verification only certifies an actual extract.
        // A plausible paraphrase needs semantic research, not keyword approval.
        if (normalizedSourceText(rawQuote).includes(normalizedSourceText(text))) {
          verification = "verified";
          explanation = "主张为所引用材料的原文摘录（忽略标点空白）；只确认材料如此表述，不等于独立证明披露内容真实。";
        } else {
          explanation = "引用存在，但主张不是原文摘录；可能变更了主体、指标或因果关系，请改为准确摘录或保留待验证判断。";
        }
      }
    }

    if (verification !== "verified") {
      invalidClaimIds.push(id);
      retryReasons.push(`${id}: ${explanation}`);
    }

    claims.push({
      id,
      thesis_id: thesisId,
      claim_text: text,
      kind,
      verification,
      evidence_ids: evidenceIds,
      ...(rawQuote ? { quote: rawQuote } : {}),
      ...(calculationId ? { calculation_id: calculationId } : {}),
      explanation,
    });
  });

  return {
    claims,
    invalid_claim_ids: invalidClaimIds,
    retry_feedback:
      retryReasons.length > 0
        ? `以下主张未通过证据核验。请仅使用 search/read 返回的项目内 evidence_id 与逐字 quote；必要时先补查工具，再重写这些主张：\n${retryReasons.slice(0, 12).join("\n")}`
        : "",
    known_evidence_ids: Array.from(evidence.keys()),
  };
}

export const verifyResearchClaims = validateResearchClaims;
export const verifyClaims = validateResearchClaims;
