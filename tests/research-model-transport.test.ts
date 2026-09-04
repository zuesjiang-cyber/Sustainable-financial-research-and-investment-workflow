import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  completeWithResearchModelTimeout,
  createConfiguredResearchModelTransport,
  getModelConfiguration,
  safeServiceAddress,
  type ResearchModelRequest,
} from "../src/server/researchModel";
import {
  formatModelCheckResult,
  runModelCheck,
} from "../scripts/check-model";

const API_KEY = "offline-test-key";
const OPENROUTER_ENV = {
  FINTRUST_LLM_API_KEY: API_KEY,
  FINTRUST_LLM_BASE_URL: DEFAULT_OPENAI_BASE_URL,
  FINTRUST_LLM_MODEL: DEFAULT_OPENAI_MODEL,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(init: RequestInit | undefined): Record<string, any> {
  assert.ok(init?.body, "the transport should send a JSON request body");
  return JSON.parse(String(init.body)) as Record<string, any>;
}

test("OpenAI-compatible transport targets Ling/OpenRouter and omits tools for text requests", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const transport = createConfiguredResearchModelTransport(OPENROUTER_ENV, {
    fetch: async (input, init) => {
      seen.push({ url: String(input), init });
      return jsonResponse({
        id: "offline-text",
        model: DEFAULT_OPENAI_MODEL,
        choices: [{ message: { role: "assistant", content: "connected" } }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });
    },
  });
  assert.ok(transport);

  const response = await transport.complete({
    messages: [{ role: "user", content: "ping" }],
    tools: [],
    max_tokens: 16,
  });
  assert.equal(response.message.content, "connected");
  assert.deepEqual(response.usage, { input_tokens: 5, output_tokens: 2, total_tokens: 7 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `${DEFAULT_OPENAI_BASE_URL}/chat/completions`);
  const body = requestBody(seen[0].init);
  assert.equal(body.model, DEFAULT_OPENAI_MODEL);
  assert.deepEqual(body.messages, [{ role: "user", content: "ping" }]);
  assert.equal(body.max_tokens, 16);
  assert.equal("tools" in body, false);
  assert.equal("tool_choice" in body, false);
  assert.equal((seen[0].init?.headers as Record<string, string>).Authorization, `Bearer ${API_KEY}`);
});

test("OpenAI-compatible transport serialises tool schema, selection, and tool-call arguments", async () => {
  const tool = {
    name: "offline_echo",
    description: "Echo a value",
    parameters: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    },
  };
  let seenBody: Record<string, any> | undefined;
  const transport = createConfiguredResearchModelTransport(OPENROUTER_ENV, {
    fetch: async (_input, init) => {
      seenBody = requestBody(init);
      return jsonResponse({
        model: DEFAULT_OPENAI_MODEL,
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_1",
              type: "function",
              function: { name: "offline_echo", arguments: '{"value":"ok"}' },
            }],
          },
        }],
      });
    },
  });
  assert.ok(transport);

  const request: ResearchModelRequest = {
    messages: [{ role: "user", content: "use the tool" }],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "offline_echo" } },
  };
  const response = await transport.complete(request);
  assert.deepEqual(response.message.tool_calls, [{
    id: "call_1",
    name: "offline_echo",
    arguments: { value: "ok" },
  }]);
  assert.equal(seenBody?.model, DEFAULT_OPENAI_MODEL);
  assert.deepEqual(seenBody?.tools, [{ type: "function", function: tool }]);
  assert.deepEqual(seenBody?.tool_choice, { type: "function", function: { name: "offline_echo" } });
  assert.deepEqual(seenBody?.messages, [{ role: "user", content: "use the tool" }]);
});

