/**
 * Character-specific category ceilings are NOT permission or assumed consent.
 * These are soft photo preferences applied after hard eligibility checks.
 * They never require a photo, change state, or bypass prior refusals.
 */
export type PhotoIntensity = "ordinary" | "mature_romantic" | "suggestive";
export type PhotoIntensityProfile = {
  maxCategory: PhotoIntensity;
  suggestiveBias: number;
  guidance: string;
};
export const PHOTO_INTENSITY_PROFILES: Record<string, PhotoIntensityProfile> = {
  tess: { maxCategory: "suggestive", suggestiveBias: 0.25,
    guidance: "Tess is selective, private and understated. A non-explicit suggestive photo is rare and must be her own idea in an established private romantic moment." },
  maya: { maxCategory: "suggestive", suggestiveBias: 0.3,
    guidance: "Maya is expressive, playful and naturally flirtatious, but everyday teasing is not a commitment. When she has independently developed genuine romantic intent and sufficient closeness, she can choose an ordinary, mature-romantic or more privately suggestive non-explicit photo. Keep the progression gradual; outfit, setting, boundaries and her choice remain real." },
  riley: { maxCategory: "suggestive", suggestiveBias: 0.75,
    guidance: "Riley can be playful and expressive with established mutual affection. She may choose a more private non-explicit photo, without being obligated by prior flirting." },
  sienna: { maxCategory: "suggestive", suggestiveBias: 0.7,
    guidance: "Sienna is a confident, spontaneous photographer who enjoys playful, artistic personal imagery. In a genuinely mutual private romantic moment when she independently wants to share a photo and suggestive is eligible, favor that bolder non-explicit category over routinely falling back to mature_romantic or an ordinary selfie. Let the result feel candid and creative rather than a staged pinup; everyday scenes remain everyday, and nightlife or photography alone never imply consent." },
  kendra: { maxCategory: "suggestive", suggestiveBias: 0.8,
    guidance: "Kendra is bold, fashion-conscious and comfortable posing. In a genuinely mutual private romantic moment when she independently wants to share a photo and suggestive is eligible, strongly favor a distinct non-explicit suggestive category over repeatedly defaulting to mature_romantic or an ordinary selfie. Express her confidence through intentional pose, framing and styling consistent with what she is actually wearing; keep everyday photos ordinary. Modeling and playful banter never imply consent or a clothing change." },
  claire: { maxCategory: "suggestive", suggestiveBias: 0.2,
    guidance: "Claire is thoughtful, affectionate and open to romance, but she treasures trust and privacy. As genuine mutual chemistry grows, she can independently choose a mature-romantic or occasionally more suggestive non-explicit photo that feels personal and unforced. It is never expected from warmth, friendship or a prior photo; honor her current relationship, outfit, place and willingness." },
  jordan: { maxCategory: "ordinary", suggestiveBias: 0,
    guidance: "Jordan's current photography stays ordinary and platonic." },
  ben: { maxCategory: "ordinary", suggestiveBias: 0,
    guidance: "Ben shares everyday photos only, never romantic pictures." },
};
export function allowedCharacterPhotoTypes(character: string, eligible: readonly string[]): string[] {
  const profile = PHOTO_INTENSITY_PROFILES[character];
  if (!profile || profile.maxCategory === "ordinary")
    return eligible.filter(t => t !== "mature_romantic" && t !== "suggestive" && t !== "mature_nude");
  if (profile.maxCategory === "mature_romantic")
    return eligible.filter(t => t !== "suggestive" && t !== "mature_nude");
  return eligible.filter(t => t !== "mature_nude");
}
export function characterPhotoIntensityHint(character: string, eligible: readonly string[]): string {
  const profile = PHOTO_INTENSITY_PROFILES[character];
  if (!profile || !eligible.some(t => t === "mature_romantic" || t === "suggestive")) return "";
  return `PHOTO CHOICE: ${profile.guidance} Allowed non-explicit categories now: ${eligible.filter(t => t === "mature_romantic" || t === "suggestive").join(", ")}. A higher category is not automatically better; use independent willingness, current place, relationship momentum and a plausible scene. The user's request is not standing consent. A character may choose an ordinary photo, decline, or say nothing. SuggestiveBias (${profile.suggestiveBias}) is a soft characterization, never a probability or a requirement. Do not invent outfit changes, private rooms or actions.`;
}

