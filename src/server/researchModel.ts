import { GoogleGenAI } from "@google/genai";
import type { ResearchToolDefinition } from "./researchTools";

export type ResearchModelRole = "system" | "user" | "assistant" | "tool";

export interface ResearchModelMessage {
  role: ResearchModelRole;
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ResearchModelToolCall[];
}

export interface ResearchModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ResearchModelRequest {
  messages: ResearchModelMessage[];
  tools: ResearchModelToolDefinition[];
  /** Optional OpenAI-compatible tool selection. It is omitted when no tools are sent. */
  tool_choice?: ResearchModelToolChoice;
  model?: string;
  max_tokens?: number;
  /** OpenRouter-compatible reasoning budget. Structured extraction should use none. */
  reasoning_effort?: "none" | "minimal" | "low" | "medium" | "high";
}

/**
 * The production research tools use ResearchToolName, while connectivity
 * checks may send a deliberately synthetic tool. Keeping the transport
 * contract name-only prevents the check from importing or executing business
 * tools.
 */
export type ResearchModelToolDefinition = Omit<ResearchToolDefinition, "name"> & { name: string };

export type ResearchModelToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

export interface ResearchModelUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ResearchModelResponse {
  message: {
    role: "assistant";
    content?: string;
    tool_calls?: ResearchModelToolCall[];
  };
  model?: string;
  /** Provider-reported model id, when the response includes one. */
  reported_model?: string;
  usage?: ResearchModelUsage;
  raw?: unknown;
}

export interface ResearchModelCompleteOptions {
  signal?: AbortSignal;
}

export interface ResearchModelTransport {
  readonly provider: "gemini" | "openai_compatible" | "test_fixture";
  readonly model: string;
  complete(
    request: ResearchModelRequest,
    options?: ResearchModelCompleteOptions
  ): Promise<ResearchModelResponse>;
}

export type ResearchModelTransportLike =
  | ResearchModelTransport
  | ((request: ResearchModelRequest, options?: ResearchModelCompleteOptions) => Promise<ResearchModelResponse> | ResearchModelResponse);

export interface ResearchModelConfiguration {
  configured: boolean;
  provider?: "gemini" | "openai_compatible";
  model?: string;
  base_url?: string;
  reason?: string;
}

export const DEFAULT_OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENAI_MODEL = "inclusionai/ling-3.0-flash-fin:free";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 45_000;
export const MAX_MODEL_REQUEST_TIMEOUT_MS = 120_000;
export const DEFAULT_MODEL_MAX_OUTPUT_TOKENS = 24_000;

