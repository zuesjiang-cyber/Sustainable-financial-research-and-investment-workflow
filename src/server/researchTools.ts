import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type {
  ProjectState,
  ResearchDocument,
  ResearchToolTrace,
} from "../types/fintrust";
import { deriveEvidenceSnippets, MAX_SNIPPET_CHARS, stableSourceEvidenceId } from "./materialIngestion";

export const MAX_QUERY_CHARS = 400;
export const MAX_SEARCH_RESULTS = 20;
export const MAX_READ_CHARS = 12_000;
export const MAX_TOOL_ARGUMENT_CHARS = 20_000;

export interface ResearchToolContext {
  project: ProjectState;
  /** The newly ingested, not-yet-confirmed material for this draft. */
  material: ResearchDocument;
}

export interface SearchProjectDocumentsArgs {
  query: string;
  limit?: number;
  document_ids?: string[];
}

export interface SearchEvidenceResult {
  evidence_id: string;
  document_id: string;
  document_title: string;
  disclosure_date: string;
  source_type: ResearchDocument["source_type"];
  page: number | null;
  line_start?: number;
  line_end?: number;
  text: string;
  score: number;
}

export interface SearchProjectDocumentsResult {
  query: string;
  results: SearchEvidenceResult[];
}

export interface ReadDocumentArgs {
  document_id?: string;
  evidence_id?: string;
  /** Alias accepted for models that call source ids rather than evidence ids. */
  source_id?: string;
  page?: number;
  line_start?: number;
  line_end?: number;
}

export interface ReadDocumentResult {
  document_id: string;
  document_title: string;
  disclosure_date: string;
  source_type: ResearchDocument["source_type"];
  evidence_id?: string;
  page: number | null;
  line_start?: number;
  line_end?: number;
  text: string;
  /** True only when the returned text is an exact source substring. */
  source_verified: boolean;
}

export type FinancialOperation =
  | "yoy"
  | "percentage_change"
  | "difference"
  | "pct_points"
  | "ratio"
  | "margin"
  | "condition";

/**
 * Explicit source-bound numeric operand contract.  An operand is not
 * executable unless its metric, period, unit, value and evidence id are all
 * present and the value occurs in the cited source text.
 */
export interface FinancialOperand {
  metric: string;
  period: string;
  value: string | number;
  unit: string;
  evidence_id: string;
  /** Optional copied excerpt; when supplied it must be contained in evidence. */
  excerpt?: string;
}

export interface FinancialCondition {
  operator: ">=" | ">" | "<=" | "<" | "==" | "between";
  value: string | number;
  value2?: string | number;
  unit: string;
}

export interface CalculateFinancialMetricsArgs {
  operation: FinancialOperation;
  operands?: FinancialOperand[];
  current?: FinancialOperand;
  prior?: FinancialOperand;
  numerator?: FinancialOperand;
  denominator?: FinancialOperand;
  condition?: FinancialCondition;
  label?: string;
}

export interface FinancialCalculationResult {
  calculation_id: string;
  operation: FinancialOperation;
  metric: string;
  period?: string;
  value?: string;
  unit?: string;
  passed?: boolean;
  formula: string;
  operands: FinancialOperand[];
  evidence_ids: string[];
  explanation: string;
  status: "ok" | "error";
  error?: string;
}

export type ResearchToolName =
  | "search_project_documents"
  | "read_document"
  | "calculate_financial_metrics";

export interface ProjectEvidenceRecord extends SearchEvidenceResult {
  content: string;
}

function assertContext(context: ResearchToolContext): void {
  if (!context || !context.project || !context.material) {
    throw new Error("Research tools require a project and newly ingested material");
  }
  if (context.material.project_id !== context.project.id) {
    throw new Error("Material does not belong to the requested project");
  }
}