test("model check performs exactly one text request and reports response/usage", async () => {
  const bodies: Record<string, any>[] = [];
  const result = await runModelCheck({
    env: OPENROUTER_ENV,
    timeoutMs: 100,
    fetch: async (_input, init) => {
      bodies.push(requestBody(init));
      return jsonResponse({
        model: "inclusionai/ling-3.0-flash-fin",
        choices: [{ message: { role: "assistant", content: "Ling is reachable." } }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      });
    },
  });
  assert.equal(result.passed, true);
  assert.equal(result.response_text, "Ling is reachable.");
  assert.equal(result.response_model, "inclusionai/ling-3.0-flash-fin");
  assert.deepEqual(result.usage, { input_tokens: 8, output_tokens: 4, total_tokens: 12 });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].model, DEFAULT_OPENAI_MODEL);
  assert.equal("tools" in bodies[0], false);
  assert.equal("tool_choice" in bodies[0], false);
  assert.match(formatModelCheckResult(result), /status: PASS/);
});

test("tools check sends the tool schema on both bounded requests and returns the synthetic result", async () => {
  const bodies: Record<string, any>[] = [];
  const result = await runModelCheck({
    tools: true,
    env: OPENROUTER_ENV,
    timeoutMs: 100,
    fetch: async (_input, init) => {
      const body = requestBody(init);
      bodies.push(body);
      if (bodies.length === 1) {
        return jsonResponse({
          model: DEFAULT_OPENAI_MODEL,
          choices: [{ message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_check",
              type: "function",
              function: { name: "model_check_echo", arguments: '{"value":"ling-check"}' },
            }],
          } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }
      const toolMessage = bodies[1].messages.at(-1);
      const toolPayload = JSON.parse(toolMessage.content) as { marker: string };
      return jsonResponse({
        model: "inclusionai/ling-3.0-flash-fin",
        choices: [{ message: { role: "assistant", content: `Tool result received: ${toolPayload.marker}` } }],
        usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
      });
    },
  });
  assert.equal(result.passed, true);
  assert.match(result.response_text || "", /^Tool result received: model-check-/);
  assert.equal(result.response_model, "inclusionai/ling-3.0-flash-fin");
  assert.equal(result.tool_result?.ok, true);
  assert.equal(result.tool_result?.echoed, "ling-check");
  assert.match(String(result.tool_result?.marker), /^model-check-/);
  assert.deepEqual(result.usage, { input_tokens: 30, output_tokens: 11, total_tokens: 41 });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].tool_choice.function.name, "model_check_echo");
  assert.equal(bodies[1].tool_choice, "none");
  assert.deepEqual(bodies[1].tools, bodies[0].tools);
  assert.deepEqual(bodies[1].messages.at(-2)?.tool_calls, [{
    id: "call_check",
    type: "function",
    function: { name: "model_check_echo", arguments: '{"value":"ling-check"}' },
  }]);
  assert.equal(bodies[1].messages.at(-1).role, "tool");
  assert.equal(bodies[1].messages.at(-1).name, "model_check_echo");
  assert.equal(bodies[1].messages.at(-1).tool_call_id, "call_check");
  const toolReply = JSON.parse(bodies[1].messages.at(-1).content) as Record<string, unknown>;
  assert.equal(toolReply.ok, true);
  assert.equal(toolReply.echoed, "ling-check");
  assert.match(String(toolReply.marker), /^model-check-/);
});

test("empty and HTTP-error responses fail without leaking provider body or key", async () => {
  const emptyTransport = createConfiguredResearchModelTransport(OPENROUTER_ENV, {
    fetch: async () => jsonResponse({ choices: [{ message: { role: "assistant", content: "   " } }] }),
  });
  assert.ok(emptyTransport);
  await assert.rejects(
    emptyTransport.complete({ messages: [{ role: "user", content: "empty" }], tools: [] }),
    /did not contain text or a tool call/
  );

  const errorTransport = createConfiguredResearchModelTransport(OPENROUTER_ENV, {
    fetch: async () => jsonResponse({ error: { message: `api_key=${API_KEY}` } }, 401),
  });
  assert.ok(errorTransport);
  await assert.rejects(
    errorTransport.complete({ messages: [{ role: "user", content: "error" }], tools: [] }),
    (error: unknown) => {
      assert.match(String(error), /401/);
      assert.doesNotMatch(String(error), new RegExp(API_KEY));
      assert.match(String(error), /\[redacted\]/);
      return true;
    }
  );
});

