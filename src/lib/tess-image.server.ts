import { PendingPhotoTask, buildSpicyPrompt } from "./spicy-image.server";
import { photoPersonalityPrompt, photographyDiagnostics, type PhotographyPlan } from "./photo-personality";
import { canonicalProfile } from "./canonical-profile.server";
import { requireVisualScreen, screenPhotoVisuals } from "./photo-identity-qc.server";
import type { CharacterKey } from "./characters";
import {
  photoTextPrompt,
  validatePhotoText,
  imageCapabilities,
  type PhotoText,
} from "./photo-text";
/**
 * Server-only image provider abstraction for Tess's dynamically generated photos.
 * Swap providers by adding another implementation of `ImageProvider`.
 */
import type { PhotoStyle } from "./tess-photos";

const GATEWAY_URL = "https://ai.gateway.lovable.dev";

export type TessImageType =
  | "object"
  | "casual_selfie"
  | "personal_selfie"
  | "intimate_selfie"
  | "tess_candid"
  | "mature_romantic";

export type GeneratedImage = { bytes: Uint8Array; mime: string; provider: string; model: string };

export interface ImageProvider {
  name: string;
  model: string;
  referenceConditioning?: boolean;
  allowIdentityRetry?: boolean;
  /** With references: identity-conditioned edit (Tess first, Mabel second). Without: plain generation. */
  generate(
    prompt: string,
    references: Blob[],
    options?: { highQuality: boolean },
  ): Promise<GeneratedImage>;
}

/**
 * The canonical reference defines WHO Tess is — never her pose, angle, expression,
 * hairstyle, crop, background or lighting. Same woman, different real photos.
 */
const IDENTITY = `The supplied canonical Tess Morgan reference defines the woman's identity only. Preserve the exact same recognizable fictional woman, facial structure, age, eyes, hair-color family and proportions, while allowing natural changes in hairstyle, pose, facial expression, clothing, camera angle, framing and environment appropriate to the requested scene. Do not recreate the reference image's pose or composition unless the scene specifically calls for it. Tess is a real-looking 34-year-old adult woman living an ordinary contemporary life. Images should resemble varied personal smartphone photos rather than repeated professional portraits. Preserve the actual profile portrait's face proportions, eyes, nose, mouth, jaw, complexion, approximate age and recognizable features. The profile image overrides any conflicting written description; do not substitute a similar-looking generic woman. Do not beautify her into a different person.`;

/** Profile pixels are authoritative; written appearance never replaces them. */
export type CharacterIdentity = {
  key: string;
  name: string;
  age: number;
  pronouns: string;
  appearance: string;
};
export function identityBlock(id?: CharacterIdentity): string {
  if (!id || id.key === "tess") return IDENTITY;
  const person = id.pronouns === "he/him" ? "man" : "woman";
  return `The supplied canonical ${id.name} reference defines the ${person}'s identity only. Preserve the exact same recognizable fictional ${person}, facial structure, age, eyes, hair and proportions, while allowing natural changes in hairstyle, pose, facial expression, clothing, camera angle, framing and environment appropriate to the requested scene. Do not recreate the reference image's pose or composition unless the scene specifically calls for it. ${id.name} is a real-looking ${id.age}-year-old adult ${person} living an ordinary contemporary life. Images should resemble varied personal smartphone photos rather than repeated professional portraits. The actual profile image overrides all written appearance descriptions. Preserve its defining facial proportions, eyes, nose, mouth, jaw, complexion, approximate age and recognizable features. The same individual, not merely a similar-looking ${person}. Do not beautify them into a different person.`;
}