function documentList(context: ResearchToolContext): ResearchDocument[] {
  assertContext(context);
  const docs = [...(context.project.documents || []), context.material];
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (!doc || doc.project_id !== context.project.id || !doc.id || seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
}

function lineLocation(content: string, start: number, end: number): { line_start: number; line_end: number } {
  const beforeStart = content.slice(0, Math.max(0, start));
  const sourceSlice = content.slice(Math.max(0, start), Math.max(start, end));
  return {
    line_start: beforeStart.split("\n").length,
    line_end: beforeStart.split("\n").length + (sourceSlice.match(/\n/g) || []).length,
  };
}

const derivationOrdinalByDocument = new Map<string, number>();

function snippetsForDocument(document: ResearchDocument): ResearchDocument["evidence_snippets"] {
  if (Array.isArray(document.evidence_snippets) && document.evidence_snippets.length > 0) {
    const exactSnippets = document.evidence_snippets.filter(
      (snippet) =>
        Boolean(
          snippet &&
            snippet.id &&
            typeof snippet.text === "string" &&
            snippet.text.length > 0 &&
            // A stored citation is usable only when its text is an exact
            // substring of the stored source.  This rejects legacy/demo
            // paraphrases instead of treating them as official facts.
            typeof document.content === "string" &&
            document.content.includes(snippet.text)
        )
    );
    if (exactSnippets.length > 0) return exactSnippets;
  }

  // Legacy notes may predate server ingestion.  We can derive temporary,
  // deterministic source slices for retrieval without mutating the project or
  // pretending they have a page number.  They remain project-scoped because
  // the id is generated from this document id.
  return deriveEvidenceSnippets(document.id, document.content || "", () => {
    const current = derivationOrdinalByDocument.get(document.id) || 0;
    derivationOrdinalByDocument.set(document.id, current + 1);
    return stableSourceEvidenceId(document.id, current + 1, current);
  });
}

export function collectProjectEvidence(context: ResearchToolContext): Map<string, ProjectEvidenceRecord> {
  const records = new Map<string, ProjectEvidenceRecord>();
  derivationOrdinalByDocument.clear();

  for (const document of documentList(context)) {
    const snippets = snippetsForDocument(document);
    snippets.forEach((snippet, ordinal) => {
      const text = String(snippet.text || "");
      if (!snippet.id || !text) return;
      const duplicate = records.get(snippet.id);
      if (duplicate && duplicate.document_id !== document.id) {
        // An id collision is never allowed to choose one of two sources.
        records.delete(snippet.id);
        return;
      }
      const exactStart = document.content ? document.content.indexOf(text) : -1;
      const location =
        snippet.line_start && snippet.line_end
          ? { line_start: snippet.line_start, line_end: snippet.line_end }
          : exactStart >= 0
          ? lineLocation(document.content, exactStart, exactStart + text.length)
          : undefined;
      records.set(snippet.id, {
        evidence_id: snippet.id,
        document_id: document.id,
        document_title: document.title,
        disclosure_date: document.disclosure_date,
        source_type: document.source_type,
        page: typeof snippet.page === "number" && Number.isFinite(snippet.page) ? snippet.page : null,
        ...(location || {}),
        text: text.slice(0, MAX_SNIPPET_CHARS),
        score: 0,
        content: document.content || "",
      });
    });
  }
  return records;
}

/** Read-only evidence view used by claim validation and release gates. */
export function listProjectEvidence(context: ResearchToolContext): ProjectEvidenceRecord[] {
  return Array.from(collectProjectEvidence(context).values());
}

function queryTokens(value: string): string[] {
  const tokens = new Set<string>();
  const matches = value.match(/[\p{Script=Han}]{2,}|[A-Za-z][A-Za-z0-9_.-]*|[-+]?\d+(?:\.\d+)?/gu) || [];
  for (const match of matches) {
    tokens.add(match.toLowerCase());
    if (/^[\p{Script=Han}]+$/u.test(match) && match.length > 2) {
      for (let i = 0; i < match.length - 1; i += 1) tokens.add(match.slice(i, i + 2));
    }
  }
  // A short Chinese or punctuation-heavy query still needs a retrieval key.
  if (tokens.size === 0 && value.trim()) {
    for (const char of value.trim()) if (char.trim()) tokens.add(char.toLowerCase());
  }
  return Array.from(tokens);
}

function safeLimit(limit?: number): number {
  const parsed = limit === undefined ? 8 : Number(limit);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error("Search limit must be a positive number");
  return Math.min(Math.floor(parsed), MAX_SEARCH_RESULTS);
}

export function searchProjectDocuments(
  context: ResearchToolContext,
  args: SearchProjectDocumentsArgs | string
): SearchProjectDocumentsResult {
  const query = typeof args === "string" ? args : String(args?.query || "");
  if (!query.trim()) throw new Error("Search query cannot be empty");
  if (query.length > MAX_QUERY_CHARS) throw new Error(`Search query exceeds ${MAX_QUERY_CHARS} characters`);

  const limit = safeLimit(typeof args === "string" ? undefined : args.limit);
  const requestedDocuments = new Set(
    typeof args === "string" || !Array.isArray(args.document_ids) ? [] : args.document_ids.map(String)
  );
  const tokens = queryTokens(query);
  const phrase = query.trim().toLowerCase();
  const records = collectProjectEvidence(context);
  const ranked: ProjectEvidenceRecord[] = [];

  for (const record of records.values()) {
    if (requestedDocuments.size > 0 && !requestedDocuments.has(record.document_id)) continue;
    const haystack = `${record.document_title}\n${record.text}`.toLowerCase();
    let score = 0;
    if (haystack.includes(phrase)) score += 5;
    for (const token of tokens) {
      if (record.text.toLowerCase().includes(token)) score += token.length > 1 ? 2 : 1;
      if (record.document_title.toLowerCase().includes(token)) score += 1;
    }
    if (score <= 0) continue;
    ranked.push({ ...record, score });
  }

  ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.disclosure_date !== right.disclosure_date) {
      return right.disclosure_date.localeCompare(left.disclosure_date);
    }
    return left.evidence_id.localeCompare(right.evidence_id);
  });

  return {
    query: query.trim(),
    results: ranked.slice(0, limit).map((record) => {
      const { content: _content, ...result } = record;
      return result;
    }),
  };
}

