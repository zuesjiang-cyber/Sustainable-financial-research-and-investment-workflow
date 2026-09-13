import type {
  ResearchModelRequest,
  ResearchModelResponse,
  ResearchModelTransport,
} from "../../src/server/researchModel";
import { DEFAULT_OPENAI_MODEL } from "../../src/server/researchModel";

/**
 * A deterministic stand-in for the Ling-3.0-flash-Fin tool-calling transport.
 *
 * WHAT THIS PROVES
 *   The application's own logic: HTTP wiring, upload → parse → extract →
 *   confirm → filing-verify → confirm, stable thesis IDs across rounds,
 *   Markdown Memory persistence, versioning and history.
 *
 * WHAT THIS DOES NOT PROVE
 *   Anything about real model quality. Thesis recall, numeric-fact accuracy and
 *   assessment acceptability can only be measured against the real Ling route
 *   with a configured FINTRUST_LLM_API_KEY (see
 *   docs/product-architecture-v1/12_验收与评测.md). A green run here must never
 *   be reported as a passed real-model acceptance.
 *
 * The transport reports `provider: "openai_compatible"` and the exact expected
 * model id so it satisfies `requireLing()`'s fail-closed check.
 */

/** One extracted thesis, mirroring the fixture PDF's single text line. */
export interface MockThesis {
  text: string;
  originalText: string;
  type: string;
  criterion: Record<string, unknown>;
  spanIndices: number[];
  priority?: number;
}

/** One per-thesis filing review returned by `submit_filing_review`. */
export interface MockFilingReviewItem {
  thesisId: string;
  status?: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "WEAKENED" | "UNRESOLVED";
  maturity?: "NOT_DUE" | "IN_PROGRESS" | "DUE";
  interimSignal?: "ABOVE" | "ON_TRACK" | "BELOW" | "UNKNOWN";
  summary?: string;
  evidenceIndices?: number[];
  facts?: Array<{
    metric: string;
    labelOriginal?: string;
    value: string | null;
    previousValue?: string | null;
    originalUnit?: string;
    evidenceIndices: number[];
  }>;
  observedGap?: { text: string; evidenceIndices: number[] } | null;
  disclosedCauses?: Array<{ text: string; attribution?: string; evidenceIndices: number[] }>;
  hypotheses?: Array<{ text: string; supportingEvidenceIndices: number[]; missingEvidence: string[] }>;
  nextQuestions?: Array<{ text: string; requiredEvidence?: string }>;
}

export interface MockLingOptions {
  company?: { name: string; securityCode: string; exchange?: string };
  reportDate?: string;
  theses?: MockThesis[];
  /**
   * Filing reviews keyed by nothing — returned in order for each
   * `submit_filing_review` call. When omitted, the mock returns no facts and no
   * evidence, which correctly drives every thesis to UNRESOLVED (the fixture
   * PDF contains no financial figures, so inventing any would be a lie).
   */
  filingReviews?: MockFilingReviewItem[][];
  /** Record every request for assertions on prompt/economy behaviour. */
  calls?: Array<{ tool: string; request: ResearchModelRequest }>;
}

const DEFAULT_THESES: MockThesis[] = [
  {
    text: "2025 年综合毛利率达到 30% 以上",
    originalText: "Shengbang Co., Ltd. 300661 Research Report: Target Gross Margin 30%",
    type: "NUMERIC_FORECAST",
    criterion: {
      kind: "COMPARE",
      metric: "gross_margin",
      op: "GTE",
      target: "30",
      unit: "RATIO",
      period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
      scope: "CONSOLIDATED",
    },
    spanIndices: [0],
    priority: 1,
  },
];

function toolCallResponse(name: string, args: unknown): ResearchModelResponse {
  return {
    message: {
      role: "assistant",
      content: "",
      tool_calls: [{ id: `mock-call-${name}`, name, arguments: args as Record<string, unknown> }],
    },
    model: DEFAULT_OPENAI_MODEL,
    reported_model: DEFAULT_OPENAI_MODEL,
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

export function createMockLingTransport(options: MockLingOptions = {}): ResearchModelTransport {
  const calls = options.calls;
  let filingCallIndex = 0;

  return {
    provider: "openai_compatible",
    model: DEFAULT_OPENAI_MODEL,
    async complete(request: ResearchModelRequest): Promise<ResearchModelResponse> {
      const requested =
        typeof request.tool_choice === "object" && request.tool_choice !== null
          ? request.tool_choice.function.name
          : request.tools[0]?.name || "";
      calls?.push({ tool: requested, request });

      if (requested === "submit_extracted_theses") {
        return toolCallResponse("submit_extracted_theses", {
          company: options.company || { name: "圣邦股份", securityCode: "300661", exchange: "SZSE" },
          reportDate: options.reportDate || "2025-06-15",
          theses: options.theses || DEFAULT_THESES,
        });
      }

      if (requested === "submit_filing_review") {
        const reviews = options.filingReviews;
        const items = reviews ? reviews[Math.min(filingCallIndex, reviews.length - 1)] : [];
        filingCallIndex += 1;
        return toolCallResponse("submit_filing_review", { items });
      }

      throw new Error(`mock Ling transport received an unexpected tool: ${requested || "(none)"}`);
    },
  };
}
