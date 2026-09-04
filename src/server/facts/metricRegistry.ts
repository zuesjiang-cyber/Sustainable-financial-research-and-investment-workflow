import Decimal from "decimal.js";
import type { Fact, Calculation, UUID } from "../../shared/domain";

export interface CalculationCheck {
  code: string;
  passed: boolean;
  explanation: string;
}

export interface MetricExecutionResult {
  formulaId: string;
  formulaVersion: string;
  result: string | null;
  unit: "CURRENCY" | "RATIO" | "COUNT" | "CUSTOM";
  displayUnit: string;
  checks: CalculationCheck[];
}

export class MetricRegistry {
  /**
   * Gross Margin Formula: (revenue - cost_of_revenue) / revenue
   */
  computeGrossMargin(revenueFact: Fact, costFact: Fact): MetricExecutionResult {
    const checks: CalculationCheck[] = [];

    // Check entity alignment
    const sameEntity = revenueFact.companyId === costFact.companyId;
    checks.push({
      code: "ENTITY_MATCH",
      passed: sameEntity,
      explanation: sameEntity ? "营业收入与营业成本属于同一主体" : "主体不一致",
    });

    // Check period alignment
    const samePeriod =
      revenueFact.period.end === costFact.period.end &&
      revenueFact.period.basis === costFact.period.basis;
    checks.push({
      code: "PERIOD_MATCH",
      passed: samePeriod,
      explanation: samePeriod ? "报告期间一致" : "期间或时间基准不一致",
    });

    // Check scope alignment
    const sameScope = revenueFact.scope === costFact.scope;
    checks.push({
      code: "SCOPE_MATCH",
      passed: sameScope,
      explanation: sameScope ? "合并口径一致" : "合并口径不一致",
    });

    const allPassed = checks.every((c) => c.passed);
    if (!allPassed) {
      return {
        formulaId: "gross_margin",
        formulaVersion: "1.0",
        result: null,
        unit: "RATIO",
        displayUnit: "%",
        checks,
      };
    }

    const rev = new Decimal(revenueFact.value);
    const cost = new Decimal(costFact.value);

    if (rev.isZero()) {
      checks.push({
        code: "NON_ZERO_DENOMINATOR",
        passed: false,
        explanation: "营业收入基数为零，毛利率无法计算",
      });
      return {
        formulaId: "gross_margin",
        formulaVersion: "1.0",
        result: null,
        unit: "RATIO",
        displayUnit: "%",
        checks,
      };
    }

    // Ratio between 0 and 1, e.g. 0.3542
    const margin = rev.minus(cost).dividedBy(rev);
    const rounded = margin.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    return {
      formulaId: "gross_margin",
      formulaVersion: "1.0",
      result: rounded.toString(),
      unit: "RATIO",
      displayUnit: "%",
      checks,
    };
  }

  /**
   * YoY Growth Formula: (current - previous) / previous
   */
  computeYoYGrowth(currentFact: Fact, previousFact: Fact): MetricExecutionResult {
    const checks: CalculationCheck[] = [];

    const sameEntity = currentFact.companyId === previousFact.companyId;
    checks.push({
      code: "ENTITY_MATCH",
      passed: sameEntity,
      explanation: sameEntity ? "主体一致" : "主体不一致",
    });

    const sameMetric = currentFact.metric === previousFact.metric;
    checks.push({
      code: "METRIC_MATCH",
      passed: sameMetric,
      explanation: sameMetric ? "指标代码一致" : "指标代码不一致",
    });

    const curr = new Decimal(currentFact.value);
    const prev = new Decimal(previousFact.value);

    if (prev.isZero() || prev.isNegative()) {
      checks.push({
        code: "POSITIVE_BASE",
        passed: false,
        explanation: "上年同期基数为零或负数，无法计算常规同比增速",
      });
      return {
        formulaId: "yoy_growth",
        formulaVersion: "1.0",
        result: null,
        unit: "RATIO",
        displayUnit: "%",
        checks,
      };
    }

    const growth = curr.minus(prev).dividedBy(prev);
    const rounded = growth.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    return {
      formulaId: "yoy_growth",
      formulaVersion: "1.0",
      result: rounded.toString(),
      unit: "RATIO",
      displayUnit: "%",
      checks,
    };
  }

  /**
   * Margin Change in Percentage Points: current_margin - previous_margin
   */
  computeMarginChange(currentMargin: Decimal, previousMargin: Decimal): MetricExecutionResult {
    const diff = currentMargin.minus(previousMargin);
    // Display in percentage points e.g. 0.0234 -> +2.34 pct
    const pctPoints = diff.times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      formulaId: "margin_change",
      formulaVersion: "1.0",
      result: pctPoints.toString(),
      unit: "CUSTOM",
      displayUnit: "pct",
      checks: [
        {
          code: "MARGIN_SUBTRACTION",
          passed: true,
          explanation: "以百分点表示毛利率期间变动",
        },
      ],
    };
  }

  /**
   * Target Gap Formula: actual - target
   */
  computeTargetGap(actualValue: Decimal, targetValue: Decimal): MetricExecutionResult {
    const gap = actualValue.minus(targetValue);

    return {
      formulaId: "target_gap",
      formulaVersion: "1.0",
      result: gap.toString(),
      unit: "CUSTOM",
      displayUnit: "gap",
      checks: [
        {
          code: "TARGET_GAP",
          passed: true,
          explanation: "核验值与目标门槛差额",
        },
      ],
    };
  }
}