function findDocument(context: ResearchToolContext, documentId: string): ResearchDocument {
  const document = documentList(context).find((item) => item.id === documentId);
  if (!document) throw new Error("Document is not available in this project");
  return document;
}

export function readDocument(context: ResearchToolContext, args: ReadDocumentArgs): ReadDocumentResult {
  if (!args || typeof args !== "object") throw new Error("read_document arguments must be an object");
  const sourceId = String(args.evidence_id || args.source_id || "").trim();
  const records = collectProjectEvidence(context);

  if (sourceId) {
    const record = records.get(sourceId);
    if (!record) throw new Error("Evidence id is not available in this project");
    const text = record.text.slice(0, MAX_READ_CHARS);
    return {
      document_id: record.document_id,
      document_title: record.document_title,
      disclosure_date: record.disclosure_date,
      source_type: record.source_type,
      evidence_id: record.evidence_id,
      page: record.page,
      line_start: record.line_start,
      line_end: record.line_end,
      text,
      source_verified: record.content.includes(record.text),
    };
  }

  const documentId = String(args.document_id || "").trim();
  if (!documentId) throw new Error("read_document requires document_id or evidence_id");
  const document = findDocument(context, documentId);
  const allLines = (document.content || "").split("\n");
  const start = args.line_start === undefined ? 1 : Number(args.line_start);
  const end = args.line_end === undefined ? Math.min(allLines.length, start + 80) : Number(args.line_end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new Error("line_start/line_end must be valid one-based line numbers");
  }
  if (start > allLines.length) throw new Error("Requested line_start is outside the document");

  const boundedEnd = Math.min(end, allLines.length);
  const text = allLines.slice(start - 1, boundedEnd).join("\n").slice(0, MAX_READ_CHARS);
  const matching = Array.from(records.values()).find(
    (record) =>
      record.document_id === document.id &&
      (record.line_start || 0) <= boundedEnd &&
      (record.line_end || 0) >= start
  );
  return {
    document_id: document.id,
    document_title: document.title,
    disclosure_date: document.disclosure_date,
    source_type: document.source_type,
    evidence_id: matching?.evidence_id,
    page: matching?.page ?? null,
    line_start: start,
    line_end: boundedEnd,
    text,
    source_verified: document.content.includes(text),
  };
}

