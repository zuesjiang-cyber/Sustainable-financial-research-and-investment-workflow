import crypto from "node:crypto";
import Decimal from "decimal.js";
import { MetricRegistry } from "../facts/metricRegistry";
import type {
  ThesisRevision,
  ThesisAssessment,
  Fact,
  EvidenceSpan,
  Calculation,
  UUID,
  Condition,
  CitedStatement,
  ResearchQuestion,
} from "../../shared/domain";
import { ThesisAssessmentSchema } from "../../shared/domain";

export interface AgentRunContext {
  runId: UUID;
  companyId: UUID;
  asOf: string;
  allowedDocumentIds: UUID[];
}

export interface AgentEvidencePack {
  spans: EvidenceSpan[];
  facts: Fact[];
  calculations: Calculation[];
}

export class ResearchAgent {
  private readonly metricRegistry: MetricRegistry;

  constructor(metricRegistry: MetricRegistry = new MetricRegistry()) {
    this.metricRegistry = metricRegistry;
  }

  /**
   * Evaluates a single thesis against the frozen evidence pack
   * using the 6-tool verification rules and deterministic calculation.
   */
  async assessThesis(
    thesis: ThesisRevision,
    evidencePack: AgentEvidencePack,
    context: AgentRunContext
  ): Promise<ThesisAssessment> {
    const inputHash = crypto
      .createHash("sha256")
      .update(`${thesis.id}:${thesis.revision}:${context.asOf}:${evidencePack.facts.length}`)
      .digest("hex");

    const criterion = thesis.criterion;
    const factIds: UUID[] = [];
    const calculationIds: UUID[] = [];
    const evidenceIds: UUID[] = [];

    let status: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "WEAKENED" | "UNRESOLVED" = "UNRESOLVED";
    let maturity: "NOT_DUE" | "IN_PROGRESS" | "DUE" = "DUE";
    let interimSignal: "ABOVE" | "ON_TRACK" | "BELOW" | "UNKNOWN" = "UNKNOWN";
    let summary = "";
    let observedGap: CitedStatement | null = null;
    const nextQuestions: ResearchQuestion[] = [];

    if (criterion.kind === "COMPARE") {
      const metric = criterion.metric;
      const targetStr = criterion.target;
      const targetDec = new Decimal(targetStr);
      const targetPeriod = criterion.period;

      // 1. Tool 1: find_facts
      // Look for facts matching metric
      let matchingFacts = evidencePack.facts.filter(
        (f) => f.metric === metric && f.companyId === context.companyId &&
          context.allowedDocumentIds.includes(f.documentId) && f.scope === criterion.scope
      );

      // If metric is gross_margin, we can compute it from revenue and cost_of_revenue
      let computedMarginVal: Decimal | null = null;
      if (metric === "gross_margin") {
        const revFacts = evidencePack.facts.filter(
          (f) => f.metric === "revenue" && f.companyId === context.companyId &&
            context.allowedDocumentIds.includes(f.documentId) && f.scope === criterion.scope
        );
        const costFacts = evidencePack.facts.filter(
          (f) => f.metric === "cost_of_revenue" && f.companyId === context.companyId &&
            context.allowedDocumentIds.includes(f.documentId) && f.scope === criterion.scope
        );

        if (revFacts.length > 0 && costFacts.length > 0) {
          // Sort by periodEnd desc
          const latestRev = revFacts.sort((a, b) => b.period.end.localeCompare(a.period.end))[0];
          const latestCost = costFacts.find((c) => c.period.end === latestRev.period.end);

          if (latestCost) {
            factIds.push(latestRev.id, latestCost.id);
            evidenceIds.push(...latestRev.evidenceIds, ...latestCost.evidenceIds);

            // Tool 5: calculate_metric
            const calcRes = this.metricRegistry.computeGrossMargin(latestRev, latestCost);
            if (calcRes.result !== null) {
              computedMarginVal = new Decimal(calcRes.result);

              const calcId = crypto.randomUUID();
              calculationIds.push(calcId);

              // Check maturity: if target is full year (YEAR) but latest fact is YTD or earlier period
              if (targetPeriod.basis === "YEAR" && latestRev.period.basis !== "YEAR") {
                maturity = "IN_PROGRESS";
              } else if (new Date(latestRev.period.end) < new Date(targetPeriod.end)) {
                maturity = "IN_PROGRESS";
              } else {
                maturity = "DUE";
              }

              // Margin ratio target (e.g. target 30 -> ratio 0.30 or target 0.30)
              const normalizedTargetRatio = targetDec.greaterThan(1)
                ? targetDec.dividedBy(100)
                : targetDec;

              const isMeeting = computedMarginVal.greaterThanOrEqualTo(normalizedTargetRatio);

              if (maturity === "IN_PROGRESS") {
                // Year not due yet! Cannot fail or prematurely conclude supported
                interimSignal = isMeeting ? "ABOVE" : "BELOW";
                status = isMeeting ? "PARTIALLY_SUPPORTED" : "UNRESOLVED";
                summary = `当前报告期（截至 ${latestRev.period.end}）综合毛利率重算值为 ${(computedMarginVal.times(100)).toFixed(2)}%，年度目标尚未到期，阶段性信号为 ${interimSignal}。`;
              } else {
                status = isMeeting ? "SUPPORTED" : "WEAKENED";
                summary = isMeeting
                  ? `经法定报表 Decimal 重算，综合毛利率达到 ${(computedMarginVal.times(100)).toFixed(2)}%，满足研报预期（>= ${targetStr}%）。`
                  : `综合毛利率核验值为 ${(computedMarginVal.times(100)).toFixed(2)}%，未达到研报预期目标（>= ${targetStr}%）。`;
              }

              observedGap = {
                text: `核验毛利率 ${(computedMarginVal.times(100)).toFixed(2)}% vs 目标门槛 ${targetStr}% (差距: ${(computedMarginVal.minus(normalizedTargetRatio).times(100)).toFixed(2)} pct)`,
                evidenceIds: [...latestRev.evidenceIds, ...latestCost.evidenceIds],
                factIds: [latestRev.id, latestCost.id],
                calculationIds: [calcId],
              };
            }
          }
        }
      } else if (matchingFacts.length > 0) {
        // Direct metric matching
        const fact = [...matchingFacts].sort((a, b) => b.period.end.localeCompare(a.period.end))[0];
        factIds.push(fact.id);
        evidenceIds.push(...fact.evidenceIds);
        const actualDec = new Decimal(fact.value);

        const isMet = criterion.op === "GTE"
          ? actualDec.greaterThanOrEqualTo(targetDec)
          : criterion.op === "GT"
            ? actualDec.greaterThan(targetDec)
            : criterion.op === "LTE"
              ? actualDec.lessThanOrEqualTo(targetDec)
              : criterion.op === "LT"
                ? actualDec.lessThan(targetDec)
                : actualDec.equals(targetDec);

        if (criterion.period.basis === "YEAR" && fact.period.basis !== "YEAR") {
          maturity = "IN_PROGRESS";
        } else if (fact.period.end < criterion.period.end) {
          maturity = "IN_PROGRESS";
        }

        if (maturity === "IN_PROGRESS") {
          status = isMet ? "PARTIALLY_SUPPORTED" : "UNRESOLVED";
          interimSignal = isMet ? "ABOVE" : "BELOW";
          summary = `${fact.labelOriginal} 截至 ${fact.period.end} 披露值为 ${fact.value}，${isMet ? "阶段性达到" : "尚未达到"}目标 ${targetStr}；目标期间尚未到期。`;
        } else {
          status = isMet ? "SUPPORTED" : "WEAKENED";
          interimSignal = isMet ? "ABOVE" : "BELOW";
          summary = `${fact.labelOriginal} 实际披露值为 ${fact.value}，${isMet ? "达到" : "未达到"} 目标门槛 ${targetStr}。`;
        }
        const gapCalculationId = crypto.randomUUID();
        calculationIds.push(gapCalculationId);
        observedGap = {
          text: `实际值 ${fact.value} vs 目标值 ${targetStr}（差额 ${actualDec.minus(targetDec).toString()}）`,
          evidenceIds: fact.evidenceIds,
          factIds: [fact.id],
          calculationIds: [gapCalculationId],
        };
      }
    } else if (criterion.kind === "TREND") {
      // Trend evaluation (e.g. cash flow improvement)
      const matchingFacts = evidencePack.facts.filter(
        (f) => f.metric === criterion.metric && f.companyId === context.companyId &&
          context.allowedDocumentIds.includes(f.documentId) && f.scope === criterion.scope
      );

      if (matchingFacts.length >= 2) {
        const ordered = [...matchingFacts].sort((a, b) => b.period.end.localeCompare(a.period.end));
        const fact = ordered[0];
        const previous = ordered.find((candidate) => candidate.period.end !== fact.period.end);
        factIds.push(fact.id);
        if (previous) factIds.push(previous.id);
        evidenceIds.push(...fact.evidenceIds);
        if (previous) evidenceIds.push(...previous.evidenceIds);
        const val = new Decimal(fact.value);
        const previousVal = previous ? new Decimal(previous.value) : null;
        const isMet = previousVal !== null && (criterion.direction === "UP"
          ? val.greaterThan(previousVal)
          : criterion.direction === "DOWN"
            ? val.lessThan(previousVal)
            : val.equals(previousVal));
        if (criterion.period.basis === "YEAR" && fact.period.basis !== "YEAR") {
          maturity = "IN_PROGRESS";
        } else if (fact.period.end < criterion.period.end) {
          maturity = "IN_PROGRESS";
        }
        if (maturity === "IN_PROGRESS") {
          status = isMet ? "PARTIALLY_SUPPORTED" : "UNRESOLVED";
          interimSignal = isMet ? "ABOVE" : "BELOW";
          summary = `${fact.labelOriginal} 本期为 ${fact.value}，可比期间为 ${previous?.value ?? "未知"}，阶段性${isMet ? "符合" : "未符合"}“${criterion.direction}”趋势条件；目标期间尚未到期。`;
        } else {
          status = isMet ? "SUPPORTED" : "WEAKENED";
          interimSignal = isMet ? "ABOVE" : "BELOW";
          summary = `${fact.labelOriginal} 本期为 ${fact.value}，可比期间为 ${previous?.value ?? "未知"}，${isMet ? "符合" : "不符合"}“${criterion.direction}”趋势条件。`;
        }
        observedGap = {
          text: `本期 ${fact.value} vs 可比期间 ${previous?.value ?? "未知"}（差额 ${previousVal ? val.minus(previousVal).toString() : "未知"}）`,
          evidenceIds,
          factIds,
          calculationIds: [],
        };
      } else if (matchingFacts.length === 1) {
        const fact = matchingFacts[0];
        factIds.push(fact.id);
        evidenceIds.push(...fact.evidenceIds);
        summary = `${fact.labelOriginal} 本期披露值为 ${fact.value}，但缺少可比期间事实，暂不能判断趋势。`;
        observedGap = {
          text: `本期实际披露为 ${fact.value}，可比期间值缺失`,
          evidenceIds: fact.evidenceIds,
          factIds: [fact.id],
          calculationIds: [],
        };
      }
    }

    if (!summary) {
      status = "UNRESOLVED";
      summary = `截至 ${context.asOf}，尚未检索到可支持或证伪该观点的完整法定披露证据。`;
    }

    // Follow-up questions are derived from the missing criterion evidence; no
    // company-specific explanation is inserted here.
    const requiredMetric = criterion.kind === "COMPARE" || criterion.kind === "TREND"
      ? criterion.metric
      : "相关披露";
    nextQuestions.push({
      id: crypto.randomUUID(),
      thesisId: thesis.thesisId,
      text: `下一期财报补充核验 ${requiredMetric}，并确认期间、合并口径及可比期间数据。`,
      requiredEvidence: `定期财务报表及附注中的 ${requiredMetric}，以及必要时的可比期间数据`,
      triggerPeriod: null,
      status: "OPEN",
      answer: null,
    });

    const disclosedCauses: Array<CitedStatement & { attribution: "MANAGEMENT_EXPLANATION" | "DISCLOSED_FACT" }> = [];
    const hypotheses: any[] = [];

    if (observedGap) {
      disclosedCauses.push({
        text: `定期报告披露相关财务事实（${observedGap.text}）。`,
        evidenceIds: observedGap.evidenceIds,
        factIds: observedGap.factIds || [],
        calculationIds: observedGap.calculationIds || [],
        attribution: "DISCLOSED_FACT",
      });
      hypotheses.push({
        text: `需持续跟踪后续季度供应链及行业供需格局变化对该指标的扰动。`,
        supportingEvidenceIds: observedGap.evidenceIds,
        missingEvidence: ["完整年度经审计财务报表及附注"],
      });
    }

    const assessment: ThesisAssessment = {
      id: crypto.randomUUID(),
      thesisId: thesis.thesisId,
      thesisRevisionId: thesis.id,
      inputHash,
      status,
      maturity,
      interimSignal,
      summary,
      factIds,
      calculationIds,
      evidenceIds,
      observedGap,
      disclosedCauses,
      hypotheses,
      conditions: [
        {
          path: "criterion",
          result: status === "SUPPORTED" ? "MET" : status === "WEAKENED" ? "NOT_MET" : "UNKNOWN",
          reason: summary,
          evidenceIds,
          calculationIds,
        },
      ],
      nextQuestions,
      limitations: maturity === "IN_PROGRESS" ? ["年度预测尚未到期，仅依据阶段性报告进行进度核验"] : [],
    };

    // Zod validation check to ensure contract compliance
    return ThesisAssessmentSchema.parse(assessment);
  }
}