/**
 * Character-specific framing for optional non-explicit adult photos.
 * Eligibility, independent willingness, reference approval and budget checks
 * are enforced elsewhere. This hint does not bypass any of them.
 */
export function maturePhotoCharacterHint(character: string, eligibleTypes: readonly string[]): string {
  if (!eligibleTypes.includes("mature_romantic")) return "";
  if (character === "kendra") {
    return "KENDRA PHOTO PERSONALITY: As a freelance model, Kendra may naturally enjoy showing her personal style, a tasteful fashion or swimwear look, or a confident privately shared non-explicit romantic portrait when she genuinely wants to. Her modeling career is not consent, and a modeling photo is not automatically romantic. If this moment is clearly mutual and she independently chooses a more suggestive but fully covered adult image, mature_romantic is a valid option rather than automatically downgrading it to a generic ordinary selfie. Do not invent a photo shoot or override outfit, place, schedule, refusal or boundary. Keep many photos ordinary.";
  }
  if (character === "sienna") {
    return "SIENNA PHOTO PERSONALITY: Sienna is an outgoing, confident lifestyle photographer with her own late-shift schedule. In an appropriate mutually romantic moment she may independently choose to share a tasteful, flirtatious, non-explicit adult portrait; mature_romantic is a valid option rather than automatically defaulting to an ordinary selfie. Her work, flirtatious personality or relationship stage alone never imply consent. Ordinary photography, nightlife scenes, errands and everyday selfies remain ordinary. Respect existing outfit, location, schedule, refusal and boundaries.";
  }
  if (character === "riley") {
    return "RILEY PHOTO PERSONALITY: Riley is affectionate, playful and increasingly comfortable with romantic expression in an established mutual relationship. When she independently feels like sharing a privately flirtatious, tasteful non-explicit adult photo, mature_romantic is a natural valid choice rather than automatically choosing a fully ordinary selfie. Warmth or being someone's girlfriend does not create standing consent. Preserve her shift schedule, energy, current outfit and location, prior boundaries, and ability to decline; ordinary everyday and post-shift photos should remain common. Never escalate an uninvited ordinary-photo request.";
  }
  if (character === "maya") {
    return "MAYA PHOTO PERSONALITY: Maya is outgoing, spontaneous and enjoys playful flirtation; that alone never means a serious romantic connection or willingness to share a private portrait. If her own romantic intent, trust and closeness genuinely develop, she may independently choose a distinct mature-romantic photo instead of an ordinary selfie, or a suggestive non-explicit portrait when that category is eligible. Her choice is optional and gradual; do not infer private clothing or a changed location from a playful message. Keep daily photos common and honor refusal.";
  }
  if (character === "claire") {
    return "CLAIRE PHOTO PERSONALITY: Claire is warm and thoughtful, and is open to genuine romance without rushing. Once a mutual romantic bond has developed, she may privately choose a tasteful mature-romantic portrait, or occasionally a suggestive non-explicit one if independently willing and eligible. Being friendly, sharing a book or a cozy photo does not establish consent. Keep natural library, garden and everyday photos common, respect her quiet personality and existing boundaries, and never assume a wardrobe change or private setting.";
  }
  return "";
}

/** A delivered attachment remains legible as shared relationship history in later chat turns. */
export function deliveredPhotoContextLabel(type: string | null | undefined): string {
  return type === "mature_romantic"
    ? "a privately shared romantic photo"
    : type === "suggestive"
      ? "a privately shared suggestive non-explicit photo"
      : "a photo she just took";
}

/** A durable memory is only created once an actual photo has been committed. */
export function deliveredRomanticPhotoMemory(name: string, type: string | null | undefined): string | null {
  if (type === "suggestive")
    return `${name} independently chose to share a privately suggestive, non-explicit photograph in chat. This was a shared moment, not ongoing consent for future photographs.`;
  if (type === "mature_romantic")
    return `${name} independently chose to share a private romantic photograph in chat. This does not imply permission for future photographs.`;
  return null;
}