function parseNumber(value: string | number, name: string): Decimal {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(`${name} must be a plain numeric value`);
  }
  try {
    return new Decimal(normalized);
  } catch {
    throw new Error(`${name} is not a valid decimal`);
  }
}

interface UnitInfo {
  dimension: "money" | "percent" | "percentage_point" | "ratio" | "count" | "unknown";
  factor: Decimal;
  canonical: string;
}

function unitInfo(unit: string): UnitInfo {
  const raw = String(unit || "").trim().toLowerCase().replace(/[\s_]/g, "");
  if (["%", "pct", "percent", "百分比", "百分率"].includes(raw)) {
    return { dimension: "percent", factor: new Decimal(1), canonical: "%" };
  }
  if (["pctpoint", "pctpoints", "pp", "百分点", "个百分点"].includes(raw)) {
    return { dimension: "percentage_point", factor: new Decimal(1), canonical: "pct_points" };
  }
  if (["x", "倍", "ratio"].includes(raw)) {
    return { dimension: "ratio", factor: new Decimal(1), canonical: "x" };
  }
  if (["元", "cny", "rmb", "人民币", "yuan"].includes(raw)) {
    return { dimension: "money", factor: new Decimal(1), canonical: "元" };
  }
  if (["万元", "10kcny", "thousandcny"].includes(raw)) {
    return { dimension: "money", factor: new Decimal(10_000), canonical: "元" };
  }
  if (["亿元", "100mcny", "yicny", "亿"].includes(raw)) {
    return { dimension: "money", factor: new Decimal(100_000_000), canonical: "元" };
  }
  if (["count", "数量", "件", "款", "家", "人"].includes(raw)) {
    return { dimension: "count", factor: new Decimal(1), canonical: unit };
  }
  return { dimension: "unknown", factor: new Decimal(1), canonical: unit };
}

function valueAppearsInText(value: string | number, text: string): boolean {
  const wanted = parseNumber(value, "operand value");
  const candidates = text.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) || [];
  return candidates.some((candidate) => {
    try {
      return new Decimal(candidate.replace(/,/g, "")).eq(wanted);
    } catch {
      return false;
    }
  });
}

function canonicalMetric(metric: string): string {
  const value = String(metric || "").trim().toLowerCase().replace(/[\s_\-]/g, "");
  const aliases: Record<string, string[]> = {
    revenue: ["revenue", "营业收入", "营收", "销售收入", "收入"],
    cost: ["cost", "营业成本", "主营业务成本", "成本"],
    netprofit: ["netprofit", "净利润", "归母净利润", "归属于母公司股东的净利润"],
    operatingcashflow: ["operatingcashflow", "经营活动现金流", "经营活动产生的现金流量净额", "现金流量净额"],
    rdexpense: ["rdexpense", "研发费用", "研发支出"],
    grossmargin: ["grossmargin", "综合毛利率", "毛利率"],
  };
  for (const [key, values] of Object.entries(aliases)) {
    if (values.some((alias) => alias.toLowerCase().replace(/[\s_\-]/g, "") === value)) return key;
  }
  return value;
}

function metricAppearsInText(metric: string, text: string): boolean {
  const canonical = canonicalMetric(metric);
  const aliases: Record<string, string[]> = {
    revenue: ["revenue", "营业收入", "营收", "销售收入", "收入"],
    cost: ["cost", "营业成本", "主营业务成本", "成本"],
    netprofit: ["net profit", "netprofit", "净利润", "归母净利润", "归属于母公司股东的净利润"],
    operatingcashflow: ["operating cash flow", "operatingcashflow", "经营活动现金流", "经营活动产生的现金流量净额", "现金流量净额"],
    rdexpense: ["r&d", "rd expense", "rdexpense", "研发费用", "研发支出"],
    grossmargin: ["gross margin", "grossmargin", "综合毛利率", "毛利率"],
  };
  const candidates = aliases[canonical] || [metric];
  const lower = text.toLowerCase();
  return candidates.some((candidate) => lower.includes(candidate.toLowerCase()));
}

