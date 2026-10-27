// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  SPICY_MODELS,
  spicyConfiguration,
  buildSpicyRequest,
  spicyRequest,
  downloadSpicyOutput,
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
it("output redirects use allowlisted HTTPS hosts and never carry credentials", async () => {
  vi.stubEnv("SPICY_OUTPUT_HOSTS", "cdn.example.com,files.example.com");
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
  expect(f.mock.calls.every((c) => !c[1].headers)).toBe(true);
  await expect(
    downloadSpicyOutput("https://unknown.example.com/a", SPICY_MODELS[0]),
  ).rejects.toThrow("untrusted");
});
it.each(["text/html", "image/jpeg"])("rejects output MIME %s", async (mime) => {
  vi.stubEnv("SPICY_OUTPUT_HOSTS", "cdn.example.com");
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
