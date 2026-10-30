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
    : "a photo she just took";
}
