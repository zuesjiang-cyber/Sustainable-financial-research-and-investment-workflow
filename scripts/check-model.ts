import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import {
  DEFAULT_MODEL_REQUEST_TIMEOUT_MS,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  MAX_MODEL_REQUEST_TIMEOUT_MS,
  completeWithResearchModelTimeout,
  createConfiguredResearchModelTransport,
  getModelConfiguration,
  redactSensitiveText,
  safeServiceAddress,
  type ResearchModelResponse,
  type ResearchModelToolDefinition,
  type ResearchModelToolCall,
  type ResearchModelUsage,
} from "../src/server/researchModel";

export const SYNTHETIC_TOOL_NAME = "model_check_echo";
export const MODEL_CHECK_MAX_TOKENS = 512;

const SYNTHETIC_TOOL: ResearchModelToolDefinition = {
  name: SYNTHETIC_TOOL_NAME,
  description: "Connectivity check only. Echo the supplied value; do not access business data.",
  parameters: {
    type: "object",
    properties: { value: { type: "string", maxLength: 80 } },
    required: ["value"],
    additionalProperties: false,
  },
};

export interface ModelCheckOptions {
  tools?: boolean;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

export interface ModelCheckResult {
  passed: boolean;
  mode: "text" | "tools";
  service: string;
  model: string;
  response_model?: string;
  elapsed_ms: number;
  usage?: ResearchModelUsage;
  response_text?: string;
  intermediate_response_text?: string;
  tool_result?: Record<string, unknown>;
  reason?: string;
}

function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function safeModelName(value?: string): string {
  const model = redactSensitiveText(value || DEFAULT_OPENAI_MODEL).replace(/\s+/g, " ").trim();
  return model.slice(0, 200) || "[unset]";
}

function safeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/abort/i.test(message)) return "Model request was aborted or timed out";
  const safe = redactSensitiveText(message).replace(/\s+/g, " ").trim();
  return safe.slice(0, 300) || "Model request failed";
}

function timeoutValue(value?: number): number {
  const requested = value === undefined ? DEFAULT_MODEL_REQUEST_TIMEOUT_MS : Number(value);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  return Math.min(Math.floor(requested), MAX_MODEL_REQUEST_TIMEOUT_MS);
}

function addUsage(target: ResearchModelUsage, usage?: ResearchModelUsage): void {
  if (!usage) return;
  const fields: Array<keyof ResearchModelUsage> = ["input_tokens", "output_tokens", "total_tokens"];
  for (const field of fields) {
    const value = usage[field];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    target[field] = (target[field] || 0) + value;
  }
}

function responseText(response: ResearchModelResponse): string {
  const text = response.message && typeof response.message.content === "string"
    ? response.message.content.trim()
    : "";
  if (!text) throw new Error("Model response did not contain text");
  return text;
}

function responseToolCalls(response: ResearchModelResponse): ResearchModelToolCall[] {
  return response.message && Array.isArray(response.message.tool_calls)
    ? response.message.tool_calls
    : [];
}

function responseModel(response: ResearchModelResponse): string | undefined {
  const value = response.reported_model;
  return value && value.trim() ? value.trim() : undefined;
}

function isAllowedLingResponseModel(value: string): boolean {
  return value === DEFAULT_OPENAI_MODEL || value === DEFAULT_OPENAI_MODEL.replace(/:free$/, "");
}

function failure(
  mode: "text" | "tools",
  service: string,
  model: string,
  startedAt: number,
  reason: string,
  extra: Partial<ModelCheckResult> = {}
): ModelCheckResult {
  return {
    passed: false,
    mode,
    service,
    model,
    elapsed_ms: Math.max(0, Date.now() - startedAt),
    reason: safeReason(reason),
    ...extra,
  };
}

/**
 * Run a strict Ling/OpenRouter connectivity check. The helper is side-effect
 * free until it has validated the requested configuration; callers can inject
 * fetch for offline tests.
 */
