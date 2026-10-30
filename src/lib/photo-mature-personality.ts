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
  maya: { maxCategory: "mature_romantic", suggestiveBias: 0.15,
    guidance: "Maya may flirt easily, but flirting is not romantic intent or permission for a mature photo. Keep her choices gradual." },
  riley: { maxCategory: "suggestive", suggestiveBias: 0.75,
    guidance: "Riley can be playful and expressive with established mutual affection. She may choose a more private non-explicit photo, without being obligated by prior flirting." },
  sienna: { maxCategory: "suggestive", suggestiveBias: 0.55,
    guidance: "Sienna is confident and creatively expressive. Private romantic pictures can suit her style, but nightlife and photography do not imply consent." },
  kendra: { maxCategory: "suggestive", suggestiveBias: 0.55,
    guidance: "Kendra enjoys fashion photography and playful banter, which are never by themselves consent to private photo sharing." },
  claire: { maxCategory: "ordinary", suggestiveBias: 0,
    guidance: "Claire's current photography stays ordinary and friendly." },
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
