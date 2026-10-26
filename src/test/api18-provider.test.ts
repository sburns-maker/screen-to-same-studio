// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  api18Provider,
  api18ProviderFromEnvironment,
  api18Configuration,
  downloadApi18Output,
  type Api18Journal,
} from "@/lib/api18-image.server";
import { compactRomanticPrompt } from "@/lib/tess-image.server";
const refs = [
  "https://refs.example.com/canonical?token=private",
  "https://refs.example.com/half?token=private",
];
const blobs = refs.map(
  () => new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }),
);
const bytes = new Uint8Array([255, 216, 255, 217]);
const image = () => new Response(bytes, { headers: { "content-type": "image/jpeg" } });
const completed = () => ({
  id: "job_1",
  status: "completed",
  cost_usd: 0.08,
  data: [{ url: "https://api18.dev/v1/files/file_1" }],
  expires_at: "2026-11-01",
  retention_days: 7,
});
let fetcher: ReturnType<typeof vi.fn>,
  claim: ReturnType<typeof vi.fn<Api18Journal["claim"]>>,
  record: ReturnType<typeof vi.fn<Api18Journal["record"]>>,
  journal: Api18Journal;
function configured() {
  for (const [k, v] of Object.entries({
    API18_ENABLED: "true",
    API18_KEY: "private-test-key",
    API18_ACCOUNT_CREDITS_VERIFIED_AT: new Date().toISOString(),
    API18_DAILY_BUDGET_CENTS: "100",
    API18_MONTHLY_BUDGET_CENTS: "1000",
    API18_JOB_RESERVATION_CENTS: "20",
    API18_OUTPUT_HOSTS: "cdn.example.com",
  }))
    vi.stubEnv(k, v);
}
function normal(output = completed()) {
  fetcher.mockImplementation(async (url: string, options: RequestInit = {}) => {
    if (url.startsWith("https://refs.example.com/"))
      return new Response(null, { status: 206, headers: { "content-type": "image/jpeg" } });
    if (options.method === "POST") return Response.json(output);
    if (url.startsWith("https://api18.dev/v1/jobs/")) return Response.json(output);
    if (url.startsWith("https://api18.dev/v1/files/"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://cdn.example.com/result.jpg?temporary=signed" },
      });
    if (url.startsWith("https://cdn.example.com/")) return image();
    throw new Error("Unexpected request");
  });
}
beforeEach(() => {
  configured();
  fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  claim = vi
    .fn<Api18Journal["claim"]>()
    .mockResolvedValue({ fresh: true, record: { status: "reserved", job_id: null } });
  record = vi.fn<Api18Journal["record"]>().mockResolvedValue(undefined);
  journal = { claim, record };
  normal();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("documented Hera image editing with mocked external requests", () => {
  it("defaults off and never exposes its key", () => {
    vi.stubEnv("API18_ENABLED", "false");
    expect(api18Configuration()).toMatchObject({
      enabled: false,
      keyPresent: true,
      ready: false,
      contractVerified: true,
    });
    expect(JSON.stringify(api18Configuration())).not.toContain("private-test-key");
    expect(() => api18ProviderFromEnvironment(refs, journal)).toThrow("disabled");
  });
  it("requires current verified credit, spending limits and known output hosts", async () => {
    vi.stubEnv("API18_ACCOUNT_CREDITS_VERIFIED_AT", "2000-01-01");
    expect(api18Configuration().ready).toBe(false);
    await expect(
      api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
    ).rejects.toThrow("configuration_incomplete");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("submits the documented payload once and follows a CDN redirect without forwarding credentials", async () => {
    const result = await api18ProviderFromEnvironment(refs, journal).generate(
      "One adult, non-nude portrait",
      blobs,
    );
    expect(result).toMatchObject({
      mime: "image/jpeg",
      provider: "api18",
      model: "hera-1.0-image-edit",
    });
    const post = fetcher.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(post).toHaveLength(1);
    expect(post[0]![0]).toBe("https://api18.dev/v1/generate?wait=true");
    expect(JSON.parse(post[0]![1].body)).toEqual({
      model: "hera-1.0-image-edit",
      prompt: "One adult, non-nude portrait",
      images: refs,
      enable_prompt_expansion: false,
    });
    const cdn = fetcher.mock.calls.find((c) => c[0].startsWith("https://cdn.example.com/"));
    expect(cdn![1].headers).toEqual({});
    expect(fetcher.mock.calls.every((c) => c[1].redirect !== "follow")).toBe(true);
    expect(record).toHaveBeenCalledWith({
      id: "job_1",
      status: "completed",
      cost: 0.08,
      failure: null,
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain("token=private");
  });
  it("polls a 202 processing job with GET only", async () => {
    let clock = 0;
    const runtime = {
      now: () => clock,
      wait: async (ms: number) => {
        clock += ms;
      },
    };
    let submitted = false;
    fetcher.mockImplementation(async (url: string, o: RequestInit = {}) => {
      if (url.startsWith("https://refs.example.com/")) return new Response(null, { status: 206 });
      if (o.method === "POST") {
        submitted = true;
        return Response.json(
          { id: "job_1", status: "processing", cost_usd: null },
          { status: 202 },
        );
      }
      if (url.includes("/v1/jobs/")) return Response.json(completed());
      return image();
    });
    const result = await api18ProviderFromEnvironment(refs, journal, runtime).generate(
      "portrait",
      blobs,
    );
    expect(result.provider).toBe("api18");
    expect(submitted).toBe(true);
    expect(fetcher.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  });
  it("does not resubmit an uncertain, failed or already-known durable action", async () => {
    claim.mockResolvedValue({ fresh: false, record: { status: "unknown", job_id: null } });
    await expect(
      api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
    ).rejects.toThrow("previous_submission_uncertain");
    expect(fetcher).not.toHaveBeenCalled();
    claim.mockResolvedValue({ fresh: false, record: { status: "processing", job_id: "job_1" } });
    await api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs);
    expect(fetcher.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
  });
  it("keeps processing jobs recoverable on timeout without generating again", async () => {
    let clock = 0;
    const runtime = {
      now: () => clock,
      wait: async (ms: number) => {
        clock += ms;
      },
    };
    claim.mockResolvedValue({ fresh: false, record: { status: "processing", job_id: "job_1" } });
    fetcher.mockImplementation(async () => Response.json({ id: "job_1", status: "processing" }));
    await expect(
      api18ProviderFromEnvironment(refs, journal, runtime).generate("portrait", blobs),
    ).rejects.toThrow("poll_timeout_no_resubmission");
    expect(fetcher.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
  });
  it.each([402, 429, 500])("reports HTTP %s without retrying a paid POST", async (status) => {
    fetcher.mockImplementation(async (_url: string, o: RequestInit = {}) =>
      o.method === "POST" ? new Response(null, { status }) : new Response(null, { status: 206 }),
    );
    await expect(
      api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
    ).rejects.toThrow(
      status === 402 ? "insufficient_balance" : status === 429 ? "rate_limited" : "http_500",
    );
    expect(fetcher.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        status: status === 500 ? "unknown" : "failed",
        cost: status === 500 ? null : 0,
      }),
    );
  });
  it("records provider failure/refund evidence and never downloads a failed job", async () => {
    normal({
      id: "job_1",
      status: "failed",
      cost_usd: 0,
      data: [],
      expires_at: "",
      retention_days: 0,
    });
    await expect(
      api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
    ).rejects.toThrow("generation_failed");
    expect(record).toHaveBeenCalledWith({
      id: "job_1",
      status: "failed",
      cost: 0,
      failure: "api18_generation_failed",
    });
    expect(fetcher.mock.calls.some((c) => c[0].includes("/v1/files/"))).toBe(false);
  });
  it("holds uncertain reservations for malformed responses and interrupted submissions", async () => {
    fetcher.mockImplementation(async (_url: string, o: RequestInit = {}) =>
      o.method === "POST"
        ? Response.json({ invalid: "response" })
        : new Response(null, { status: 206 }),
    );
    await expect(
      api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
    ).rejects.toThrow("response_invalid");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: "unknown", cost: null }));
  });
  it("rejects unsafe redirects, non-images, mismatched MIME and oversized outputs", async () => {
    fetcher.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    );
    await expect(downloadApi18Output("https://api18.dev/v1/files/file_1", "key")).rejects.toThrow(
      "url_untrusted",
    );
    fetcher.mockResolvedValue(new Response("html", { headers: { "content-type": "text/html" } }));
    await expect(downloadApi18Output("https://api18.dev/v1/files/file_1", "key")).rejects.toThrow(
      "not_image",
    );
    fetcher.mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/png" } }));
    await expect(downloadApi18Output("https://api18.dev/v1/files/file_1", "key")).rejects.toThrow(
      "mime_mismatch",
    );
    fetcher.mockResolvedValue(
      new Response(bytes, {
        headers: { "content-type": "image/jpeg", "content-length": "25000000" },
      }),
    );
    await expect(downloadApi18Output("https://api18.dev/v1/files/file_1", "key")).rejects.toThrow(
      "size_invalid",
    );
  });
  it("requires a ledger, valid HTTPS refs, supported count/size and an untruncated prompt", async () => {
    expect(() => api18Provider("key", [])).toThrow("reference_count");
    expect(() => api18Provider("key", [refs[0]!, refs[0]!])).toThrow("duplicate_reference");
    expect(() => api18Provider("key", ["http://localhost/x"])).toThrow("untrusted");
    await expect(api18Provider("key", refs).generate("portrait", blobs)).rejects.toThrow(
      "action_required",
    );
    await expect(
      api18Provider("key", refs, journal).generate("x".repeat(2501), blobs),
    ).rejects.toThrow("prompt_invalid");
    expect(fetcher).not.toHaveBeenCalled();
    const compact = compactRomanticPrompt(
      { key: "tess", name: "Jessica Morgan", age: 34, pronouns: "she/her", appearance: "" },
      "At home in a green sweater",
      "restrained smile",
    );
    expect(compact.length).toBeLessThan(2501);
    expect(compact).toContain("At home in a green sweater");
    expect(compact).toContain("NON-NUDE");
  });
});
it("routes ordinary and unconfigured mature photos to the existing provider without new queries", async () => {
  const { configuredPhotoProvider } = await import("@/lib/photo-provider-router.server");
  const ordinary = { name: "existing", model: "existing", generate: vi.fn() },
    db = { from: vi.fn() };
  expect(
    await configuredPhotoProvider(db as never, "owner", "tess", "casual_selfie", ordinary),
  ).toBe(ordinary);
  vi.stubEnv("API18_ENABLED", "false");
  expect(
    await configuredPhotoProvider(db as never, "owner", "tess", "mature_romantic", ordinary),
  ).toBe(ordinary);
  expect(db.from).not.toHaveBeenCalled();
});

it("does not submit when a signed reference expired or the provider budget claim fails", async () => {
  fetcher.mockResolvedValue(new Response(null, { status: 403 }));
  await expect(
    api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
  ).rejects.toThrow("reference_not_fetchable");
  expect(fetcher.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
  expect(record).toHaveBeenCalledWith({
    id: null,
    status: "failed",
    cost: 0,
    failure: "api18_reference_not_fetchable",
  });
  fetcher.mockClear();
  claim.mockRejectedValue(new Error("api18_budget_or_action_unavailable"));
  await expect(
    api18ProviderFromEnvironment(refs, journal).generate("portrait", blobs),
  ).rejects.toThrow("budget_or_action");
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects references larger than the documented 10 MB and four-reference sets", async () => {
  expect(() =>
    api18Provider("key", [
      ...refs,
      "https://refs.example.com/third",
      "https://refs.example.com/fourth",
    ]),
  ).toThrow("reference_count");
  await expect(
    api18ProviderFromEnvironment([refs[0]!], journal).generate("portrait", [
      new Blob([new Uint8Array(10000001)], { type: "image/jpeg" }),
    ]),
  ).rejects.toThrow("reference_invalid");
  expect(claim).not.toHaveBeenCalled();
});