function periodAppearsInText(period: string, text: string): boolean {
  const raw = String(period || "").trim();
  const compact = raw.toLowerCase().replace(/^fy/, "");
  if (!compact) return false;
  const lower = text.toLowerCase();
  const compactText = lower.replace(/\s+/g, "");
  return lower.includes(raw.toLowerCase()) ||
    compactText.includes(compact.replace(/\s+/g, "")) ||
    lower.includes(compact + "年") ||
    lower.includes("fy" + compact);
}

function unitRegex(unit: string): RegExp {
  const raw = String(unit || "").trim().toLowerCase().replace(/[\s_]/g, "");
  if (raw === "万元" || raw === "10kcny" || raw === "thousandcny") return /万元|thousand\s*cny|10k\s*cny/i;
  if (raw === "亿元" || raw === "100mcny" || raw === "yicny" || raw === "亿") return /亿元|100m\s*cny|yi\s*cny/i;
  if (raw === "元" || raw === "cny" || raw === "rmb" || raw === "人民币" || raw === "yuan") return /(?<!万|亿)元|\b(?:cny|rmb|yuan)\b/i;
  if (raw === "%" || raw === "pct" || raw === "percent" || raw === "百分比" || raw === "百分率") return /%|百分比|百分率|percent/i;
  if (["pp", "pctpoint", "pctpoints", "百分点", "个百分点"].includes(raw)) return /pp|百分点|percentage\s*point/i;
  if (["x", "倍", "ratio"].includes(raw)) return /倍|\bx\b|ratio/i;
  return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function unitAppearsNearValue(value: string | number, unit: string, text: string): boolean {
  const wanted = parseNumber(value, "operand value");
  const matches = text.matchAll(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g);
  const expected = unitRegex(unit);
  for (const match of matches) {
    try {
      if (!new Decimal(match[0].replace(/,/g, "")).eq(wanted)) continue;
    } catch {
      continue;
    }
    const start = Math.max(0, (match.index || 0) - 4);
    const end = Math.min(text.length, (match.index || 0) + match[0].length + 12);
    if (expected.test(text.slice(start, end))) return true;
  }
  return false;
}

function validateOperand(
  context: ResearchToolContext,
  operand: FinancialOperand,
  index: number,
  records: Map<string, ProjectEvidenceRecord>
): void {
  if (!operand || typeof operand !== "object") throw new Error(`operand ${index} must be an object`);
  if (!String(operand.metric || "").trim()) throw new Error(`operand ${index} is missing metric`);
  if (!String(operand.period || "").trim()) throw new Error(`operand ${index} is missing period`);
  if (!String(operand.unit || "").trim()) throw new Error(`operand ${index} is missing unit`);
  parseNumber(operand.value, `operand ${index} value`);
  const evidenceId = String(operand.evidence_id || "").trim();
  const evidence = records.get(evidenceId);
  if (!evidence) throw new Error(`operand ${index} cites unavailable evidence ${evidenceId || "(empty)"}`);
  if (operand.excerpt !== undefined && !evidence.text.includes(String(operand.excerpt))) {
    throw new Error(`operand ${index} excerpt is not contained in its evidence`);
  }
  if (!valueAppearsInText(operand.value, evidence.text)) {
    throw new Error(`operand ${index} value is not present in cited evidence`);
  }
  if (!periodAppearsInText(operand.period, evidence.text)) {
    throw new Error(`operand ${index} period ${operand.period} is not present in cited evidence`);
  }
  if (!metricAppearsInText(operand.metric, evidence.text)) {
    throw new Error(`operand ${index} metric ${operand.metric} is not present in cited evidence`);
  }
  if (!unitAppearsNearValue(operand.value, operand.unit, evidence.text)) {
    throw new Error(`operand ${index} unit ${operand.unit} is not bound to its cited value`);
  }
  // Explicitly call unitInfo here so unsupported units are rejected before
  // arithmetic can accidentally compare unlike quantities.
  if (unitInfo(operand.unit).dimension === "unknown") {
    throw new Error(`operand ${index} has an unsupported unit ${operand.unit}`);
  }
  void context;
}

function displayDecimal(value: Decimal, digits = 2): string {
  return value.toDecimalPlaces(digits).toFixed(digits);
}

function sameDimension(left: UnitInfo, right: UnitInfo): boolean {
  return left.dimension === right.dimension && left.dimension !== "unknown";
}

function operationOperands(args: CalculateFinancialMetricsArgs): FinancialOperand[] {
  if (Array.isArray(args.operands) && args.operands.length > 0) return args.operands;
  if (args.operation === "ratio" || args.operation === "margin") {
    return [args.numerator, args.denominator].filter(Boolean) as FinancialOperand[];
  }
  return [args.current, args.prior].filter(Boolean) as FinancialOperand[];
}

function financialError(
  operation: FinancialOperation,
  operands: FinancialOperand[],
  error: unknown
): FinancialCalculationResult {
  return {
    calculation_id: `CALC_${randomUUID()}`,
    operation,
    metric: operands[0]?.metric || "unknown",
    formula: "未执行：输入或来源校验失败",
    operands,
    evidence_ids: operands.map((operand) => String(operand?.evidence_id || "")).filter(Boolean),
    explanation: String(error instanceof Error ? error.message : error),
    status: "error",
    error: String(error instanceof Error ? error.message : error),
  };
}

/**
 * Deterministic financial tool.  There is no eval, Python execution, or
 * model-generated formula execution in this function.
 */
export function calculateFinancialMetrics(
  context: ResearchToolContext,
  args: CalculateFinancialMetricsArgs
): FinancialCalculationResult {
  const operation = args?.operation as FinancialOperation;
  const operands = operationOperands(args || ({} as CalculateFinancialMetricsArgs));
  const records = collectProjectEvidence(context);
  try {
    if (!operation || !["yoy", "percentage_change", "difference", "pct_points", "ratio", "margin", "condition"].includes(operation)) {
      throw new Error("operation must be one of yoy, percentage_change, difference, pct_points, ratio, margin, condition");
    }
    if (operands.length < 1 || operands.length > 2) throw new Error("calculation requires one or two explicit operands");
    operands.forEach((operand, index) => validateOperand(context, operand, index, records));

    const first = operands[0];
    const firstUnit = unitInfo(first.unit);
    const firstValue = parseNumber(first.value, "operand value").times(firstUnit.factor);
    const evidenceIds = operands.map((operand) => operand.evidence_id);
    const metric = String(args.label || first.metric);
    const calcId = `CALC_${randomUUID()}`;

    if (operation === "condition") {
      const condition = args.condition;
      if (!condition) throw new Error("condition operation requires condition parameters");
      const thresholdUnit = unitInfo(condition.unit);
      if (!sameDimension(firstUnit, thresholdUnit)) throw new Error("condition unit does not match operand unit");
      const threshold = parseNumber(condition.value, "condition value").times(thresholdUnit.factor);
      const secondThreshold = condition.value2 === undefined ? undefined : parseNumber(condition.value2, "condition value2").times(thresholdUnit.factor);
      let passed = false;
      switch (condition.operator) {
        case ">=": passed = firstValue.gte(threshold); break;
        case ">": passed = firstValue.gt(threshold); break;
        case "<=": passed = firstValue.lte(threshold); break;
        case "<": passed = firstValue.lt(threshold); break;
        case "==": passed = firstValue.eq(threshold); break;
        case "between":
          if (secondThreshold === undefined) throw new Error("between requires condition.value2");
          passed = firstValue.gte(Decimal.min(threshold, secondThreshold)) && firstValue.lte(Decimal.max(threshold, secondThreshold));
          break;
        default: throw new Error("unsupported condition operator");
      }
      const thresholdText = secondThreshold === undefined ? `${condition.operator} ${condition.value}${condition.unit}` : `${condition.operator} ${condition.value}${condition.unit}–${condition.value2}${condition.unit}`;
      return {
        calculation_id: calcId,
        operation,
        metric,
        period: first.period,
        value: displayDecimal(firstValue),
        unit: firstUnit.canonical,
        passed,
        formula: `${first.metric}[${first.period}] ${condition.operator} ${condition.value}${condition.unit}`,
        operands,
        evidence_ids: evidenceIds,
        explanation: `实际值 ${displayDecimal(firstValue)}${firstUnit.canonical} ${passed ? "满足" : "未满足"}条件（${thresholdText}）。`,
        status: "ok",
      };
    }

    if (operands.length !== 2) throw new Error(`${operation} requires two operands`);
    const second = operands[1];
    const secondUnit = unitInfo(second.unit);
    const secondValue = parseNumber(second.value, "operand value").times(secondUnit.factor);

    if (operation === "yoy" || operation === "percentage_change") {
      if (canonicalMetric(first.metric) !== canonicalMetric(second.metric)) {
        throw new Error("percentage change requires the same metric in both periods");
      }
      if (!sameDimension(firstUnit, secondUnit)) throw new Error("percentage change requires matching units");
      if (first.period === second.period) throw new Error("percentage change requires distinct periods");
      if (secondValue.isZero()) throw new Error("percentage change has a zero denominator and is incalculable");
      const result = firstValue.minus(secondValue).dividedBy(secondValue.abs()).times(100);
      return {
        calculation_id: calcId,
        operation,
        metric,
        period: first.period,
        value: displayDecimal(result),
        unit: "%",
        formula: `(${first.metric}[${first.period}] - ${second.metric}[${second.period}]) / |${second.metric}[${second.period}]| × 100`,
        operands,
        evidence_ids: evidenceIds,
        explanation: `按基期绝对值计算：${displayDecimal(result)}%。${secondValue.isNegative() ? "基期为负数，已使用绝对值作为分母。" : ""}`,
        status: "ok",
      };
    }

    if (operation === "difference" || operation === "pct_points") {
      if (canonicalMetric(first.metric) !== canonicalMetric(second.metric)) {
        throw new Error("difference requires the same metric in both operands");
      }
      if (operation === "pct_points" && firstUnit.dimension !== "percent" && firstUnit.dimension !== "percentage_point") {
        throw new Error("pct_points requires percentage operands; do not use it for a relative percentage change");
      }
      if (!sameDimension(firstUnit, secondUnit)) throw new Error("difference requires matching units");
      const result = firstValue.minus(secondValue);
      return {
        calculation_id: calcId,
        operation,
        metric,
        period: first.period,
        value: displayDecimal(result),
        unit: operation === "pct_points" ? "pct_points" : firstUnit.canonical,
        formula: `${first.metric}[${first.period}] - ${second.metric}[${second.period}]`,
        operands,
        evidence_ids: evidenceIds,
        explanation: `差值为 ${displayDecimal(result)}${operation === "pct_points" ? " 个百分点" : firstUnit.canonical}。`,
        status: "ok",
      };
    }

    if (operation === "ratio" || operation === "margin") {
      if (first.period !== second.period) throw new Error(`${operation} requires operands from the same period`);
      if (!sameDimension(firstUnit, secondUnit)) throw new Error(`${operation} requires operands with the same dimension`);
      if (operation === "margin" && firstUnit.dimension !== "money") {
        throw new Error("margin requires source monetary operands; use pct_points for two percentage values");
      }
      if (secondValue.isZero()) throw new Error(`${operation} has a zero denominator and is incalculable`);
      const result = firstValue.dividedBy(secondValue);
      const asPercent = operation === "margin";
      const displayed = asPercent ? result.times(100) : result;
      return {
        calculation_id: calcId,
        operation,
        metric,
        period: first.period,
        value: displayDecimal(displayed),
        unit: asPercent ? "%" : "x",
        formula: `${first.metric}[${first.period}] / ${second.metric}[${second.period}]${asPercent ? " × 100" : ""}`,
        operands,
        evidence_ids: evidenceIds,
        explanation: `${asPercent ? "比例" : "比率"}为 ${displayDecimal(displayed)}${asPercent ? "%" : "倍"}。`,
        status: "ok",
      };
    }

    throw new Error(`Unsupported operation ${operation}`);
  } catch (error) {
    return financialError(operation || "difference", operands, error);
  }
}

export interface ResearchToolDefinition {
  name: ResearchToolName;
  description: string;
  parameters: Record<string, unknown>;
}

export const RESEARCH_TOOL_DEFINITIONS: ResearchToolDefinition[] = [
  {
    name: "search_project_documents",
    description: "Search project-local historical and newly ingested evidence snippets by a research question.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: MAX_QUERY_CHARS },
        limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_RESULTS },
        document_ids: { type: "array", items: { type: "string" }, maxItems: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_document",
    description: "Read exact project-local source text by evidence id or document line range.",
    parameters: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        evidence_id: { type: "string" },
        source_id: { type: "string" },
        page: { type: "integer", minimum: 1 },
        line_start: { type: "integer", minimum: 1 },
        line_end: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "calculate_financial_metrics",
    description: "Calculate a financial metric from explicitly sourced metric, period, value, unit and evidence operands.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["yoy", "percentage_change", "difference", "pct_points", "ratio", "margin", "condition"] },
        operands: { type: "array", maxItems: 2, items: { type: "object" } },
        current: { type: "object" },
        prior: { type: "object" },
        numerator: { type: "object" },
        denominator: { type: "object" },
        condition: { type: "object" },
        label: { type: "string", maxLength: 200 },
      },
      required: ["operation"],
      additionalProperties: false,
    },
  },
];

