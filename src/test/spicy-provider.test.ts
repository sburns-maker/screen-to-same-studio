// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  SPICY_MODELS,
  spicyConfiguration,
  buildSpicyRequest,
  spicyRequest,
  downloadSpicyOutput,
  quoteSpicyRequest,
  buildSpicyPrompt,
  SpicyHttpFailure,
  SpicyQuoteFailure,
} from "@/lib/spicy-image.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("defaults to Flash and config exposes no secret", () => {
  vi.stubEnv("SPICY_API_KEY", "test-private-value");
  vi.stubEnv("SPICY_ENABLED", "false");
  expect(spicyConfiguration()).toMatchObject({ model: SPICY_MODELS[0], ready: false });
  expect(JSON.stringify(spicyConfiguration())).not.toContain("test-private-value");
});
it.each(SPICY_MODELS)("constructs only verified edit inputs for %s", (model) => {
  const request = buildSpicyRequest(model, "One fictional adult", [
    "https://storage.example.com/canon?token=private",
  ]);
  expect(request).toMatchObject({
    model,
    input: { aspect_ratio: "3:4", resolution: "2k", output_format: "png", background: "opaque" },
  });
  expect(request.input.enable_thinking).toBe(model === SPICY_MODELS[1] ? true : undefined);
});
it("rejects unsupported models, local references, empty prompts and excessive references", () => {
  for (const args of [
    ["unknown", "scene", ["https://example.com/a"]],
    [SPICY_MODELS[0], "scene", ["http://localhost/a"]],
    [SPICY_MODELS[0], "", ["https://example.com/a"]],
    [SPICY_MODELS[0], "scene", Array(4).fill("https://example.com/a")],
  ] as [string, string, string[]][])
    expect(() => buildSpicyRequest(...args)).toThrow();
});
it("submits the stable idempotency header and accepts HTTP202/code200", async () => {
  vi.stubEnv("SPICY_API_KEY", "server-only-test");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ code: 200, data: { taskId: "job_1", state: "queued" } }, { status: 202 }),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await spicyRequest("/jobs/createTask", { model: SPICY_MODELS[0] }, "photo-msg-stable-render-1"),
  ).toMatchObject({ taskId: "job_1" });
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    method: "POST",
    headers: {
      Authorization: "Bearer server-only-test",
      "Idempotency-Key": "photo-msg-stable-render-1",
    },
    redirect: "error",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([400, 401, 402, 403, 409, 429, 503])("does not retry HTTP %s", async (status) => {
  vi.stubEnv("SPICY_API_KEY", "test");
  const f = vi
    .fn()
    .mockResolvedValue(
      new Response("private provider body", { status, headers: { "retry-after": "45" } }),
    );
  vi.stubGlobal("fetch", f);
  await expect(spicyRequest("/jobs/createTask", {}, "stable")).rejects.toMatchObject({
    status,
    retrySeconds: 45,
  });
  expect(f).toHaveBeenCalledTimes(1);
});
it("polls with GET and rejects malformed/business-error responses", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  const f = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        code: 200,
        data: {
          taskId: "job_1",
          state: "succeeded",
          output: { assets: [{ url: "https://cdn.example.com/a" }] },
          cost: ".03",
          settled: true,
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ code: 40301, msg: "private" }));
  vi.stubGlobal("fetch", f);
  expect((await spicyRequest("/jobs/recordInfo?taskId=job_1")).state).toBe("succeeded");
  expect(f.mock.calls[0]![1].method).toBe("GET");
  await expect(spicyRequest("/jobs/recordInfo?taskId=job_1")).rejects.toThrow(
    "spicy_response_invalid",
  );
});
it("output redirects revalidate each public HTTPS hop and never carry credentials", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://files.example.com/a.png" } }),
    )
    .mockResolvedValueOnce(
      new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        headers: { "content-type": "image/png" },
      }),
    );
  vi.stubGlobal("fetch", f);
  expect((await downloadSpicyOutput("https://cdn.example.com/a", SPICY_MODELS[0])).provider).toBe(
    "spicyapi",
  );
  expect(
    f.mock.calls.every(
      (c) => !JSON.stringify(c[1].headers ?? {}).toLowerCase().includes("authorization"),
    ),
  ).toBe(true);
});
it.each([
  "http://cdn.example.com/a",
  "https://127.0.0.1/a",
  "https://10.0.0.5/a",
  "https://169.254.169.254/latest",
  "https://[::1]/a",
  "https://2130706433/a",
  "https://0x7f000001/a",
  "https://localhost/a",
  "https://db.internal/a",
  "https://user:pw@cdn.example.com/a",
  "https://cdn.example.com:8443/a",
])("blocks unsafe output URL %s without fetching", async (raw) => {
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  await expect(downloadSpicyOutput(raw, SPICY_MODELS[0])).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});
it("blocks redirects into private networks", async () => {
  const f = vi
    .fn()
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://192.168.1.1/x.png" } }),
    );
  vi.stubGlobal("fetch", f);
  await expect(downloadSpicyOutput("https://cdn.example.com/a", SPICY_MODELS[0])).rejects.toThrow(
    "untrusted",
  );
  expect(f).toHaveBeenCalledTimes(1);
});
it("rejects oversized output by declared length", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png", "content-length": "20000001" },
      }),
    ),
  );
  await expect(downloadSpicyOutput("https://cdn.example.com/a", SPICY_MODELS[0])).rejects.toThrow(
    "output_invalid",
  );
});
it("parses a free quote and rounds its cost up to whole cents", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  const f = vi.fn().mockResolvedValue(
    Response.json({
      code: 200,
      data: {
        quoteId: "q_1",
        model: SPICY_MODELS[0],
        estimatedCost: "0.035",
        maxCharge: "0.035",
        currency: "USD",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      },
    }),
  );
  vi.stubGlobal("fetch", f);
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  expect(await quoteSpicyRequest(body)).toMatchObject({
    quoteId: "q_1",
    expectedCost: "0.035",
    cents: 4,
  });
  expect(f.mock.calls[0]![0]).toMatch(/\/jobs\/quote$/);
  expect(f.mock.calls[0]![1].headers["Idempotency-Key"]).toBeUndefined();
});
it.each([352, 4096])("preserves a signed opaque quote token of %s characters", async (length) => {
  vi.stubEnv("SPICY_API_KEY", "test");
  const quoteId = `header.${"a".repeat(length - 17)}.signature`;
  expect(quoteId).toHaveLength(length);
  const f = vi.fn().mockResolvedValue(Response.json({ code: 200, data: {
    quoteId, model: SPICY_MODELS[0], estimatedCost: "0.1", maxCharge: "0.1",
    currency: "USD", expiresAt: new Date(Date.now() + 300000).toISOString(),
  } }));
  vi.stubGlobal("fetch", f);
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  expect(await quoteSpicyRequest(body)).toMatchObject({ quoteId, cents: 10 });
  expect(f).toHaveBeenCalledTimes(1);
});
it.each(["", "a".repeat(4097), " token", "token ", "to\nken", "to\rken", "to\tken", "to\u0000ken", "to\u007fken", "tökén"])(
  "rejects empty, oversized or unsafe opaque quote tokens (case %#)", async (quoteId) => {
    vi.stubEnv("SPICY_API_KEY", "test");
    const f = vi.fn().mockResolvedValue(Response.json({ code: 200, data: {
      quoteId, model: SPICY_MODELS[0], estimatedCost: "0.1",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    } }));
    vi.stubGlobal("fetch", f);
    const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
    await expect(quoteSpicyRequest(body)).rejects.toThrow("spicy_quote_id_invalid");
    expect(f).toHaveBeenCalledTimes(1);
  },
);
it("rejects expired or mismatched quotes", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  for (const data of [
    { quoteId: "q", model: SPICY_MODELS[0], estimatedCost: "0.1", expiresAt: "2000-01-01T00:00:00Z" },
    { quoteId: "q", model: SPICY_MODELS[1], estimatedCost: "0.1", expiresAt: new Date(Date.now() + 1e5).toISOString() },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 200, data })));
    await expect(quoteSpicyRequest(body)).rejects.toThrow(/spicy_quote_(expired|model_mismatch)/);
  }
});
// Mirrors the structure of a real successful SpicyAPI quote (352-char signed token).
const SIGNED = `eyJ2IjoxLCJzdWIiOi${"A".repeat(296)}.V5mwRCbLE9wK-YJOzqbFe2Rxo1DFhrPmWyTRrrGTK9Q`;
const okQuote = () => ({ code: 200, data: {
  quoteId: SIGNED, model: SPICY_MODELS[0], estimatedCost: "0.029", maxCharge: "0.029",
  currency: "USD", expiresAt: new Date(Date.now() + 300000).toISOString(),
} });
it("accepts the real successful quote structure with a long signed token", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  expect(SIGNED.length).toBeGreaterThan(300);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(okQuote())));
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  expect(await quoteSpicyRequest(body)).toMatchObject({ quoteId: SIGNED, expectedCost: "0.029", cents: 3 });
});
it.each([
  ["spicy_quote_envelope_code", (q: any) => ({ ...q, code: 500 })],
  ["spicy_quote_payload_missing", (q: any) => ({ code: 200 })],
  ["spicy_quote_id_invalid", (q: any) => ({ ...q, data: { ...q.data, quoteId: 42 } })],
  ["spicy_quote_model_mismatch", (q: any) => ({ ...q, data: { ...q.data, model: "other/model" } })],
  ["spicy_quote_currency_unsupported", (q: any) => ({ ...q, data: { ...q.data, currency: "EUR" } })],
  ["spicy_quote_cost_invalid", (q: any) => ({ ...q, data: { ...q.data, estimatedCost: "-1" } })],
  ["spicy_quote_max_charge_invalid", (q: any) => ({ ...q, data: { ...q.data, maxCharge: "1e3" } })],
  ["spicy_quote_expiry_invalid", (q: any) => ({ ...q, data: { ...q.data, expiresAt: "soon" } })],
  ["spicy_quote_expired", (q: any) => ({ ...q, data: { ...q.data, expiresAt: "2000-01-01T00:00:00Z" } })],
])("reports the exact failing validation rule %s", async (rule, mutate) => {
  vi.stubEnv("SPICY_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(mutate(okQuote()))));
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  const err = await quoteSpicyRequest(body).catch((e) => e);
  expect(err).toBeInstanceOf(SpicyQuoteFailure);
  expect(err.message).toBe(rule);
  expect(err.stage).toBe("quote");
  expect(err.message).not.toContain(SIGNED);
});
it("reports malformed quote bodies separately from HTTP failures", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>not json", { status: 200 })));
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  await expect(quoteSpicyRequest(body)).rejects.toThrow("spicy_quote_response_invalid");
});
it.each([400, 401, 402, 429])("keeps HTTP %s status, sanitized code and request id at the quote stage", async (status) => {
  vi.stubEnv("SPICY_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    { error: { code: "insufficient_credit", message: "see https://signed.example.com/x?token=secret" } },
    { status, headers: { "x-request-id": "req_abc123" } },
  )));
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a?token=private"]);
  const err = await quoteSpicyRequest(body).catch((e) => e);
  expect(err).toBeInstanceOf(SpicyHttpFailure);
  expect(err).toMatchObject({ status, stage: "quote", requestId: "req_abc123", providerCode: "insufficient_credit" });
  expect(err.message).toBe(`spicy_http_${status}`);
  expect(JSON.stringify({ ...err, m: err.message })).not.toMatch(/token|signed\.example/);
});
it("drops unsafe provider codes and request ids", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    { error: { code: "has spaces https://x" } }, { status: 400, headers: { "x-request-id": "bad id/../" } },
  )));
  const err = await quoteSpicyRequest(buildSpicyRequest(SPICY_MODELS[0], "s", ["https://r.example.com/a"])).catch((e) => e);
  expect(err.providerCode).toBeUndefined();
  expect(err.requestId).toBeUndefined();
});
it.each(["text/html", "image/jpeg"])("rejects output MIME %s", async (mime) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("not png", { headers: { "content-type": mime } })),
  );
  await expect(downloadSpicyOutput("https://cdn.example.com/a", SPICY_MODELS[0])).rejects.toThrow(
    "not_png",
  );
});
it("builds separated scene, identity and phone-geometry instructions without a key", () => {
  const text = buildSpicyPrompt("Riley", 28, "at home", {
    selfie_type: "mirror",
    clothing_category: "blue sweater",
  });
  for (const section of [
    "IDENTITY / REFERENCES",
    "WARDROBE",
    "SCENE / LOCATION",
    "POSE / EXPRESSION",
    "CAMERA",
    "LIGHTING",
    "QUALITY",
  ])
    expect(text).toContain(section);
  expect(text).toContain("behind the lens");
  expect(text).toContain("mirror selfie");
  expect(text).toContain("No nudity");
});

it("sends distinct suggestive category guidance without changing identity or scene", () => {
  const base = buildSpicyPrompt("Riley", 28, "in her apartment", { selfie_type: "selfie" }, "mature_romantic");
  const suggestive = buildSpicyPrompt("Riley", 28, "in her apartment", { selfie_type: "selfie" }, "suggestive");
  expect(base).toContain("Private romantic non-explicit adult portrait");
  expect(suggestive).toContain("Strongly flirtatious but non-explicit adult portrait");
  expect(suggestive).toContain("in her apartment");
  expect(suggestive).toContain("No nudity or explicit sexual acts");
  expect(suggestive).not.toEqual(base);
});