const WARDROBE_AND_COMPOSITION = `WARDROBE AND POSE VARIETY: The reference photograph establishes identity ONLY, not a signature wardrobe, hairstyle, pose, crop or room. Do not copy its shirt, colors, posture or selfie angle. When the scene does not specify clothing, choose one distinct, believable, context-appropriate outfit with actual garment and color details; use a varied palette including denim blue, muted teal, olive, warm brown, rust, cream, burgundy, lavender and other ordinary colors. Avoid making black or charcoal tops the habitual default. Bedtime scenes use realistic sleepwear or loungewear except when the mature_romantic category and character-approved scene call for suggestive non-nude styling; work, outdoor, errands and social photos have context-appropriate changes. Choose a plausible camera position, framing, pose and activity rather than reflexively making a centered chest-up front-camera selfie. Mirror photos only when explicitly requested or clearly part of the scene. If explicit clothing/pose/camera directions or same-day continuity are provided, honor them instead of forcing random changes. Never alter the character's actual identity to make the photo more varied.`;
const STYLE = `Use ordinary contemporary adult clothing. Avoid school uniforms, fantasy clothing, cosplay, fashion-editorial styling, or glamorous studio photography. Nothing revealing or suggestive. It should look like a real phone photo: imperfect framing, ordinary slightly messy surroundings, natural ambient light, realistic skin texture appropriate to the light and focus. Not professional photography. No text overlays, no watermarks. Never show patient or client identities, medical records, private screens, identifying paperwork or recognizable bystanders. At work, keep the background to ordinary blank or non-identifying surfaces.`;
// Camera behavior is conditional, not a post-processing filter or a new provider setting.
const PHONE_CAPTURE = `CASUAL PHONE CAPTURE: Keep this an ordinary personal phone photo, not an influencer campaign or a professionally graded editorial. Unless explicit scene/camera directions say otherwise, favor relaxed, slightly off-center framing and a plausible moment rather than a symmetric advertising pose. An incidental partial arm crop, slight camera tilt or small movement is possible, never compulsory; do not manufacture blur, awkward crops or a repeated head tilt in every photo. Respect the requested selfie/mirror/propped-camera geometry and existing visual continuity.
Use available scene light and believable phone-camera exposure and focus. Bright daylight can be clean and detailed; only dim/shadow areas may show subtle sensor noise or restrained phone sharpening. No blanket grain, fake compression blocks, heavy cinematic grading, beauty filters, aggressive HDR halos or artificial background blur. Keep requested fabric weave and ordinary skin detail natural without making every surface uniformly razor-sharp.
BACKGROUND CONTINUITY: Follow the actual established location and travel context. Do not add an iconic city skyline, landmark or spectacular scenery just to decorate the image. A Blair County setting should have plausible local scale and terrain when established; explicit travel scenes take precedence. Keep visible architecture coherent, with plausible lines and proportions. If distant surroundings are unspecified, prefer modest non-identifying background detail or natural distance softness instead of inventing a recognizable skyline. Do not introduce a new visited place, weather event or light source.`;
const PORTRAIT_PHYSICS = `PORTRAIT DETAIL, BELOW CANONICAL IDENTITY: Preserve recognizable facial anatomy, age, hair-color family and established hair texture. Hair should form natural groups and overlapping strands, with believable softness, weight, wind and contact against clothes when relevant; avoid floating, uniformly pin-straight razor-sharp fibers laid across fabric. Do not change curls, cut, color or hairstyle to achieve this. Eye catchlights should be consistent with the actual ambient light and camera angle, retaining natural iris and pupil detail; do not add milky painted highlights, a studio ring light or a different lighting setup. Retain normal skin pores, fine lines and lip texture where naturally visible, without airbrushing or exaggerating imperfections.`;
const MATURE_STYLE = `SUGGESTIVE MATURE ROMANTIC (NON-EXPLICIT): A personal smartphone photo of one clearly adult fictional person age 18 or older. Unlike an ordinary cozy or affectionate selfie, the chosen visual mood is intentionally flirtatious and sensual without nudity. When compatible with the scene, the adult character may wear realistic opaque lingerie, a coordinated bra and underwear set, a bralette, a satin slip, a flattering low neckline, or a loose open robe over underwear; the chosen clothing is optional and should reflect the character's own style, established outfit and willingness. Natural relaxed confidence, a knowing smile, warm plausible room lighting and believable front-camera or mirror geometry make it feel privately shared, not like a staged fashion shoot. Do not default to generic pajamas, blanket-only framing or a perfectly posed beauty portrait when the approved scene asks for more suggestive styling. Opaque clothing must cover nipples and genitals. No nudity, transparent/see-through fabric, explicit sexual activity, pornographic posing, minors or age ambiguity. Preserve canonical identity, physical realism, all user/character boundaries and scene continuity. The provider's content policy remains authoritative: if a request is refused, report the refusal rather than trying to evade moderation. No text overlays or watermarks.`;

