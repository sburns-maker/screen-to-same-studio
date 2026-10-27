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
it("rejects expired or mismatched quotes", async () => {
  vi.stubEnv("SPICY_API_KEY", "test");
  const body = buildSpicyRequest(SPICY_MODELS[0], "scene", ["https://refs.example.com/a"]);
  for (const data of [
    { quoteId: "q", model: SPICY_MODELS[0], estimatedCost: "0.1", expiresAt: "2000-01-01T00:00:00Z" },
    { quoteId: "q", model: SPICY_MODELS[1], estimatedCost: "0.1", expiresAt: new Date(Date.now() + 1e5).toISOString() },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 200, data })));
    await expect(quoteSpicyRequest(body)).rejects.toThrow("spicy_quote_invalid");
  }
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
