import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const schema = z.object({ messages: z.array(z.string()), delta: z.number() });
const valid = { messages: ["Absolutely not."], delta: 0 };
function response(text = JSON.stringify(valid), status = "completed") {
  return Response.json({
    id: "resp_test",
    model: "gpt-6-luna",
    created_at: 1,
    status,
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 25, output_tokens: 15, total_tokens: 40 },
    ...(status === "incomplete" ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
  });
}

describe("direct OpenAI structured character generation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-only-secret");
    vi.stubEnv("CHARACTER_AI_DISABLED", "false");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the real SDK Responses serializer, strict JSON, Luna, and bounded output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    expect(await runStructured(schema, "private canon", "private transcript")).toEqual(valid);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      max_output_tokens: 4096,
      reasoning: { effort: "low" },
    });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(init.signal).toBeDefined();
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).toContain('"totalTokens":40');
    expect(logs).not.toMatch(/test-only-secret|private canon|private transcript|Absolutely not/);
  });

  it("routes only opted-in interactive in-person turns to Terra; texts stay on Luna", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured, TEXT_MODEL, INTERACTIVE_EXPERIENCE_MODEL } = await import("@/lib/text-ai.server");
    expect(TEXT_MODEL).toBe("gpt-6-luna");
    expect(INTERACTIVE_EXPERIENCE_MODEL).toBe("gpt-6.1-terra");
    await runStructured(schema, "canon", "normal SMS", "reply");
    await runStructured(schema, "canon", "in person", "reply", { interactiveScene: true });
    await runStructured(schema, "canon", "automatic ending", "reply", { interactiveScene: false });
    const payloads = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(payloads.map((p) => p.model)).toEqual(["gpt-6-luna", "gpt-6.1-terra", "gpt-6-luna"]);
    for (const p of payloads) {
      expect(p.store).toBe(false);
      expect(p.text.format.strict).toBe(true);
    }
  });

  it.each(["not JSON", '{"messages":[],"delta":"invalid"}'])(
    "rejects invalid structured output without retry: %s",
    async (text) => {
      const fetchMock = vi.fn().mockResolvedValue(response(text));
      vi.stubGlobal("fetch", fetchMock);
      const { runStructured } = await import("@/lib/text-ai.server");
      await expect(runStructured(schema, "canon", "text")).rejects.toThrow(
        "temporarily unavailable",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("sanitizes API failures, never retries or falls back to the gateway", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        Response.json(
          { error: { message: "test-only-secret private transcript", type: "server_error" } },
          { status: 500 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    await expect(runStructured(schema, "canon", "text")).rejects.toThrow(
      /^Character AI is temporarily unavailable; please try again later$/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(
      /test-only-secret|private transcript/,
    );
  });

  it("rejects incomplete output even if its JSON is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(JSON.stringify(valid), "incomplete")),
    );
    const { runStructured } = await import("@/lib/text-ai.server");
    await expect(runStructured(schema, "canon", "text")).rejects.toThrow("temporarily unavailable");
  });

  it("requires the server secret and honors the emergency pause", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(runStructured(schema, "canon", "text")).rejects.toThrow("not configured");
    vi.stubEnv("OPENAI_API_KEY", "test-only-secret");
    vi.stubEnv("CHARACTER_AI_DISABLED", "true");
    await expect(runStructured(schema, "canon", "text")).rejects.toThrow("paused");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reconciles successful reported usage rather than accumulating prompt characters", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    for (let i = 0; i < 8; i++) await runStructured(schema, "canon", "x".repeat(90_000));
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("rejects excessive context and retains reservations for unknown failed usage", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ error: { message: "unavailable", type: "server_error" } }, { status: 500 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    await expect(runStructured(schema, "canon", "x".repeat(100_000))).rejects.toThrow(
      "context limit",
    );
    await expect(runStructured(schema, "canon", "x".repeat(90_000))).rejects.toThrow(
      "temporarily unavailable",
    );
    await expect(runStructured(schema, "canon", "x".repeat(90_000))).rejects.toThrow(
      "temporarily unavailable",
    );
    await expect(runStructured(schema, "canon", "x".repeat(90_000))).rejects.toThrow(
      "capacity limit",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("correlated structured provider diagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-only-secret");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it.each([
    [400, "invalid_json_schema", "request_invalid", false],
    [401, "invalid_api_key", "authentication", false],
    [404, "model_not_found", "model_not_found", false],
    [429, "insufficient_quota", "billing", false],
    [429, "rate_limit_exceeded", "rate_limited", true],
    [400, "context_length_exceeded", "context_limit", false],
    [503, "server_error", "provider_unavailable", true],
  ] as const)(
    "preserves HTTP %s / %s safely without paid retries",
    async (status, code, expected, retryable) => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code,
              param: "text.format.schema.PRIVATE-DETAIL",
              message: "test-only-secret private transcript",
            },
          },
          { status, headers: { "x-request-id": "req_safe" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { runStructured } = await import("@/lib/text-ai.server");
      const { experienceFailure } = await import("@/lib/experience-failure");
      const operationId = "00000000-0000-4000-a000-000000000123";
      let failure: unknown;
      try {
        await runStructured(schema, "private canon", "private transcript", "reply", {
          operationId,
        });
      } catch (error) {
        failure = error;
      }
      expect(experienceFailure(failure, "generation")).toMatchObject({
        diagnostic: {
          model: "gpt-6-luna",
          statusCode: status,
          code: expected,
          retryable,
          providerCode: code,
          param: "text.format.schema",
          requestId: "req_safe",
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
      expect(logs).toContain(operationId);
      expect(logs).not.toMatch(/test-only-secret|private transcript|private canon|PRIVATE-DETAIL/);
    },
  );
  it("serializes the production character reply schema through the actual SDK without optional object properties", async () => {
    const { replySchema } = await import("@/lib/tess.server");
    const { SEED_STATE } = await import("@/lib/tess-logic");
    const full = {
      housing_actions: null,
      commitment_action: {action:null,kind:null,quote:null,proposalId:null},
      schedule_actions: null,
      continuity: null,
      messages: ["Yes, let's continue the afternoon there."],
      send_delay_seconds: 3,
      state_delta: SEED_STATE,
      memory_candidates: [],
      photo: null,
      tone: "warm",
      event_tags: [],
      character_perspective: null,
      photo_boundary_decision: "unchanged",
    };
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(full)));
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    expect(await runStructured(replySchema, "canon", "context")).toMatchObject({
      messages: full.messages,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    function check(value: unknown) {
      if (!value || typeof value !== "object") return;
      const v = value as Record<string, unknown>;
      if (v["type"] === "object") {
        expect(v["additionalProperties"]).toBe(false);
        expect([...(v["required"] as string[])].sort()).toEqual(
          Object.keys(v["properties"] as object).sort(),
        );
      }
      for (const child of Object.values(v)) check(child);
    }
    check(body.text.format.schema);
    expect(body.model).toBe("gpt-6-luna");
  });
  it("recovers safe details when the provider body does not match the SDK error envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: "unsupported_parameter",
          param: "reasoning.effort",
          message: "PRIVATE ERROR BODY",
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    await expect(runStructured(schema, "canon", "context")).rejects.toThrow();
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).toContain('"providerCode":"unsupported_parameter"');
    expect(logs).toContain('"param":"reasoning.effort"');
    expect(logs).not.toContain("PRIVATE ERROR BODY");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("extracts allowlisted rejection details from direct SDK data or a bounded raw-body fallback without exposing messages", async () => {
  const { characterAIDiagnostic } = await import("@/lib/character-ai-error");
  for (const data of [
    undefined,
    { code: "unsupported_parameter", param: "reasoning.effort", message: "PRIVATE" },
  ]) {
    const diagnostic = characterAIDiagnostic(
      "gpt-6-luna",
      400,
      data,
      null,
      undefined,
      JSON.stringify({
        error: { code: "unsupported_parameter", param: "reasoning.effort", message: "PRIVATE" },
      }),
    );
    expect(diagnostic).toMatchObject({
      providerCode: "unsupported_parameter",
      param: "reasoning.effort",
      retryable: false,
    });
    expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE");
  }
  expect(
    characterAIDiagnostic("gpt-6-luna", 400, null, null, undefined, "PRIVATE unstructured error")
      .providerCode,
  ).toBeNull();
  expect(
    characterAIDiagnostic("gpt-6-luna", 400, null, null, undefined, "x".repeat(32001)).providerCode,
  ).toBeNull();
});

describe("emoji cut mid-character", () => {
  it("a lone half-emoji becomes a valid character before sending", () => {
    const cut = "make sure you get one. 😂".slice(0, -1);
    expect(cut.isWellFormed()).toBe(false);
    expect(cut.toWellFormed().isWellFormed()).toBe(true);
  });
});