export async function runModelCheck(options: ModelCheckOptions = {}): Promise<ModelCheckResult> {
  const startedAt = Date.now();
  const mode = options.tools ? "tools" : "text";
  const env = options.env || process.env;
  const configuredBase = envValue(env, "FINTRUST_LLM_BASE_URL");
  const configuredModel = envValue(env, "FINTRUST_LLM_MODEL");
  const service = safeServiceAddress(configuredBase || DEFAULT_OPENAI_BASE_URL);
  const model = safeModelName(configuredModel || DEFAULT_OPENAI_MODEL);

  try {
    const apiKey = envValue(env, "FINTRUST_LLM_API_KEY");
    if (!apiKey) {
      return failure(
        mode,
        service,
        model,
        startedAt,
        configuredBase || configuredModel
          ? "FINTRUST_LLM_API_KEY is required for the explicitly configured Ling model"
          : "FINTRUST_LLM_API_KEY is not configured; model:check does not use Gemini or a fixture"
      );
    }

    const config = getModelConfiguration(env);
    if (!config.configured || config.provider !== "openai_compatible" || !config.model || !config.base_url) {
      return failure(mode, service, model, startedAt, config.reason || "Ling OpenRouter configuration is unavailable");
    }
    if (config.model !== DEFAULT_OPENAI_MODEL) {
      return failure(mode, safeServiceAddress(config.base_url), safeModelName(config.model), startedAt, `model:check requires ${DEFAULT_OPENAI_MODEL}`);
    }
    if (config.base_url !== DEFAULT_OPENAI_BASE_URL) {
      return failure(mode, safeServiceAddress(config.base_url), safeModelName(config.model), startedAt, `model:check requires ${DEFAULT_OPENAI_BASE_URL}`);
    }

    const timeoutMs = timeoutValue(options.timeoutMs);
    const transport = createConfiguredResearchModelTransport(env, { fetch: options.fetch });
    if (!transport || transport.provider !== "openai_compatible" || transport.model !== DEFAULT_OPENAI_MODEL) {
      return failure(mode, service, model, startedAt, "The configured transport is not the required Ling OpenRouter transport");
    }

    if (!options.tools) {
      const response = await completeWithResearchModelTimeout(
        transport,
        {
          messages: [
            { role: "system", content: "You are answering a transport connectivity check." },
            { role: "user", content: "Reply with one short sentence confirming receipt. Do not call tools." },
          ],
          tools: [],
          max_tokens: MODEL_CHECK_MAX_TOKENS,
        },
        timeoutMs
      );
      const actualModel = responseModel(response);
      if (!actualModel || !isAllowedLingResponseModel(actualModel)) {
        return failure(mode, service, model, startedAt, actualModel ? "The provider reported a different model" : "The provider did not report a response model", {
          usage: response.usage,
          response_model: actualModel ? safeModelName(actualModel) : "unreported",
        });
      }
      if (responseToolCalls(response).length > 0) {
        return failure(mode, service, model, startedAt, "The no-tools request returned an unexpected tool call", {
          usage: response.usage,
          response_model: safeModelName(actualModel),
        });
      }
      return {
        passed: true,
        mode,
        service,
        model,
        elapsed_ms: Math.max(0, Date.now() - startedAt),
        usage: response.usage,
        response_model: safeModelName(actualModel),
        response_text: responseText(response),
      };
    }

    const firstRequest = {
      messages: [
        { role: "system" as const, content: "You are answering a transport connectivity check." },
        { role: "user" as const, content: `Call ${SYNTHETIC_TOOL_NAME} exactly once with value \"ling-check\". After receiving the tool result, reply with a short sentence containing the exact marker returned by that tool.` },
      ],
      tools: [SYNTHETIC_TOOL],
      tool_choice: { type: "function" as const, function: { name: SYNTHETIC_TOOL_NAME } },
      max_tokens: MODEL_CHECK_MAX_TOKENS,
    };
    const first = await completeWithResearchModelTimeout(transport, firstRequest, timeoutMs);
    const firstModel = responseModel(first);
    if (!firstModel || !isAllowedLingResponseModel(firstModel)) {
      return failure(mode, service, model, startedAt, firstModel ? "The provider reported a different model" : "The provider did not report a response model", {
        usage: first.usage,
        response_model: firstModel ? safeModelName(firstModel) : "unreported",
        intermediate_response_text: first.message.content,
      });
    }
    const calls = responseToolCalls(first);
    if (calls.length !== 1) {
      return failure(mode, service, model, startedAt, "The tools check expected exactly one synthetic tool call", {
        usage: first.usage,
        response_model: safeModelName(firstModel),
        intermediate_response_text: first.message.content,
      });
    }
    const call = calls[0];
    if (call.name !== SYNTHETIC_TOOL_NAME) {
      return failure(mode, service, model, startedAt, `The tools check returned unexpected tool ${safeModelName(call.name)}`, {
        usage: first.usage,
        response_model: safeModelName(firstModel),
        intermediate_response_text: first.message.content,
      });
    }
    const value = call.arguments && call.arguments.value;
    if (value !== "ling-check") {
      return failure(mode, service, model, startedAt, "The synthetic tool call did not honor the requested value", {
        usage: first.usage,
        response_model: safeModelName(firstModel),
        intermediate_response_text: first.message.content,
      });
    }

    const toolResult = { ok: true, echoed: value, marker: `model-check-${randomUUID()}` };
    const second = await completeWithResearchModelTimeout(
      transport,
      {
        messages: [
          ...firstRequest.messages,
          { role: "assistant" as const, content: first.message.content, tool_calls: calls },
          { role: "tool" as const, name: SYNTHETIC_TOOL_NAME, tool_call_id: call.id, content: JSON.stringify(toolResult) },
        ],
        // OpenRouter requires the tool schema on the tool-result turn too.
        tools: [SYNTHETIC_TOOL],
        tool_choice: "none",
        max_tokens: MODEL_CHECK_MAX_TOKENS,
      },
      timeoutMs
    );
    const secondModel = responseModel(second);
    if (!secondModel || !isAllowedLingResponseModel(secondModel)) {
      return failure(mode, service, model, startedAt, secondModel ? "The provider reported a different model" : "The provider did not report a response model", {
        usage: second.usage,
        response_model: secondModel ? safeModelName(secondModel) : "unreported",
        intermediate_response_text: first.message.content,
        tool_result: toolResult,
      });
    }
    if (responseToolCalls(second).length > 0) {
      return failure(mode, service, model, startedAt, "The tools check returned another tool call after the tool result", {
        usage: second.usage,
        response_model: safeModelName(secondModel),
        intermediate_response_text: first.message.content,
        tool_result: toolResult,
      });
    }
    const finalText = responseText(second);
    if (!finalText.includes(toolResult.marker)) {
      return failure(mode, service, model, startedAt, "The final response did not use the synthetic tool result", {
        usage: second.usage,
        response_model: safeModelName(secondModel),
        intermediate_response_text: first.message.content,
        tool_result: toolResult,
      });
    }
    const usage: ResearchModelUsage = {};
    addUsage(usage, first.usage);
    addUsage(usage, second.usage);
    return {
      passed: true,
      mode,
      service,
      model,
      elapsed_ms: Math.max(0, Date.now() - startedAt),
      usage: Object.keys(usage).length ? usage : undefined,
      response_model: safeModelName(secondModel),
      intermediate_response_text: first.message.content,
      response_text: finalText,
      tool_result: toolResult,
    };
  } catch (error) {
    return failure(mode, service, model, startedAt, safeReason(error));
  }
}