function boundedArguments(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object");
  const encoded = JSON.stringify(args);
  if (encoded.length > MAX_TOOL_ARGUMENT_CHARS) throw new Error(`Tool arguments exceed ${MAX_TOOL_ARGUMENT_CHARS} characters`);
  return args as Record<string, unknown>;
}

export async function executeResearchTool(
  tool: ResearchToolName | string,
  args: unknown,
  context: ResearchToolContext
): Promise<unknown> {
  const bounded = boundedArguments(args);
  switch (tool) {
    case "search_project_documents":
      return searchProjectDocuments(context, bounded as unknown as SearchProjectDocumentsArgs);
    case "read_document":
      return readDocument(context, bounded as unknown as ReadDocumentArgs);
    case "calculate_financial_metrics":
      return calculateFinancialMetrics(context, bounded as unknown as CalculateFinancialMetricsArgs);
    default:
      throw new Error(`Unknown research tool ${tool}`);
  }
}

export function createResearchToolset(context: ResearchToolContext): Record<ResearchToolName, (args: unknown) => Promise<unknown>> {
  return {
    search_project_documents: async (args) => searchProjectDocuments(context, args as SearchProjectDocumentsArgs),
    read_document: async (args) => readDocument(context, args as ReadDocumentArgs),
    calculate_financial_metrics: async (args) => calculateFinancialMetrics(context, args as CalculateFinancialMetricsArgs),
  };
}

export function isFinancialCalculationResult(value: unknown): value is FinancialCalculationResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as FinancialCalculationResult).calculation_id === "string" &&
      typeof (value as FinancialCalculationResult).operation === "string" &&
      ((value as FinancialCalculationResult).status === "ok" || (value as FinancialCalculationResult).status === "error")
  );
}

// Kept as a type-level import anchor for consumers that need to associate a
// tool trace with the shared result shape without re-declaring it.
export type { ResearchToolTrace };