test("missing key and wrong model fail closed without touching fetch or Gemini", async () => {
  let fetchCalls = 0;
  const fetchThatMustNotRun: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error("network should not be touched");
  };
  const missing = await runModelCheck({
    env: { GEMINI_API_KEY: "gemini-offline-key" },
    fetch: fetchThatMustNotRun,
  });
  assert.equal(missing.passed, false);
  assert.match(missing.reason || "", /FINTRUST_LLM_API_KEY/);
  assert.doesNotMatch(missing.reason || "", /gemini-offline-key/);

  const explicitMissing = getModelConfiguration({
    FINTRUST_LLM_MODEL: DEFAULT_OPENAI_MODEL,
    GEMINI_API_KEY: "gemini-offline-key",
  });
  assert.equal(explicitMissing.configured, false);
  assert.match(explicitMissing.reason || "", /FINTRUST_LLM_API_KEY/);
  assert.equal(getModelConfiguration({ GEMINI_API_KEY: "gemini-offline-key" }).provider, "gemini");

  const wrongModel = await runModelCheck({
    env: { ...OPENROUTER_ENV, FINTRUST_LLM_MODEL: "some-other-model" },
    fetch: fetchThatMustNotRun,
  });
  assert.equal(wrongModel.passed, false);
  assert.match(wrongModel.reason || "", /requires/);
  assert.equal(fetchCalls, 0);
});

test("model check rejects an unreported or foreign response model", async () => {
  const unreported = await runModelCheck({
    env: OPENROUTER_ENV,
    fetch: async () => jsonResponse({ choices: [{ message: { role: "assistant", content: "hello" } }] }),
  });
  assert.equal(unreported.passed, false);
  assert.equal(unreported.response_model, "unreported");
  assert.match(unreported.reason || "", /did not report/);

  const foreign = await runModelCheck({
    env: OPENROUTER_ENV,
    fetch: async () => jsonResponse({
      model: "other/provider-model",
      choices: [{ message: { role: "assistant", content: "hello" } }],
    }),
  });
  assert.equal(foreign.passed, false);
  assert.equal(foreign.response_model, "other/provider-model");
  assert.match(foreign.reason || "", /different model/);
});

test("tools check fails when the final response omits the opaque tool-result marker", async () => {
  let calls = 0;
  const result = await runModelCheck({
    tools: true,
    env: OPENROUTER_ENV,
    fetch: async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({
          model: DEFAULT_OPENAI_MODEL,
          choices: [{ message: {
            role: "assistant",
            tool_calls: [{
              id: "call_marker",
              type: "function",
              function: { name: "model_check_echo", arguments: '{"value":"ling-check"}' },
            }],
          } }],
        });
      }
      const body = requestBody(init);
      assert.equal(body.messages.at(-1).role, "tool");
      return jsonResponse({
        model: DEFAULT_OPENAI_MODEL,
        choices: [{ message: { role: "assistant", content: "I received the tool result." } }],
      });
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || "", /did not use the synthetic tool result/);
  assert.equal(calls, 2);
});

test("timeout and parent interruption abort the in-flight transport", async () => {
  const request: ResearchModelRequest = { messages: [{ role: "user", content: "wait" }], tools: [] };
  let timeoutSignal: AbortSignal | undefined;
  const neverCompletes = async (_request: ResearchModelRequest, options?: { signal?: AbortSignal }) => {
    timeoutSignal = options?.signal;
    return await new Promise<never>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  await assert.rejects(
    completeWithResearchModelTimeout(neverCompletes, request, 10),
    /timed out after 10 ms/
  );
  assert.equal(timeoutSignal?.aborted, true);

  const parent = new AbortController();
  let parentSignal: AbortSignal | undefined;
  const parentPromise = completeWithResearchModelTimeout(
    async (_request, options) => {
      parentSignal = options?.signal;
      return await new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
    request,
    1_000,
    parent.signal
  );
  setTimeout(() => parent.abort(), 5);
  await assert.rejects(parentPromise, /Model request aborted/);
  assert.equal(parentSignal?.aborted, true);
});

test("service display strips credentials, query, and fragment", () => {
  assert.equal(
    safeServiceAddress("https://user:password@example.com/v1/?token=secret#fragment"),
    "https://example.com/v1"
  );
});
