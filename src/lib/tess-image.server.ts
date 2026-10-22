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

const STYLE = `Use ordinary contemporary adult clothing. Avoid school uniforms, fantasy clothing, cosplay, fashion-editorial styling, or glamorous studio photography. Nothing revealing or suggestive. It should look like a real phone photo: imperfect framing, ordinary slightly messy surroundings, natural ambient light, realistic skin texture, maybe slight motion blur or grain. Not professional photography. No text overlays, no watermarks. Never show patient or client identities, medical records, private screens, identifying paperwork or recognizable bystanders. At work, keep the background to ordinary blank or non-identifying surfaces.`;
const MATURE_STYLE = `A non-explicit romantic personal portrait of one clearly adult fictional person aged 18 or older. Fully covered in opaque elegant sleepwear or ordinary dressy clothing, natural softly lit surroundings and realistic adult skin. No nudity, exposed breasts, genitals, transparent fabric, lingerie, boudoir, sexual activity, erotic posing, minors or age ambiguity. Do not sexualize the subject. Preserve the adult identity and natural phone-photo composition. No text overlays or watermarks. Follow the provider's content policy; do not evade moderation.`;

const MABEL = `Mabel is Tess's rescue dog: a scruffy medium-sized brown-and-white wire-haired mutt with floppy ears. When a Mabel reference image is supplied, she is the exact same dog shown in it — same coat pattern, face, ears and approximate size, never a different breed.`;

export const includesTess = (t: TessImageType) => t !== "object";

export const sceneHasMabel = (scene: string) => /\bmabel\b/i.test(scene);

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
) {
  if (identity && (!Number.isInteger(identity.age) || identity.age < 18))
    throw new Error("adult identity required");
  const mabel = sceneHasMabel(scene) ? ` ${MABEL}` : "";
  const age = identity?.age ?? 34;
  const person = identity?.pronouns === "he/him" ? "man" : "woman";
  if (!includesTess(type)) {
    return `A casual realistic smartphone photo taken by a ${age}-year-old ${person} in a mid-sized Pennsylvania city. Scene: ${scene}.${mabel} No people's faces visible. ${STYLE}`;
  }
  const merged: PhotoStyle = { ...style, expression: style?.expression ?? expression };
  const selfieFallback =
    !merged.selfie_type && type !== "tess_candid" ? SELFIE_LINES["selfie"] : "";
  return `${identityBlock(identity)}\n\nScene: ${scene}.${styleLines(merged)}${selfieFallback ? ` ${selfieFallback}` : ""}${mabel}\n\n${type === "mature_romantic" ? MATURE_STYLE : STYLE}`;
}

export function lovableGatewayProvider(gatewayKey: string): ImageProvider {
  const ownKey = process.env["OPENAI_API_KEY"];
  const apiKey = ownKey || gatewayKey;
  const GATEWAY = ownKey ? "https://api.openai.com" : GATEWAY_URL;
  const model = ownKey ? "gpt-image-1-mini" : "openai/gpt-image-2.5-sunburst";
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
      if (!res.ok) throw new Error(`image provider unavailable (${res.status})`);
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("image: empty result");
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
  };
  try {
    if (
      /\b(group (?:photo|selfie|portrait)|two (?:people|characters|women|men)|both (?:of )?us|(?:selfie|photo|portrait) (?:of |with )?(?:everyone|the whole group))\b/i.test(
        args.scene,
      )
    )
      throw new Error("unsupported_group_photo");
    let canonical: (Omit<Awaited<ReturnType<typeof canonicalProfile>>, "asset"> & { asset: string }) | null = null;
    if (needsRef) {
      if (!args.identity) throw new Error("canonical_character_missing");
      canonical = args.canonical ?? await canonicalProfile(args.identity.key as CharacterKey);
      diagnostic.canonicalAsset = canonical.asset;
      diagnostic.canonicalSha256 = canonical.sha256;
      if (!args.provider.referenceConditioning)
        throw new Error("reference_conditioning_unverified");
    }
    requireVisualScreen(); // Fail before any paid image if screening cannot run.
    const text = validatePhotoText(args.text);
    const { checkPhotoText, textVerificationAvailable } = await import("./photo-text-qc.server");
    if (text && !textVerificationAvailable()) throw new Error("text_verification_unavailable");
    const prompt = `${buildImagePrompt(args.type, args.scene, args.expression, args.style, args.identity)}\n\n${photoTextPrompt(text)}`;
    const references: Blob[] = [];
    if (canonical) references.push(canonical.blob); // Always primary, original portrait.
    if (args.identity?.key === "tess" && sceneHasMabel(args.scene) && args.mabelReference)
      references.push(args.mabelReference);
    diagnostic.referenceConditioning = !!canonical;
    const img = await args.provider.generate(prompt, references, {
      highQuality: !!text && process.env["IMAGE_TEXT_HIGH_QUALITY"] === "true",
    });
    await screenPhotoVisuals(
      canonical?.blob ?? null,
      new Blob([new Uint8Array(img.bytes)], { type: img.mime }),
      args.scene,
    );
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
    const known = [
      "unsupported_group_photo",
      "canonical_character_missing",
      "reference_conditioning_unverified",
      "visual_screen_unavailable",
      "face_structure_drift",
      "appearance_drift",
      "reference_obscured",
      "face_not_visible",
      "scene_mismatch",
      "uncertain",
      "visual_screen_uncertain",
      "text_verification_unavailable",
    ];
    diagnostic.validationStatus = "failed";
    diagnostic.failureReason =
      error instanceof Error && known.includes(error.message)
        ? error.message
        : diagnostic.canonicalAsset === null && needsRef
          ? "canonical_reference_unavailable"
          : "generation_or_quality_check_failed";
    throw new PhotoGenerationFailure(diagnostic);
  }
}
