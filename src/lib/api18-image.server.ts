import type { ImageProvider, GeneratedImage } from "./tess-image.server";
const ORIGIN = "https://api18.dev";
export const API18_MODEL = "hera-1.0-image-edit";
export const API18_CONTRACT_VERIFIED = true; // Contract supplied from official docs; live acceptance remains untested.
const IMAGE_LIMIT = 20_000_000,
  REFERENCE_LIMIT = 10_000_000;
export type Api18Job = {
  id: string;
  status: "processing" | "completed" | "failed";
  cost_usd?: number | null;
  data?: { url: string }[];
};
export type Api18Journal = {
  claim: (
    hash: string,
  ) => Promise<{ fresh: boolean; record: { status: string; job_id: string | null } }>;
  record: (job: {
    id: string | null;
    status: "processing" | "completed" | "failed" | "unknown";
    cost: number | null;
    failure: string | null;
  }) => Promise<void>;
};
function integer(name: string, max: number) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 && n <= max ? n : 0;
}
export function api18Configuration() {
  const enabled = process.env["API18_ENABLED"] === "true",
    keyPresent = !!process.env["API18_KEY"]?.trim();
  const verified = Date.parse(process.env["API18_ACCOUNT_CREDITS_VERIFIED_AT"] ?? "");
  const creditsVerified =
    Number.isFinite(verified) &&
    Date.now() - verified >= -300000 &&
    Date.now() - verified < 86400000;
  const dailyCents = integer("API18_DAILY_BUDGET_CENTS", 100000),
    monthlyCents = integer("API18_MONTHLY_BUDGET_CENTS", 1000000),
    jobCents = integer("API18_JOB_RESERVATION_CENTS", 10000);
  const hosts = (process.env["API18_OUTPUT_HOSTS"] ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const outputHostsConfigured =
    hosts.length > 0 && hosts.length <= 10 && hosts.every(publicHostname);
  const budgetsConfigured = jobCents > 0 && dailyCents >= jobCents && monthlyCents >= dailyCents;
  const ready =
    enabled && keyPresent && creditsVerified && budgetsConfigured && outputHostsConfigured;
  return {
    enabled,
    keyPresent,
    contractVerified: API18_CONTRACT_VERIFIED,
    creditsVerified,
    budgetsConfigured,
    outputHostsConfigured,
    ready,
    dailyCents,
    monthlyCents,
    jobCents,
    reason: !enabled
      ? "Api18 disabled"
      : !keyPresent
        ? "Api18 server secret missing"
        : !creditsVerified
          ? "Verify Api18 account credits and set the recent verification time in Lovable Secrets"
          : !budgetsConfigured
            ? "Configure Api18 job, daily and rolling 30-day spending reservations"
            : !outputHostsConfigured
              ? "Configure verified Api18 output CDN hostnames in Lovable Secrets"
              : "Api18 configured; live staging validation still required",
  };
}
function publicHostname(host: string) {
  return (
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) &&
    host.includes(".") &&
    !/^\d+(?:\.\d+)*$/.test(host) &&
    !/(?:^|\.)(?:localhost|local|internal|invalid|test|onion)$/.test(host) &&
    !host.endsWith(".arpa")
  );
}
function httpsUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("api18_url_invalid");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.hash ||
    !publicHostname(u.hostname)
  )
    throw new Error("api18_url_untrusted");
  return u;
}
function failure(status: number) {
  return status === 402
    ? "api18_insufficient_balance"
    : status === 429
      ? "api18_rate_limited"
      : `api18_http_${status}`;
}
function parseJob(value: unknown): Api18Job {
  if (!value || typeof value !== "object") throw new Error("api18_response_invalid");
  const v = value as Record<string, unknown>;
  if (
    typeof v["id"] !== "string" ||
    !/^[-a-zA-Z0-9_]{1,160}$/.test(v["id"]) ||
    !["processing", "completed", "failed"].includes(String(v["status"]))
  )
    throw new Error("api18_response_invalid");
  if (
    v["cost_usd"] !== undefined &&
    v["cost_usd"] !== null &&
    (typeof v["cost_usd"] !== "number" ||
      !Number.isFinite(v["cost_usd"]) ||
      v["cost_usd"] < 0 ||
      v["cost_usd"] >= 1000000)
  )
    throw new Error("api18_cost_invalid");
  if (
    v["status"] === "completed" &&
    (!Array.isArray(v["data"]) || !v["data"].length || typeof v["data"][0]?.url !== "string")
  )
    throw new Error("api18_output_missing");
  return v as unknown as Api18Job;
}
async function json(response: Response) {
  const text = await response.text();
  if (text.length > 1000000) throw new Error("api18_response_too_large");
  try {
    return parseJob(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error("api18_response_invalid");
    throw e;
  }
}
async function boundedBytes(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (length > IMAGE_LIMIT) throw new Error("api18_output_size_invalid");
  if (!response.body) throw new Error("api18_output_missing");
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > IMAGE_LIMIT) throw new Error("api18_output_size_invalid");
      parts.push(r.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!size) throw new Error("api18_output_size_invalid");
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}
function mimeOf(b: Uint8Array) {
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return "image/png";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new Error("api18_output_not_image");
}
/** Only the fixed files endpoint receives the bearer key. CDN redirects are manual,
 * exact-host allowlisted and never receive that credential. No client-supplied URL.
 */