export function formatModelCheckResult(result: ModelCheckResult): string {
  const lines = [
    `service: ${safeServiceAddress(result.service)}`,
    `configured_model: ${safeModelName(result.model)}`,
    `response_model: ${result.response_model ? safeModelName(result.response_model) : "unreported"}`,
    `mode: ${result.mode}`,
  ];
  if (result.intermediate_response_text) {
    lines.push(`intermediate_response: ${redactSensitiveText(result.intermediate_response_text).trim()}`);
  }
  if (result.response_text !== undefined) {
    lines.push(`response: ${redactSensitiveText(result.response_text).trim()}`);
  }
  if (result.tool_result !== undefined) {
    lines.push(`tool_result: ${redactSensitiveText(JSON.stringify(result.tool_result))}`);
  }
  lines.push(`elapsed_ms: ${result.elapsed_ms}`);
  lines.push(`token_usage: ${result.usage ? JSON.stringify(result.usage) : "unavailable"}`);
  if (result.reason) lines.push(`reason: ${redactSensitiveText(result.reason).replace(/\s+/g, " ").trim()}`);
  lines.push(`status: ${result.passed ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

interface ParsedCliOptions {
  tools: boolean;
  timeoutMs?: number;
  help: boolean;
}

function parseCliOptions(argv: string[]): ParsedCliOptions {
  const parsed: ParsedCliOptions = { tools: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tools") {
      parsed.tools = true;
      continue;
    }
    if (arg === "--timeout-ms") {
      const next = argv[index + 1];
      if (!next) throw new Error("--timeout-ms requires a value");
      parsed.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    throw new Error(`Unknown option ${arg}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  let cli: ParsedCliOptions;
  try {
    cli = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    console.error(`model:check failed: ${safeReason(error)}`);
    process.exitCode = 2;
    return;
  }
  if (cli.help) {
    console.log("Usage: npm run model:check [-- --tools] [-- --timeout-ms <milliseconds>]");
    return;
  }

  // Load only this project's conventional env files. Existing process env
  // values win; .env.local is loaded first so it wins over .env.
  loadDotenv({ path: resolve(".env.local"), quiet: true });
  loadDotenv({ path: resolve(".env"), quiet: true });
  const result = await runModelCheck({ tools: cli.tools, timeoutMs: cli.timeoutMs });
  console.log(formatModelCheckResult(result));
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