export function configuredMaxOutputTokens(
  env: Record<string, string | undefined> = process.env
): number {
  const value = Number(env.FINTRUST_MAX_OUTPUT_TOKENS || DEFAULT_MODEL_MAX_OUTPUT_TOKENS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MODEL_MAX_OUTPUT_TOKENS;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Return a service address safe for display and request construction. Query
 * strings and URL credentials are never part of a displayed endpoint. URL
 * credentials are rejected by the transport rather than silently sent.
 */
export function safeServiceAddress(value?: string): string {
  const candidate = value && value.trim() ? value.trim() : DEFAULT_OPENAI_BASE_URL;
  try {
    const parsed = new URL(candidate);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin}${trimTrailingSlash(parsed.pathname)}`;
  } catch {
    return "[invalid service address]";
  }
}

function normaliseBaseUrl(value: string): string {
  const candidate = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("FINTRUST_LLM_BASE_URL must be a valid HTTP(S) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("FINTRUST_LLM_BASE_URL must use HTTP(S)");
  }
  if (parsed.username || parsed.password) {
    throw new Error("FINTRUST_LLM_BASE_URL must not contain URL credentials");
  }
  // The configured value is a service root. Ignore query/hash components so
  // they cannot accidentally become a second place for credentials or tokens.
  parsed.search = "";
  parsed.hash = "";
  return `${parsed.origin}${trimTrailingSlash(parsed.pathname)}`;
}

function envValue(env: Record<string, string | undefined>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/** Returns model metadata without revealing any API key. */
export function getModelConfiguration(
  env: Record<string, string | undefined> = process.env
): ResearchModelConfiguration {
  const openaiKey = envValue(env, "FINTRUST_LLM_API_KEY");
  const explicitBase = envValue(env, "FINTRUST_LLM_BASE_URL");
  const explicitModel = envValue(env, "FINTRUST_LLM_MODEL");

  if (openaiKey) {
    let baseUrl: string;
    try {
      baseUrl = normaliseBaseUrl(explicitBase || DEFAULT_OPENAI_BASE_URL);
    } catch (error) {
      return {
        configured: false,
        reason: error instanceof Error ? error.message : "FINTRUST_LLM_BASE_URL is invalid",
      };
    }
    return {
      configured: true,
      provider: "openai_compatible",
      model: explicitModel || DEFAULT_OPENAI_MODEL,
      base_url: baseUrl,
    };
  }

  // An explicit OpenAI-compatible setting is an intent to use that provider.
  // Do not silently switch to Gemini when its key is missing.
  if (explicitBase || explicitModel) {
    return {
      configured: false,
      reason: "FINTRUST_LLM_BASE_URL/MODEL is present but FINTRUST_LLM_API_KEY is not configured",
    };
  }

  return {
    configured: false,
    reason: "仅支持指定 Ling 模型 inclusionai/ling-3.0-flash-fin:free；请配置 FINTRUST_LLM_API_KEY",
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Keep the public error stable and avoid surfacing provider/parser data.
    }
  }
  throw new Error("Model tool arguments must be a JSON object");
}

function parseToolCalls(rawCalls: unknown): ResearchModelToolCall[] {
  if (!Array.isArray(rawCalls)) return [];
  const calls: ResearchModelToolCall[] = [];
  rawCalls.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const item = raw as Record<string, unknown>;
    const fn = item.function && typeof item.function === "object" ? (item.function as Record<string, unknown>) : item;
    const name = String(fn.name || item.name || "").trim();
    if (!name) return;
    const id = String(item.id || `tool_call_${index + 1}`);
    const argumentsValue = fn.arguments ?? item.arguments ?? {};
    calls.push({ id, name, arguments: parseJsonObject(argumentsValue) });
  });
  return calls;
}

function usageFromRaw(raw: any): ResearchModelUsage | undefined {
  const usage = raw?.usage || raw?.usageMetadata;
  if (!usage || typeof usage !== "object") return undefined;
  const input = usage.prompt_tokens ?? usage.promptTokenCount;
  const output = usage.completion_tokens ?? usage.candidatesTokenCount;
  const total = usage.total_tokens ?? usage.totalTokenCount;
  const result: ResearchModelUsage = {};
  if (typeof input === "number" && Number.isFinite(input)) result.input_tokens = input;
  if (typeof output === "number" && Number.isFinite(output)) result.output_tokens = output;
  if (typeof total === "number" && Number.isFinite(total)) result.total_tokens = total;
  return Object.keys(result).length ? result : undefined;
}

/**
 * Some Ling OpenRouter providers place the entire structured answer in the
 * model's reasoning field and leave content empty.  We never expose or store
 * that reasoning.  Only a self-contained, valid JSON object is recovered;
 * everything else remains an error.
 */
function extractJsonFromText(text: string): string | undefined {
  if (!text || typeof text !== "string") return undefined;
  // 1. Check all markdown code blocks
  const codeBlocks = text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
  for (const match of codeBlocks) {
    const block = match[1].trim();
    try {
      const p = JSON.parse(block);
      if (p && typeof p === "object") return JSON.stringify(p);
    } catch {}
  }
  // 2. Scan for balanced braces {...}
  let depth = 0;
  let start = -1;
  let lastValid: string | undefined;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === "object") lastValid = JSON.stringify(parsed);
        } catch {}
        start = -1;
      }
    }
  }
  if (lastValid) return lastValid;
  // 3. Fallback: find widest { ... }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
    } catch {}
  }
  return undefined;
}

function structuredJsonFromReasoning(message: Record<string, unknown>): string | undefined {
  const candidates: string[] = [];
  if (typeof message.reasoning_content === "string") candidates.push(message.reasoning_content);
  if (typeof message.reasoning === "string") candidates.push(message.reasoning);
  if (Array.isArray(message.reasoning_details)) {
    for (const detail of message.reasoning_details) {
      if (detail && typeof detail === "object") {
        const record = detail as Record<string, unknown>;
        if (typeof record.text === "string") candidates.push(record.text);
        if (typeof record.content === "string") candidates.push(record.content);
      }
    }
  }
  for (const candidate of candidates) {
    const extracted = extractJsonFromText(candidate);
    if (extracted) return extracted;
  }
  // Return the raw candidate text as fallback if tokens were generated
  return candidates.find((c) => c && c.trim()) || undefined;
}

function normaliseOpenAIResponse(raw: any, fallbackModel: string): ResearchModelResponse {
  const choice = raw?.choices?.[0];
  if (!choice || !choice.message) throw new Error("Model response did not contain an assistant message");
  const message = choice.message as Record<string, unknown>;
  const content = message.content;
  const toolCalls = parseToolCalls(message.tool_calls);
  const directContent = typeof content === "string" ? content : content == null ? undefined : JSON.stringify(content);
  const normalisedContent = directContent && directContent.trim() ? directContent : structuredJsonFromReasoning(message);
  if (toolCalls.length === 0 && !(normalisedContent && normalisedContent.trim())) {
    const finishReason = String(choice.finish_reason || choice.native_finish_reason || "unknown");
    const outputTokens = raw?.usage?.completion_tokens;
    throw new Error(`OpenAI-compatible response was empty (finish_reason=${finishReason}${typeof outputTokens === "number" ? `, output_tokens=${outputTokens}` : ""})`);
  }
  return {
    message: {
      role: "assistant",
      content: normalisedContent,
      tool_calls: toolCalls,
    },
    model: String(raw?.model || fallbackModel),
    reported_model: typeof raw?.model === "string" && raw.model.trim() ? raw.model.trim() : undefined,
    usage: usageFromRaw(raw),
    raw,
  };
}

/** Redact secrets and URL query strings before an error or model text is logged. */
export function redactSensitiveText(value: unknown, secret?: string): string {
  let text = String(value ?? "");
  if (secret && secret.length > 0) text = text.split(secret).join("[redacted]");
  text = text.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]");
  text = text.replace(/((?:api[_ -]?key|access[_ -]?token|token|secret|password)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]");
  text = text.replace(/(https?:\/\/[^\s"'<>?]+)\?[^\s"'<>]*/gi, "$1");
  text = text.replace(/\b(?:sk|rk|or)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted]");
  return text.replace(/[\u0000-\u001f\u007f]/g, " ");
}

export class OpenAICompatibleTransport implements ResearchModelTransport {
  readonly provider = "openai_compatible" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    fetchImpl: typeof fetch = fetch
  ) {
    // Fail before a request is attempted when the configured service URL is
    // malformed or contains embedded credentials.
    this.baseUrl = normaliseBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
  }

  async complete(request: ResearchModelRequest, options: ResearchModelCompleteOptions = {}): Promise<ResearchModelResponse> {
    if (options.signal?.aborted) throw new Error("Model request aborted");
    const endpoint = `${this.baseUrl}/chat/completions`;
    const tools = Array.isArray(request.tools) ? request.tools : [];
    const messages = request.messages.map((message) => {
      if (message.role === "assistant" && message.tool_calls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments || {}),
            },
          })),
        };
      }
      if (message.role === "tool") {
        return {
          role: "tool",
          name: message.name,
          tool_call_id: message.tool_call_id,
          content: message.content || "",
        };
      }
      return {
        role: message.role,
        content: message.content || "",
      };
    });
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (tools.length > 0) {
      requestBody.tools = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      requestBody.tool_choice = request.tool_choice === undefined ? "auto" : request.tool_choice;
    }
    if (request.max_tokens !== undefined) {
      requestBody.max_tokens = request.max_tokens;
      requestBody.max_completion_tokens = request.max_tokens;
    }
    if (request.reasoning_effort !== undefined) {
      requestBody.reasoning = { effort: request.reasoning_effort, exclude: true };
      // Ling 3 controls hybrid thinking in its chat template. OpenRouter's
      // generic reasoning flag alone may still leave all generated tokens in
      // reasoning_content, so set the model-native switch as well.
      if (request.reasoning_effort === "none") {
        requestBody.chat_template_kwargs = { enable_thinking: false };
      }
    }

    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });
    const body = await response.text();
    let parsed: any;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      throw new Error(`OpenAI-compatible endpoint returned non-JSON (${response.status})`);
    }
    if (!response.ok) {
      const detail = redactSensitiveText(parsed?.error?.message || parsed?.message, this.apiKey).trim();
      throw new Error(`OpenAI-compatible model request failed (${response.status}): ${detail || "provider returned an error"}`);
    }
    return normaliseOpenAIResponse(parsed, this.model);
  }
}

function geminiContents(messages: ResearchModelMessage[]): { systemInstruction?: string; contents: any[] } {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content || "").join("\n\n");
  const contents: any[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      let response: unknown = message.content || "";
      try { response = JSON.parse(String(response)); } catch { /* keep text */ }
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: message.name || "research_tool", response } }],
      });
      continue;
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      const parts: any[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls) parts.push({ functionCall: { name: call.name, args: call.arguments } });
      contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content || "" }] });
  }
  return { systemInstruction: system || undefined, contents };
}

class GeminiTransport implements ResearchModelTransport {
  readonly provider = "gemini" as const;
  private readonly client: GoogleGenAI;

  constructor(readonly model: string, apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(request: ResearchModelRequest, options: ResearchModelCompleteOptions = {}): Promise<ResearchModelResponse> {
    if (options.signal?.aborted) throw new Error("Model request aborted");
    const converted = geminiContents(request.messages);
    // @google/genai has changed the exact config types across minor releases;
    // the runtime payload below is stable and is kept narrowly cast here.
    const response: any = await this.client.models.generateContent({
      model: this.model,
      contents: converted.contents,
      config: {
        abortSignal: options.signal,
        systemInstruction: converted.systemInstruction,
        tools: [{
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        }],
      },
    } as any);
    if (options.signal?.aborted) throw new Error("Model request aborted");
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const toolCalls: ResearchModelToolCall[] = [];
    const texts: string[] = [];
    parts.forEach((part: any, index: number) => {
      if (part?.text) texts.push(String(part.text));
      const functionCall = part?.functionCall || part?.function_call;
      if (functionCall?.name) {
        toolCalls.push({
          id: String(functionCall.id || `gemini_tool_call_${index + 1}`),
          name: String(functionCall.name),
          arguments: parseJsonObject(functionCall.args || functionCall.arguments || {}),
        });
      }
    });
    const responseText = texts.join("\n").trim() || (typeof response?.text === "string" ? response.text : undefined);
    if (!responseText && toolCalls.length === 0) throw new Error("Gemini response did not contain text or a tool call");
    return {
      message: { role: "assistant", content: responseText, tool_calls: toolCalls },
      model: this.model,
      usage: usageFromRaw(response),
      raw: response,
    };
  }
}

export function createConfiguredResearchModelTransport(
  env: Record<string, string | undefined> = process.env,
  options: { fetch?: typeof fetch } = {}
): ResearchModelTransport | null {
  const config = getModelConfiguration(env);
  if (!config.configured || !config.provider || !config.model) return null;
  if (config.provider === "openai_compatible") {
    const key = envValue(env, "FINTRUST_LLM_API_KEY");
    if (!key) return null;
    return new OpenAICompatibleTransport(config.model, config.base_url || DEFAULT_OPENAI_BASE_URL, key, options.fetch);
  }
  return null;
}

export function getTransportProvider(transport: ResearchModelTransportLike): ResearchModelTransport["provider"] {
  if (typeof transport === "function") return "test_fixture";
  return transport.provider || "test_fixture";
}

export function getTransportModel(transport: ResearchModelTransportLike): string {
  if (typeof transport === "function") return "injected-test-transport";
  return transport.model || "configured-research-model";
}

export async function completeWithTransport(
  transport: ResearchModelTransportLike,
  request: ResearchModelRequest,
  options: ResearchModelCompleteOptions = {}
): Promise<ResearchModelResponse> {
  if (typeof transport === "function") return await transport(request, options);
  return await transport.complete(request, options);
}

/**
 * Complete one bounded model request and forward cancellation to the
 * transport. This helper is intentionally small so command-line checks and
 * offline tests can exercise the same timeout/abort behavior as production
 * callers without making any request on their own.
 */
export async function completeWithResearchModelTimeout(
  transport: ResearchModelTransportLike,
  request: ResearchModelRequest,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<ResearchModelResponse> {
  const duration = Number(timeoutMs);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Model request timeout must be a positive number");
  }
  if (parentSignal?.aborted) throw new Error("Model request aborted");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, duration);
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const response = await completeWithTransport(transport, request, { signal: controller.signal });
    if (timedOut) throw new Error(`Model request timed out after ${duration} ms`);
    if (parentSignal?.aborted) throw new Error("Model request aborted");
    return response;
  } catch (error) {
    if (timedOut) throw new Error(`Model request timed out after ${duration} ms`);
    if (parentSignal?.aborted) throw new Error("Model request aborted");
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

export function isResearchModelResponse(value: unknown): value is ResearchModelResponse {
  return Boolean(value && typeof value === "object" && (value as ResearchModelResponse).message);
}