const MABEL = `Mabel is Tess's rescue dog: a scruffy medium-sized brown-and-white wire-haired mutt with floppy ears. When a Mabel reference image is supplied, she is the exact same dog shown in it — same coat pattern, face, ears and approximate size, never a different breed.`;

export const includesTess = (t: TessImageType) => t !== "object";

export const sceneHasMabel = (scene: string) => /\bmabel\b/i.test(scene);
/** Only incidental fictional adults with one anchored lead; other known cast require multi-anchor validation. */
export function fictionalGroupScene(scene: string): boolean {
  return /\b(?:group (?:photo|selfie|portrait)|team (?:photo|selfie|picture)|trivia team|(?:photo|selfie|portrait) (?:of |with )?(?:everyone|the whole group)|teammates? (?:in|at|posing|standing|sitting))\b/i.test(scene);
}
export function mentionsOtherEstablishedCharacter(scene: string, lead: string): boolean {
  return ["tess", "maya", "claire", "jordan", "ben"].some(k =>
    k !== lead && new RegExp(`\\b${k}\\b`, "i").test(scene));
}


const SELFIE_LINES: Record<string, string> = {
  selfie:
    "It is a front-camera selfie she is holding at arm's length, with typical front-camera characteristics.",
  mirror: "It is a mirror photo she took of herself.",
  propped_phone: "The phone is propped on a table or counter (self-timer), so her hands are free.",
  friend_photo: "A friend who is present took the picture of her.",
};

function styleLines(style: PhotoStyle | null | undefined): string {
  if (!style) return "";
  const lines: string[] = [];
  if (style.pose_type) lines.push(`Pose: ${style.pose_type.replaceAll("_", " ")}.`);
  if (style.camera_angle) lines.push(`Camera angle: ${style.camera_angle.replaceAll("_", " ")}.`);
  if (style.crop_type) lines.push(`Framing: ${style.crop_type.replaceAll("_", " ")}.`);
  if (style.hairstyle) lines.push(`Hairstyle: ${style.hairstyle.replaceAll("_", " ")}.`);
  if (style.expression) lines.push(`Her expression: ${style.expression.replaceAll("_", " ")}.`);
  if (style.clothing_category)
    lines.push(`Clothing: ${style.clothing_category.replaceAll("_", " ")}.`);
  if (style.setting) lines.push(`Setting: ${style.setting.replaceAll("_", " ")}.`);
  const selfieLine = style.selfie_type ? SELFIE_LINES[style.selfie_type as string] : undefined;
  if (selfieLine) lines.push(selfieLine);
  return lines.length ? `\n${lines.join(" ")}` : "";
}

export function buildImagePrompt(
  type: TessImageType,
  scene: string,
  expression: string | null,
  style?: PhotoStyle | null,
  identity?: CharacterIdentity,
  photography?: PhotographyPlan,
) {
  if (identity && (!Number.isInteger(identity.age) || identity.age < 18))
    throw new Error("adult identity required");
  const personality = photography ? `\n\n${photoPersonalityPrompt(photography,style,includesTess(type))}` : "";
  const mabel = sceneHasMabel(scene) ? ` ${MABEL}` : "";
  const age = identity?.age ?? 34;
  const person = identity?.pronouns === "he/him" ? "man" : "woman";
  if (!includesTess(type)) {
    return `A casual realistic smartphone photo taken by a ${age}-year-old ${person} in the scene's established location. Scene: ${scene}.${mabel} No people's faces visible. ${STYLE}\n\n${PHONE_CAPTURE}${personality}`;
  }
  const merged: PhotoStyle = { ...style, expression: style?.expression ?? expression };
  const selfieFallback =
    !merged.selfie_type && type === "casual_selfie" ? "Use a plausible self-taken phone photo consistent with the selected framing; do not default to a centered arm’s-length portrait." : "";
  return `${identityBlock(identity)}\n\nScene: ${scene}.${styleLines(merged)}${selfieFallback ? ` ${selfieFallback}` : ""}${mabel}\n\n${type === "mature_romantic" ? MATURE_STYLE : STYLE}\n\n${WARDROBE_AND_COMPOSITION}\n\n${PHONE_CAPTURE}\n\n${PORTRAIT_PHYSICS}${personality}`;
}