export async function downloadApi18Output(raw: string, apiKey: string): Promise<GeneratedImage> {
  let u = httpsUrl(raw);
  const hosts = new Set(
    (process.env["API18_OUTPUT_HOSTS"] ?? "").split(",").map((h) => h.trim().toLowerCase()),
  );
  for (let count = 0; count < 4; count++) {
    const own = u.origin === ORIGIN;
    if (
      own
        ? !/^\/v1\/files\/[-a-zA-Z0-9_]+$/.test(u.pathname) ||
          [...u.searchParams.keys()].some((k) => k !== "n")
        : !hosts.has(u.hostname)
    )
      throw new Error("api18_output_url_untrusted");
    const r = await fetch(u.href, {
      headers: own ? { Authorization: `Bearer ${apiKey}` } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = r.headers.get("location");
      await r.body?.cancel();
      if (!next) throw new Error("api18_output_redirect_invalid");
      u = httpsUrl(new URL(next, u).href);
      continue;
    }
    if (!r.ok) throw new Error(failure(r.status));
    const mime = (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      await r.body?.cancel();
      throw new Error("api18_output_not_image");
    }
    const bytes = await boundedBytes(r);
    if (mimeOf(bytes) !== mime) throw new Error("api18_output_mime_mismatch");
    return { bytes, mime, provider: "api18", model: API18_MODEL };
  }
  throw new Error("api18_output_redirect_limit");
}
export async function getApi18Job(id: string, apiKey: string) {
  if (!/^[-a-zA-Z0-9_]{1,160}$/.test(id)) throw new Error("api18_job_id_invalid");
  const r = await fetch(`${ORIGIN}/v1/jobs/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(failure(r.status));
  const job = await json(r);
  if (job.id !== id) throw new Error("api18_job_id_changed");
  return job;
}
async function digest(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** One submit per durable action. Poll retries can only GET the original job. */
export function api18Provider(
  apiKey: string,
  referenceUrls: readonly string[],
  journal?: Api18Journal,
  runtime?: { wait: (ms: number) => Promise<void>; now: () => number },
): ImageProvider {
  if (!apiKey.trim()) throw new Error("api18_not_configured");
  if (referenceUrls.length < 1 || referenceUrls.length > 3)
    throw new Error("api18_reference_count_invalid");
  if (new Set(referenceUrls).size !== referenceUrls.length)
    throw new Error("api18_duplicate_reference");
  for (const u of referenceUrls) httpsUrl(u);
  return {
    name: "api18",
    model: API18_MODEL,
    referenceConditioning: true,
    allowIdentityRetry: false,
    maxPromptCharacters: 2500,
    async generate(prompt, references) {
      const config = api18Configuration();
      if (!config.ready) throw new Error("api18_configuration_incomplete");
      if (!journal) throw new Error("api18_action_required");
      if (!prompt.trim() || prompt.length > 2500) throw new Error("api18_prompt_invalid");
      if (references.length !== referenceUrls.length)
        throw new Error("api18_reference_count_mismatch");
      for (const b of references)
        if (
          !b.size ||
          b.size > REFERENCE_LIMIT ||
          !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(b.type)
        )
          throw new Error("api18_reference_invalid");
      const hashes = [];
      for (const blob of references) {
        const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        hashes.push(
          Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join(""),
        );
      }
      const claim = await journal.claim(
        await digest(JSON.stringify({ model: API18_MODEL, prompt, hashes })),
      );
      let job: Api18Job | undefined;
      if (!claim.fresh) {
        if (claim.record.status === "failed") throw new Error("api18_previous_job_failed");
        if (!claim.record.job_id) throw new Error("api18_previous_submission_uncertain");
        job = await getApi18Job(claim.record.job_id, apiKey);
      }
      const record = async (j: Api18Job) =>
        journal.record({
          id: j.id,
          status: j.status,
          cost: j.cost_usd ?? null,
          failure: j.status === "failed" ? "api18_generation_failed" : null,
        });
      if (claim.fresh) {
        // URLs are never stored in the ledger or exposed to browser APIs. Check fetchability before paid submit.
        try {
          for (const u of referenceUrls) {
            const r = await fetch(u, {
              method: "GET",
              headers: { Range: "bytes=0-63" },
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            });
            await r.body?.cancel();
            if (!r.ok) throw new Error("api18_reference_not_fetchable");
          }
        } catch {
          await journal.record({
            id: null,
            status: "failed",
            cost: 0,
            failure: "api18_reference_not_fetchable",
          });
          throw new Error("api18_reference_not_fetchable");
        }
        let rejectionRecorded = false;
        try {
          const r = await fetch(`${ORIGIN}/v1/generate?wait=true`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            redirect: "error",
            body: JSON.stringify({
              model: API18_MODEL,
              prompt,
              images: [...referenceUrls],
              enable_prompt_expansion: false,
            }),
            signal: AbortSignal.timeout(90000),
          });
          if (!r.ok) {
            const rejected = [400, 401, 402, 403, 404, 422, 429].includes(r.status);
            await journal.record({
              id: null,
              status: rejected ? "failed" : "unknown",
              cost: rejected ? 0 : null,
              failure: failure(r.status),
            });
            rejectionRecorded = true;
            throw new Error(failure(r.status));
          }
          job = await json(r);
          await record(job);
        } catch (e) {
          if (!job && !rejectionRecorded)
            await journal.record({
              id: null,
              status: "unknown",
              cost: null,
              failure:
                e instanceof Error && /^api18_[a-z0-9_]+$/.test(e.message)
                  ? e.message
                  : "api18_submission_uncertain",
            });
          throw new Error(
            e instanceof Error && /^api18_[a-z0-9_]+$/.test(e.message)
              ? e.message
              : "api18_submission_uncertain",
          );
        }
      }
      if (!job) throw new Error("api18_response_invalid");
      const now = runtime?.now ?? Date.now;
      const wait =
        runtime?.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const deadline = now() + 90000;
      let delay = 3000;
      while (job.status === "processing" && now() < deadline) {
        await wait(delay);
        try {
          job = await getApi18Job(job.id, apiKey);
          await record(job);
          delay = 3000;
        } catch (e) {
          if (
            e instanceof Error &&
            [
              "api18_rate_limited",
              "api18_http_500",
              "api18_http_502",
              "api18_http_503",
              "api18_http_504",
            ].includes(e.message)
          ) {
            delay = Math.min(12000, delay * 2);
            continue;
          }
          throw new Error(
            e instanceof Error && /^api18_[a-z0-9_]+$/.test(e.message)
              ? e.message
              : "api18_poll_interrupted",
          );
        }
      }
      if (job.status === "processing") throw new Error("api18_poll_timeout_no_resubmission");
      await record(job);
      if (job.status === "failed") throw new Error("api18_generation_failed");
      return downloadApi18Output(job.data![0]!.url, apiKey);
    },
  };
}
export function api18ProviderFromEnvironment(
  referenceUrls: readonly string[],
  journal?: Api18Journal,
  runtime?: { wait: (ms: number) => Promise<void>; now: () => number },
) {
  const c = api18Configuration();
  if (!c.enabled) throw new Error("api18_disabled");
  if (!c.keyPresent) throw new Error("api18_not_configured");
  return api18Provider(process.env["API18_KEY"]!, referenceUrls, journal, runtime);
}
