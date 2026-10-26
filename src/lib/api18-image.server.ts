import type { ImageProvider, GeneratedImage } from "./tess-image.server";

/** Api18 accepts remotely retrievable reference URLs, not multipart images.
 * Callers must supply a short-lived, scoped signed URL to a fictional character portrait.
 */
export function api18Provider(apiKey: string, referenceUrls: readonly string[]): ImageProvider {
  if (!apiKey.trim()) throw new Error("api18_not_configured");
  if (referenceUrls.length < 1 || referenceUrls.length > 3) throw new Error("api18_reference_count_invalid");
  for (const referenceUrl of referenceUrls) {
    const url = new URL(referenceUrl);
    if (url.protocol !== "https:") throw new Error("api18_reference_must_be_https");
  }
  return {
    name: "api18",
    model: "hera-1.0-image-edit",
    referenceConditioning: true,
    async generate(prompt: string, references: Blob[]): Promise<GeneratedImage> {
      if (references.length !== referenceUrls.length) throw new Error("api18_reference_count_mismatch");
      const res = await fetch("https://api18.dev/v1/generate?wait=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "hera-1.0-image-edit", prompt: prompt.slice(0, 2500),
          images: [...referenceUrls], enable_prompt_expansion: false,
        }),
        signal: AbortSignal.timeout(95_000),
      });
      if (!res.ok) throw new Error(`api18_http_${res.status}`);
      const job = await res.json() as {
        id?: string; status?: string; data?: {url?: string}[]; error?: string;
      };
      if (!job.id) throw new Error("api18_job_missing");
      let result = job;
      for (let attempt = 0; result.status === "processing" && attempt < 22; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const check = await fetch(`https://api18.dev/v1/jobs/${encodeURIComponent(job.id)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (!check.ok) throw new Error(`api18_poll_http_${check.status}`);
        result = await check.json() as typeof job;
      }
      if (result.status !== "completed") throw new Error(result.status === "failed" ? "api18_generation_failed" : "api18_generation_timeout");
      const fileUrl = result.data?.[0]?.url;
      if (!fileUrl) throw new Error("api18_output_missing");
      // Only fetch Api18-hosted result files to prevent requests to arbitrary destinations.
      const file = new URL(fileUrl);
      if (file.protocol !== "https:" || file.hostname !== "api18.dev" || !file.pathname.startsWith("/v1/files/"))
        throw new Error("api18_output_url_untrusted");
      const image = await fetch(fileUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!image.ok) throw new Error(`api18_download_http_${image.status}`);
      const mime = (image.headers.get("content-type") ?? "image/png").split(";")[0] ?? "image/png";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("api18_output_not_image");
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (!bytes.length || bytes.length > 20_000_000) throw new Error("api18_output_size_invalid");
      return { bytes, mime, provider: "api18", model: "hera-1.0-image-edit" };
    },
  };
}

/** Secure server-side configuration. Never expose API18_KEY to the browser or commit it. */
export function api18ProviderFromEnvironment(referenceUrls: readonly string[]): ImageProvider {
  if (process.env["API18_ENABLED"] !== "true") throw new Error("api18_disabled");
  const key = process.env["API18_KEY"];
  if (!key) throw new Error("api18_not_configured");
  return api18Provider(key, referenceUrls);
}
