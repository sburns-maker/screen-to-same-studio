import { createServerOnlyFn } from "@tanstack/react-start";
import type { GeneratedImage } from "./tess-image.server";
export const SPICY_BASE = "https://api.spicyapi.ai/api/v1";
export const SPICY_MODELS = [
  "bytedance/seedream-5.0-flash/edit",
  "bytedance/seedream-5.0-pro/edit",
] as const;
export const SPICY_CAST = ["tess", "maya", "riley", "claire", "jordan"] as const;
export { PendingPhotoTask } from "./photo-task";
const positive = (key: string, max: number) => {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 && value <= max ? value : 0;
};
export const spicyConfiguration = createServerOnlyFn(function spicyConfiguration(
  character?: string,
) {
  const enabled = process.env["SPICY_ENABLED"] === "true";
  const keyPresent = !!process.env["SPICY_API_KEY"]?.trim();
  const override =
    character && (SPICY_CAST as readonly string[]).includes(character)
      ? process.env[`SPICY_MODEL_${character.toUpperCase()}`]
      : undefined;
  const model = override ?? process.env["SPICY_MODEL"] ?? SPICY_MODELS[0];
  const modelValid = (SPICY_MODELS as readonly string[]).includes(model);
  const jobCents = positive("SPICY_JOB_RESERVATION_CENTS", 10000);
  const dailyCents = positive("SPICY_DAILY_BUDGET_CENTS", 100000);
  const monthlyCents = positive("SPICY_MONTHLY_BUDGET_CENTS", 1000000);
  const budgetsConfigured = jobCents > 0 && dailyCents >= jobCents && monthlyCents >= dailyCents;
  const verified = Date.parse(process.env["SPICY_ACCOUNT_CREDITS_VERIFIED_AT"] ?? "");
  const creditsVerified =
    Number.isFinite(verified) &&
    Date.now() - verified >= -300000 &&
    Date.now() - verified < 86400000;
  const ready =
    enabled &&
    keyPresent &&
    modelValid &&
    budgetsConfigured &&
    creditsVerified;
  return {
    enabled,
    keyPresent,
    model,
    modelValid,
    jobCents,
    dailyCents,
    monthlyCents,
    budgetsConfigured,
    creditsVerified,
    ready,
    reason: !enabled
      ? "SpicyAPI disabled"
      : !keyPresent
        ? "SpicyAPI server secret missing"
        : !modelValid
          ? "Unsupported SpicyAPI model"
          : !budgetsConfigured
            ? "Configure SpicyAPI spending reservations"
            : !creditsVerified
              ? "Verify usable SpicyAPI account credit before enabling live calls"
              : "SpicyAPI configured; live visual testing remains required",
  };
});
/**
 * Public DNS names only. IP literals (v4, v6, decimal/hex/octal forms) and
 * internal/reserved suffixes are rejected so provider-supplied URLs cannot
 * target private networks or cloud metadata endpoints.
 */