export function lovableGatewayProvider(gatewayKey: string): ImageProvider {
  const ownKey = process.env["OPENAI_API_KEY"];
  const apiKey = ownKey || gatewayKey;
  const GATEWAY = ownKey ? "https://api.openai.com" : GATEWAY_URL;
  // Sunburst is the default identity-reference photo model; deployments may override explicitly.
  const supported = ["gpt-image-1-mini", "gpt-image-1.5", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"];
  const requested = process.env["OPENAI_IMAGE_MODEL"] ?? "gpt-image-2.5-sunburst";
  const model = ownKey
    ? (supported.includes(requested) ? requested : "gpt-image-2.5-sunburst")
    : "openai/gpt-image-2.5-sunburst";
  return {
    name: ownKey ? "openai" : "lovable-ai-gateway",
    model,
    referenceConditioning: !!ownKey,
    async generate(prompt, references, options) {
      const quality =
        options?.highQuality &&
        imageCapabilities(ownKey ? "openai" : "lovable-ai-gateway", model).highQuality
          ? "high"
          : "medium";
      let res: Response;
      if (references.length) {
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", prompt);
        form.set("size", "1024x1536");
        form.set("quality", quality);
        references.forEach((ref, i) =>
          form.append(
            ownKey && references.length > 1 ? "image[]" : "image",
            ref,
            i === 0 ? "tess-reference.jpg" : `mabel-reference-${i}.jpg`,
          ),
        );
        res = await fetch(`${GATEWAY}/v1/images/edits`, {
          method: "POST",
          signal: AbortSignal.timeout(90_000),
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } else {
        res = await fetch(`${GATEWAY}/v1/images/generations`, {
          method: "POST",
          signal: AbortSignal.timeout(90_000),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, size: "1024x1536", quality }),
        });
      }
      if (!res.ok) {
        const code = res.status === 400 || res.status === 422 ? "provider_invalid_request" :
          res.status === 401 || res.status === 403 ? "provider_auth_or_access" :
          res.status === 429 ? "provider_rate_limited" :
          res.status >= 500 ? "provider_server_error" : "provider_http_error";
        let fields: ReturnType<typeof safeProviderErrorFields> = {};
        try { fields = safeProviderErrorFields(await res.json()); } catch { /* no usable structured body */ }
        throw new ImageProviderFailure(code, res.status, fields);
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new ImageProviderFailure("provider_empty_result");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return {
        bytes,
        mime: "image/png",
        provider: ownKey ? "openai" : "lovable-ai-gateway",
        model,
      };
    },
  };
}

/** Safe operational errors: never retain raw provider bodies, prompts or credentials. */
/** Expose only short, structured provider identifiers, never free-form error messages. */
export function safeProviderErrorFields(payload: unknown): { code?: string; type?: string; param?: string } {
  if (!payload || typeof payload !== "object") return {};
  const e = (payload as Record<string, unknown>)["error"];
  if (!e || typeof e !== "object") return {};
  const record = e as Record<string, unknown>;
  const clean = (v: unknown): string | null =>
    typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(v) ? v : null;
  const code = clean(record["code"]), type = clean(record["type"]), param = clean(record["param"]);
  return {
    ...(code !== null ? { code } : {}),
    ...(type !== null ? { type } : {}),
    ...(param !== null ? { param } : {}),
  };
}
export class ImageProviderFailure extends Error {
  constructor(public readonly code: string, public readonly httpStatus?: number, public readonly providerError?: { code?: string; type?: string; param?: string }) {
    super(code);
  }
}
export function classifyImageFailure(error: unknown, stage: string): string {
  if (error instanceof ImageProviderFailure) return error.code;
  if (error instanceof Error) {
    if (["TimeoutError", "AbortError"].includes(error.name)) return "provider_timeout";
    if (/^api18_[a-z0-9_]{1,80}$/.test(error.message)) return error.message;
    if (error instanceof SyntaxError && stage === "provider_generation") return "provider_invalid_response";
    if (/^(unsupported_group_photo|canonical_character_missing|reference_conditioning_unverified|visual_screen_unavailable|face_structure_drift|appearance_drift|reference_obscured|face_not_visible|scene_mismatch|uncertain|visual_screen_uncertain|text_verification_unavailable)$/.test(error.message)) return error.message;
  }
  return stage === "provider_generation" ? "provider_request_failed" :
    stage === "visual_screen" ? "visual_screen_failed" :
    stage === "text_quality" ? "text_quality_check_failed" :
    stage === "canonical_reference" ? "canonical_reference_unavailable" :
    "generation_or_quality_check_failed";
}
export type PhotoDiagnostics = {
  canonicalAsset: string | null;
  canonicalSha256: string | null;
  referenceConditioning: boolean;
  provider: string;
  model: string;
  generationMode: "reference_edit" | "object_generation";
  validationStatus: "pending" | "screen_passed" | "failed";
  failureReason: string | null;
  retryCount: number;
  failureStage?: string;
  providerHttpStatus?: number;
  providerError?: { code?: string; type?: string; param?: string };
  retryReasons?: string[];
  photography?: ReturnType<typeof photographyDiagnostics>;
};
export class PhotoGenerationFailure extends Error {
  constructor(public diagnostics: PhotoDiagnostics) {
    super("Photo generation or visual screening failed");
  }
}
/** Generation uses the explicitly approved per-user reference; ordinary image output never changes it. */
export async function generateTessImage(args: {
  provider: ImageProvider;
  canonical?: (Omit<Awaited<ReturnType<typeof canonicalProfile>>, "asset"> & { asset: string }) | undefined;
  mabelReference?: Blob | null;
  type: TessImageType;
  scene: string;
  expression: string | null;
  style?: PhotoStyle | null;
  identity?: CharacterIdentity | undefined;
  text?: PhotoText | null | undefined;
  photography?: PhotographyPlan | undefined;
}) {
  const needsRef = includesTess(args.type);
  const diagnostic: PhotoDiagnostics = {
    canonicalAsset: null,
    canonicalSha256: null,
    referenceConditioning: false,
    provider: args.provider.name,
    model: args.provider.model,
    generationMode: needsRef ? "reference_edit" : "object_generation",
    validationStatus: "pending",
    failureReason: null,
    retryCount: 0,
    ...(args.photography ? {photography:photographyDiagnostics(args.photography,args.style)} : {}),
  };
  let stage = "preflight";
  try {
    const group = needsRef && fictionalGroupScene(args.scene);
    if ((group && mentionsOtherEstablishedCharacter(args.scene, args.identity?.key ?? "")) ||
        (!group && /\b(?:group (?:photo|selfie|portrait)|two (?:people|characters|women|men)|both (?:of )?us|(?:selfie|photo|portrait) (?:of |with )?(?:everyone|the whole group))\b/i.test(args.scene)))
      throw new Error("unsupported_group_photo");
    let canonical: (Omit<Awaited<ReturnType<typeof canonicalProfile>>, "asset"> & { asset: string }) | null = null;
    if (needsRef) {
      stage = "canonical_reference";
      if (!args.identity) throw new Error("canonical_character_missing");
      canonical = args.canonical ?? await canonicalProfile(args.identity.key as CharacterKey);
      diagnostic.canonicalAsset = canonical.asset;
      diagnostic.canonicalSha256 = canonical.sha256;
      if (!args.provider.referenceConditioning)
        throw new Error("reference_conditioning_unverified");
    }
    stage = "preflight";
    requireVisualScreen(); // Fail before any paid image if screening cannot run.
    const text = validatePhotoText(args.text);
    const { checkPhotoText, textVerificationAvailable } = await import("./photo-text-qc.server");
    if (text && !textVerificationAvailable()) throw new Error("text_verification_unavailable");
    const groupInstructions = group
      ? "\n\nFICTIONAL GROUP MOMENT: The approved reference image belongs ONLY to the main foreground character. Keep that character recognizable, and add 1–4 generic fictional adult teammates appropriate to the established scene. Give the teammates distinct ordinary appearances; do not claim they are known or named contacts. No real patrons, clients, patients, private screens or identifying material. Compose like a casual phone group selfie, not a studio portrait."
      : "";
    let prompt = `${buildImagePrompt(args.type, args.scene, args.expression, args.style, args.identity, args.photography)}${groupInstructions}\n\n${photoTextPrompt(text)}`;
    if(args.provider.name === "spicyapi") prompt = `${buildSpicyPrompt(args.identity!.name,args.identity!.age,args.scene,args.style??{})}\n${photoPersonalityPrompt(args.photography ?? {version:1,character:args.identity!.key,scenario:null,candidates:[],location:null,availability:"free",continuity:{hairstyle:null,clothing:null,objects:[],weather:null},continuitySource:"current_context_only",continuityReason:"explicit scene",outfitEpisode:"unestablished"},args.style)}\n${MATURE_STYLE}`;
    const references: Blob[] = [];
    if (canonical) references.push(canonical.blob); // Always primary, original portrait.
    if (args.identity?.key === "tess" && sceneHasMabel(args.scene) && args.mabelReference)
      references.push(args.mabelReference);
    diagnostic.referenceConditioning = !!canonical;
    let img: GeneratedImage | null = null;
    const retryReasons: string[] = [];
    // A rejected candidate must never be delivered or replace the original identity anchor.
    // Retry only a visual-design mismatch, once, with stronger face continuity instructions.
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryPrompt = attempt === 0 ? prompt : `${prompt}\n\nSECOND ATTEMPT — IDENTITY CONTINUITY CORRECTION: The previous candidate did not match the approved fictional character portrait. Use the ORIGINAL supplied reference as the identity source, not the prior generation. Preserve facial geometry, eye shape, nose, lips, jawline, complexion and approximate age. The requested messy bun, expression, outfit and lighting are legitimate variations and must remain possible. Do not reproduce the portrait pose or setting.`;
      stage = "provider_generation";
      const candidate = await args.provider.generate(retryPrompt, references, {
        highQuality: !!text && process.env["IMAGE_TEXT_HIGH_QUALITY"] === "true",
      });
      stage = "visual_screen";
      try {
        await screenPhotoVisuals(
          canonical?.blob ?? null,
          new Blob([new Uint8Array(candidate.bytes)], { type: candidate.mime }),
          args.scene,
          { allowBackgroundAdults: group },
        );
        img = candidate;
        break;
      } catch (screenError) {
        const reason = screenError instanceof Error ? screenError.message : "visual_screen_uncertain";
        retryReasons.push(reason);
        diagnostic.retryReasons = [...retryReasons];
        if (attempt === 0 && canonical && args.provider.allowIdentityRetry !== false && ["appearance_drift", "face_structure_drift"].includes(reason)) {
          diagnostic.retryCount = 1;
          continue;
        }
        throw screenError;
      }
    }
    if (!img) throw new Error("visual_screen_uncertain");
    stage = "text_quality";
    const textQuality = await checkPhotoText(img.bytes, img.mime, text, args.scene);
    diagnostic.validationStatus = "screen_passed";
    const identityUsed = [
      canonical ? args.identity!.key : null,
      args.identity?.key === "tess" && sceneHasMabel(args.scene) && args.mabelReference
        ? "mabel"
        : null,
    ]
      .filter(Boolean)
      .join("+");
    return {
      ...img,
      textQuality,
      diagnostics: diagnostic,
      identityReferenceUsed: identityUsed || "none",
    };
  } catch (error) {
    if(error instanceof PendingPhotoTask)throw error;
    diagnostic.validationStatus = "failed";
    diagnostic.failureStage = stage;
    diagnostic.failureReason = classifyImageFailure(error, stage);
    if (error instanceof ImageProviderFailure) {
      if (error.httpStatus) diagnostic.providerHttpStatus = error.httpStatus;
      if (error.providerError && Object.keys(error.providerError).length) diagnostic.providerError = error.providerError;
    }
    throw new PhotoGenerationFailure(diagnostic);
  }
}
