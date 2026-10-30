import { z } from "zod";

// A dedicated, non-OpenAI screening path for SpicyAPI's fictional adult
// suggestive portraits. An independent moderation service is mandatory.
// These checks do NOT establish the pictured person's real-world identity.
const probability = z.number().finite().min(0).max(1);
const resultSchema = z.object({
  status: z.literal("success"),
  nudity: z.object({
    sexual_activity: probability,
    sexual_display: probability,
    erotica: probability,
  }),
  faces: z.array(z.object({
    attributes: z.object({
      age: z.object({ minor: probability }),
    }),
  }).passthrough()),
}).passthrough();

export function requireSuggestiveScreen() {
  if (!process.env["SIGHTENGINE_API_USER"]?.trim() || !process.env["SIGHTENGINE_API_SECRET"]?.trim())
    throw new Error("suggestive_screen_unavailable");
}

// Validate the actual SpicyAPI output bytes, not only HTTP Content-Type.
// The Spicy provider requests PNG; accept one plausible single-frame portrait.
export function validateSuggestivePng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((byte, i) => bytes[i] === byte) ||
      // First PNG chunk must be a 13-byte IHDR.
      bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 ||
      bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82)
    throw new Error("suggestive_image_invalid");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width < 256 || height < 256 || width > 8192 || height > 8192 || width * height > 40_000_000)
    throw new Error("suggestive_image_invalid");
}

export function evaluateSuggestiveVerdict(data: unknown) {
  const checked = resultSchema.safeParse(data);
  if (!checked.success) throw new Error("suggestive_screen_uncertain");
  const { nudity, faces } = checked.data;
  // Intentionally allow consensual adult suggestiveness, including lingerie.
  // Sexual acts, explicit display or overt nudity are out of scope.
  if (nudity.sexual_activity >= 0.15 || nudity.sexual_display >= 0.15 ||
      nudity.erotica >= 0.30)
    throw new Error("suggestive_content_blocked");
  // One clearly visible adult face is required for this solo-character category.
  // Uncertain age, extra people, or no visible face cannot be safely approved.
  if (faces.length !== 1 || faces[0]!.attributes.age.minor > 0.15)
    throw new Error("suggestive_adult_unverified");
  return { status: "screen_passed" as const, method: "sightengine_nudity_face_age" as const };
}

/**
 * Sends only the candidate photo to Sightengine for adult-content and age
 * screening. The approved canonical reference stays private and is never sent
 * to this or OpenAI's visual checker. The reference SHA and exact bytes are
 * already validated by the Spicy submission/worker paths.
 */
export async function screenSuggestivePhoto(image: Blob) {
  requireSuggestiveScreen();
  if (image.type !== "image/png" || image.size > 20_000_000)
    throw new Error("suggestive_image_invalid");
  validateSuggestivePng(new Uint8Array(await image.arrayBuffer()));
  const form = new FormData();
  form.set("models", "nudity-2.1,face-age");
  form.set("api_user", process.env["SIGHTENGINE_API_USER"]!);
  form.set("api_secret", process.env["SIGHTENGINE_API_SECRET"]!);
  form.set("media", image, "suggestive.png");
  let response: Response;
  try {
    response = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      credentials: "omit",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("suggestive_screen_unavailable");
    return evaluateSuggestiveVerdict(await response.json());
  } catch (e) {
    // Never disclose credentials, provider response bodies or image data.
    if (e instanceof Error && [
      "suggestive_content_blocked",
      "suggestive_adult_unverified",
      "suggestive_screen_uncertain",
    ].includes(e.message)) throw e;
    throw new Error("suggestive_screen_unavailable");
  }
}
