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
    for (let i = 0; i < 8; i++)
      await runStructured(schema, "canon", "x".repeat(90_000));
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("rejects excessive context and retains reservations for unknown failed usage", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(
      { error: { message: "unavailable", type: "server_error" } }, { status: 500 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const { runStructured } = await import("@/lib/text-ai.server");
    await expect(runStructured(schema, "canon", "x".repeat(100_000))).rejects.toThrow(
      "context limit",
    );
    await expect(runStructured(schema, "canon", "x".repeat(90_000))).rejects.toThrow("temporarily unavailable");
    await expect(runStructured(schema, "canon", "x".repeat(90_000))).rejects.toThrow("temporarily unavailable");
    await expect(runStructured(schema, "canon", "x".repeat(90_000))).rejects.toThrow(
      "capacity limit",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
