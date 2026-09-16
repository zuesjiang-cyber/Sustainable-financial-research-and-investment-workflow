import {
  createConfiguredResearchModelTransport,
  OpenAICompatibleTransport,
  type ResearchModelTransport,
} from "../researchModel";

export type ModelRole = "fast" | "research" | "review";

export const CANDIDATE_MODELS = {
  fast: ["openai/gpt-5.6-luna", "openai/gpt-4.1-mini", "inclusionai/ling-3.0-flash-fin:free"],
  research: ["openai/gpt-5.6-sol", "deepseek/deepseek-v4-pro-0813", "inclusionai/ling-3.0-flash-fin:free"],
  review: ["openai/gpt-6-astra", "openai/gpt-5.6-sol", "inclusionai/ling-3.0-flash-fin:free"],
} as const;

export interface RoleTransports {
  fast: ResearchModelTransport | null;
  research: ResearchModelTransport | null;
  review: ResearchModelTransport | null;
}

function envModel(role: ModelRole): string | undefined {
  const map: Record<ModelRole, string[]> = {
    fast: ["FINTRUST_MODEL_FAST", "FINTRUST_LLM_MODEL"],
    research: ["FINTRUST_MODEL_RESEARCH", "FINTRUST_LLM_MODEL"],
    review: ["FINTRUST_MODEL_REVIEW", "FINTRUST_LLM_MODEL"],
  };
  for (const name of map[role]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function createRoleTransports(options: {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  override?: ResearchModelTransport | null;
}): RoleTransports {
  if (options.override !== undefined) {
    return { fast: options.override, research: options.override, review: options.override };
  }
  const env = options.env || process.env;
  const key = env.FINTRUST_LLM_API_KEY?.trim();
  const base = env.FINTRUST_LLM_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
  if (!key) {
    const fallback = createConfiguredResearchModelTransport(env, { fetch: options.fetch });
    return { fast: fallback, research: fallback, review: fallback };
  }
  const make = (role: ModelRole) => {
    const model = envModel(role) || CANDIDATE_MODELS[role][CANDIDATE_MODELS[role].length - 1];
    return new OpenAICompatibleTransport(model, base, key, options.fetch);
  };
  return { fast: make("fast"), research: make("research"), review: make("review") };
}

export async function probeOpenRouterModels(fetchImpl: typeof fetch = fetch): Promise<{
  available: string[];
  notes: string[];
}> {
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/models", {
      headers: process.env.FINTRUST_LLM_API_KEY ? { Authorization: `Bearer ${process.env.FINTRUST_LLM_API_KEY}` } : {},
    });
    if (!response.ok) return { available: [], notes: [`模型目录请求失败 (${response.status})，未完成真实连通`] };
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const available = (data.data || []).map((item) => String(item.id || "")).filter(Boolean);
    return { available, notes: available.length ? [] : ["模型目录为空"] };
  } catch (error) {
    return { available: [], notes: [`无法访问 OpenRouter 模型目录：${error instanceof Error ? error.message : String(error)}`] };
  }
}