export function publicHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h.length > 253 || h.includes("[") || h.includes(":")) return false;
  const labels = h.split(".");
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)))
    return false;
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1]!)) return false; // rejects numeric/IP forms
  return !/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa|home\.arpa)$/.test(
    h,
  );
}
export function providerHttps(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443") ||
    !publicHost(u.hostname)
  )
    throw new Error("spicy_untrusted_url");
  return u;
}
export function buildSpicyRequest(model: string, prompt: string, images: string[]) {
  if (
    !(SPICY_MODELS as readonly string[]).includes(model) ||
    !prompt.trim() ||
    prompt.length > 12000 ||
    images.length < 1 ||
    images.length > 3
  )
    throw new Error("spicy_invalid_request");
  images.forEach(providerHttps);
  return {
    model,
    input: {
      image_urls: images,
      prompt,
      aspect_ratio: "3:4",
      resolution: "2k",
      output_format: "png",
      background: "opaque",
      ...(model === SPICY_MODELS[1] ? { enable_thinking: true } : {}),
    },
  };
}
export type SpicyTask = {
  taskId: string;
  state: string;
  cost?: string | number;
  settled?: boolean;
  output?: { assets: { url: string }[] };
};
async function spicyCall(path: string, body?: unknown, idempotency?: string): Promise<unknown> {
  const key = process.env["SPICY_API_KEY"];
  if (!key) throw new Error("spicy_secret_missing");
  const response = await fetch(`${SPICY_BASE}${path}`, {
    method: body ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new SpicyHttpFailure(response.status, response.headers.get("retry-after"));
  }
  const text = await response.text();
  if (text.length > 1000000) throw new Error("spicy_response_too_large");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("spicy_response_invalid");
  }
  return data;
}
export const spicyRequest = createServerOnlyFn(async function spicyRequest(
  path: string,
  body?: unknown,
  idempotency?: string,
): Promise<SpicyTask> {
  const envelope = (await spicyCall(path, body, idempotency)) as { code?: number; data?: SpicyTask };
  if (
    envelope.code !== 200 ||
    !envelope.data ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(envelope.data.taskId) ||
    typeof envelope.data.state !== "string"
  )
    throw new Error("spicy_response_invalid");
  return envelope.data;
});
export type SpicyQuote = { quoteId: string; expectedCost: string; cents: number; expiresAt: string };
/** Free price check: creates no task and reserves no provider funds. */
export const quoteSpicyRequest = createServerOnlyFn(async function quoteSpicyRequest(
  body: ReturnType<typeof buildSpicyRequest>,
): Promise<SpicyQuote> {
  const envelope = (await spicyCall("/jobs/quote", body)) as {
    code?: number;
    data?: Record<string, unknown>;
  };
  const q = envelope?.data;
  const cost = typeof q?.estimatedCost === "string" ? q.estimatedCost : "";
  const max = typeof q?.maxCharge === "string" ? q.maxCharge : cost;
  const expires = Date.parse(String(q?.expiresAt ?? ""));
  if (
    envelope?.code !== 200 ||
    !q ||
    typeof q.quoteId !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(q.quoteId) ||
    q.model !== body.model ||
    (q.currency ?? "USD") !== "USD" ||
    !/^\d{1,6}(?:\.\d{1,10})?$/.test(cost) ||
    !/^\d{1,6}(?:\.\d{1,10})?$/.test(max) ||
    !Number.isFinite(expires) ||
    expires <= Date.now()
  )
    throw new Error("spicy_quote_invalid");
  const cents = Math.max(1, Math.ceil(Math.max(Number(cost), Number(max)) * 100 - 1e-9));
  return { quoteId: q.quoteId, expectedCost: cost, cents, expiresAt: new Date(expires).toISOString() };
});
export class SpicyHttpFailure extends Error {
  readonly retrySeconds: number;
  constructor(
    readonly status: number,
    retryAfter: string | null,
  ) {
    super(`spicy_http_${status}`);
    const numeric = Number(retryAfter);
    const seconds =
      numeric > 0 ? numeric : Math.ceil((Date.parse(retryAfter ?? "") - Date.now()) / 1000);
    this.retrySeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 15;
  }
}
export const downloadSpicyOutput = createServerOnlyFn(async function downloadSpicyOutput(
  raw: string,
  model: string,
): Promise<GeneratedImage> {
  // The URL comes only from an authenticated recordInfo response. Every hop is
  // revalidated (HTTPS, public DNS name, no credentials/IP literals) and no
  // request ever carries the API key or cookies.
  let url = providerHttps(raw);
  for (let redirects = 0; redirects < 4; redirects++) {
    const r = await fetch(url.href, {
      redirect: "manual",
      credentials: "omit",
      headers: { Accept: "image/png" },
      signal: AbortSignal.timeout(30000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = r.headers.get("location");
      await r.body?.cancel();
      if (!next) throw new Error("spicy_output_redirect_invalid");
      url = providerHttps(new URL(next, url).href);
      continue;
    }
    if (!r.ok || !r.body || Number(r.headers.get("content-length")) > 20000000)
      throw new Error("spicy_output_invalid");
    const parts: Uint8Array[] = [];
    let size = 0;
    const reader = r.body.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 20000000) throw new Error("spicy_output_too_large");
        parts.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    if (!png || r.headers.get("content-type")?.split(";")[0] !== "image/png")
      throw new Error("spicy_output_not_png");
    return { bytes, mime: "image/png", provider: "spicyapi", model };
  }
  throw new Error("spicy_output_redirect_limit");
});

export function buildSpicyPrompt(
  name: string,
  age: number,
  scene: string,
  style: Record<string, unknown> = {},
) {
  return `IDENTITY / REFERENCES: Reference 1 is the approved canonical design of ${name}, a fictional adult age ${age}. All references depict this same adult; preserve face, complexion, hair-color family and proportions. References do not prescribe wardrobe, pose or background. Never substitute a similar person.
WARDROBE: ${style["clothing_category"] ?? "Use the established outfit; never change clothing merely for variety."} Opaque non-nude clothing; retain current scene continuity.
SCENE / LOCATION: ${scene}
POSE / EXPRESSION: ${style["pose_type"] ?? "Natural to the actual activity"}; ${style["expression"] ?? "Match the established mood"}.
CAMERA: ${style["selfie_type"] ?? "Self-taken phone photo"}; ${style["camera_angle"] ?? "plausible phone perspective"}; ${style["crop_type"] ?? "casual framing"}. For a front-camera photo the phone is behind the lens and should not be visible. For a selected mirror selfie, show one plausible phone/reflection geometry. Never invent a photographer or mirror.
LIGHTING: Ambient light appropriate to the established place and time; no invented studio lighting.
QUALITY: Photorealistic casual smartphone photograph, natural skin texture, believable hands, hair and fabric. Avoid editorial polish, text overlays and watermarks. No nudity or explicit sexual acts. Preserve adult eligibility, boundaries and identity.`;
}
