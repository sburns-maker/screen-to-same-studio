import { z } from "zod";

export const photoTextSchema = z.object({
  exact: z.string().min(1).max(80),
  surface: z.string().min(1).max(120),
});
export type PhotoText = z.infer<typeof photoTextSchema>;
export const PHOTO_TEXT_RULES = `PHOTO TEXT: Set text_spec=null unless a specific short readable phrase is essential to this picture and grounded in the conversation. Otherwise supply text_spec={exact:<exact spelling, at most 80 characters>,surface:<one physical sign, label or note>}. Never invent book titles, logos, menus or filler lettering. For libraries/displays prefer books with page edges facing the camera, turned-away spines, distant shelves or naturally unreadable background titles. Prefer plain clothing, unbranded containers and blank screens. Keep existing privacy rules: never show private screens, patient information, name badges or identifying workplace notices. Do not promise that generated text is perfectly accurate.`;

export function validatePhotoText(value: unknown): PhotoText | null {
  if (value == null) return null;
  const result = photoTextSchema.parse(value);
  if (/[\r\n\p{Cc}\p{Cf}]/u.test(result.exact + result.surface))
    throw new Error("Unsupported photo text layout");
  return result;
}
export function photoTextPrompt(text: PhotoText | null): string {
  if (!text)
    return `TEXT COMPOSITION: No readable lettering is needed. Do not invent titles, words, logos, numbers or pseudo-writing. Compose books and printed materials with page edges facing the camera or spines turned away; keep background shelves distant or naturally out of focus. Use plain unbranded clothing and packaging. Omit incidental signs, menus, badges, posters and notices, or frame them outside the shot. Keep screens blank and private information invisible. Natural optical softness is fine; do not add artificial scribbles or blur patches.`;
  return `REQUIRED PHYSICAL TEXT: On this single surface (${JSON.stringify(text.surface)}), render exactly ${JSON.stringify(text.exact)}. Preserve every character, spelling, capitalization and punctuation; no extra words or invented lettering. Use simple readable lettering, sufficient space and an unobstructed view. The lettering belongs physically on that surface: follow its perspective, curvature, texture, shadows, ambient lighting and focus. No floating captions, pasted-on overlays or watermarks. Keep all other incidental text absent or naturally too distant to read. Preserve casual phone-photo lighting and composition; do not make the entire photograph unnaturally sharp. Privacy restrictions take priority.`;
}
export function imageCapabilities(name: string, model: string) {
  const direct = name === "openai" && ["gpt-image-1-mini", "gpt-image-1.5", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(model);
  return {
    explicitTextPrompt: true,
    referenceConditioning: direct ? "supported" : "existing-route-unverified",
    imageEditing: direct ? "supported" : "unverified",
    maskedInpainting: direct ? "not-integrated" : "unverified",
    highQuality: direct,
    targetedRegeneration: false,
    exactTextGuarantee: false,
  };
}

export function textProneScene(scene: string): boolean {
  return /\b(librar\w*|books?\b|bookshel\w*|spines?|sign(?:age)?|posters?|menus?|labels?|packaging|printed|handwrit\w*|notes?|badges?|storefronts?|street signs?)\b/i.test(
    scene,
  );
}
