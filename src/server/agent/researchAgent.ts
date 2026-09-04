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

type CompareOp = "GT" | "GTE" | "EQ" | "LTE" | "LT";

export class ResearchAgent {
  private readonly metricRegistry: MetricRegistry;

  constructor(metricRegistry: MetricRegistry = new MetricRegistry()) {
    this.metricRegistry = metricRegistry;
  }

  private compare(actual: Decimal, target: Decimal, op: CompareOp): boolean {
    switch (op) {
      case "GT": return actual.greaterThan(target);
      case "GTE": return actual.greaterThanOrEqualTo(target);
      case "LTE": return actual.lessThanOrEqualTo(target);
      case "LT": return actual.lessThan(target);
      case "EQ": return actual.equals(target);
    }
  }

  private maturityFor(period: { basis: string; end: string }, fact: Fact): "NOT_DUE" | "IN_PROGRESS" | "DUE" {
    if (period.basis === "YEAR" && fact.period.basis !== "YEAR") return "IN_PROGRESS";
    return fact.period.end < period.end ? "IN_PROGRESS" : "DUE";
  }

  /**
   * Keep the explanation contract honest even when the optional semantic
   * model call is unavailable: every statement below is either a direct quote
   * or explicitly says that a cause was not disclosed.  No causal conclusion
   * is inferred from a number alone.
   */
  private evidenceBackedExplanation(
    evidencePack: AgentEvidencePack,
    factIds: UUID[],
    evidenceIds: UUID[],
    calculationIds: UUID[],
    allowedDocumentIds: UUID[],
  ): { disclosedCauses: Array<CitedStatement & { attribution: "MANAGEMENT_EXPLANATION" | "DISCLOSED_FACT" }>; hypotheses: Array<{ text: string; supportingEvidenceIds: UUID[]; missingEvidence: string[] }> } {
    const currentEvidence = [...new Set(evidenceIds)].filter((id) => evidencePack.spans.some((span) => span.id === id && allowedDocumentIds.includes(span.documentId)));
    const causePattern = /(原因|主要由于|主要受|受.*影响|推动|拖累|改善.*得益|下降.*由于|增长.*得益|供需|价格|销量|产品结构|产能利用率)/;
    const causeSpan = evidencePack.spans.find((span) => currentEvidence.includes(span.id) && causePattern.test(span.quote));
    const disclosedCauses = causeSpan
      ? [{
          text: causeSpan.quote.slice(0, 1_000),
          evidenceIds: [causeSpan.id],
          factIds,
          calculationIds,
          attribution: "MANAGEMENT_EXPLANATION" as const,
        }]
      : factIds.length > 0
        ? [{
            text: currentEvidence.length > 0
              ? "当前财报片段披露了用于核验的数值事实，但未明确披露该结果的经营原因。"
              : "当前已绑定的财务事实未包含可引用的原因披露，经营原因仍然未知。",
            evidenceIds: currentEvidence,
            factIds,
            calculationIds,
            attribution: "DISCLOSED_FACT" as const,
          }]
        : [];
    const hypotheses = factIds.length > 0
      ? [{
          text: "结果的具体经营原因尚需管理层讨论与分析或财报附注佐证，不能仅凭指标数值确认。",
          supportingEvidenceIds: [] as UUID[],
          missingEvidence: ["管理层讨论与分析或财报附注中的变化原因"],
        }]
      : [];
    return { disclosedCauses, hypotheses };
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

      // Revenue growth is computed from two revenue facts.  The fact extractor
      // stores the current and comparative periods separately; the model is
      // never asked to calculate or invent the percentage.
      if (metric === "revenue_growth") {
        const revenueFacts = evidencePack.facts
          .filter((f) => f.metric === "revenue" && f.companyId === context.companyId && context.allowedDocumentIds.includes(f.documentId) && f.scope === criterion.scope)
          .sort((a, b) => b.period.end.localeCompare(a.period.end));
        const current = revenueFacts[0];
        const previous = current && revenueFacts.find((candidate) => candidate.period.end !== current.period.end);
        if (current) {
          factIds.push(current.id);
          evidenceIds.push(...current.evidenceIds);
        }
        if (previous) {
          factIds.push(previous.id);
          evidenceIds.push(...previous.evidenceIds);
        }
        if (current && previous) {
          const calculation = this.metricRegistry.computeYoYGrowth(current, previous);
          const calculationId = crypto.randomUUID();
          calculationIds.push(calculationId);
          maturity = this.maturityFor(targetPeriod, current);
          if (calculation.result !== null) {
            const actualGrowth = new Decimal(calculation.result);
            const normalizedTarget = criterion.unit === "RATIO" && targetDec.greaterThan(1) ? targetDec.dividedBy(100) : targetDec;
            const isMeeting = this.compare(actualGrowth, normalizedTarget, criterion.op);
            interimSignal = isMeeting ? "ABOVE" : "BELOW";
            if (maturity === "IN_PROGRESS") {
              status = isMeeting ? "PARTIALLY_SUPPORTED" : "UNRESOLVED";
              summary = `营业收入同比重算值为 ${(actualGrowth.times(100)).toFixed(2)}%，年度目标尚未到期，阶段性信号为 ${interimSignal}。`;
            } else {
              status = isMeeting ? "SUPPORTED" : "WEAKENED";
              summary = `经法定报表 Decimal 重算，营业收入同比为 ${(actualGrowth.times(100)).toFixed(2)}%，${isMeeting ? "达到" : "未达到"}研报预期门槛。`;
            }
            observedGap = {
              text: `营业收入同比 ${(actualGrowth.times(100)).toFixed(2)}% vs 目标 ${(normalizedTarget.times(100)).toFixed(2)}%（差额 ${(actualGrowth.minus(normalizedTarget).times(100)).toFixed(2)} pct）`,
              evidenceIds: [...new Set([...current.evidenceIds, ...previous.evidenceIds])],
              factIds: [current.id, previous.id],
              calculationIds: [calculationId],
            };
          }
        } else if (current) {
          summary = `营业收入截至 ${current.period.end} 已披露，但缺少可比期间事实，暂不能计算同比。`;
          observedGap = { text: "营业收入当前期间已披露，但可比期间值缺失", evidenceIds: current.evidenceIds, factIds: [current.id], calculationIds: [] };
          maturity = this.maturityFor(targetPeriod, current);
        }
      }

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

              const isMeeting = this.compare(computedMarginVal, normalizedTargetRatio, criterion.op);

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

        const normalizedTarget = criterion.unit === "RATIO" && targetDec.greaterThan(1) ? targetDec.dividedBy(100) : targetDec;
        const isMet = this.compare(actualDec, normalizedTarget, criterion.op);

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
          text: `实际值 ${fact.value} vs 目标值 ${targetStr}（差额 ${actualDec.minus(normalizedTarget).toString()}）`,
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
        maturity = this.maturityFor(criterion.period, fact);
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

    const explanation = this.evidenceBackedExplanation(evidencePack, factIds, evidenceIds, calculationIds, context.allowedDocumentIds);
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
      disclosedCauses: explanation.disclosedCauses,
      hypotheses: explanation.hypotheses,
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
