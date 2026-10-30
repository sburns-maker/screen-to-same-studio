import type { CharacterKey } from "./characters";
import { PHOTO_INTENSITY_PROFILES } from "./photo-mature-personality";

/**
 * Instructions only: the AI still chooses whether to send and what to send.
 * The caller must supply categories already filtered through relationship,
 * boundaries, photography preference and current technical eligibility.
 */
export function photoChoiceInstruction(args: {
  character: CharacterKey;
  opportunitySelected: boolean;
  eligibleTypes: readonly string[];
  currentSetting: string;
}): string {
  const { character, opportunitySelected, eligibleTypes, currentSetting } = args;
  if (!opportunitySelected || eligibleTypes.length === 0) return "Usually null.";
  const types = eligibleTypes.join(", ");
  const profile = PHOTO_INTENSITY_PROFILES[character];
  const privateMoment =
    /\\b(?:at home|home relaxing|home alone|at (?:her|his|my) (?:house|apartment|place)|in (?:her|his|my) (?:bedroom|living room)|townhouse|private residence|on (?:her|his|my) couch)\\b/i.test(currentSetting) &&
    !/\\b(?:clinic|hospital|work|working|office|public|restaurant|store|errands|shift|customers|venue)\\b/i.test(currentSetting);
  const allowedSuggestive = eligibleTypes.includes("suggestive") && profile?.maxCategory === "suggestive";
  return [
    "ACTIVE PHOTO OPPORTUNITY: Before writing a text, make a fresh independent choice: (a) an image you genuinely want to share from the current moment, with an appropriate eligible category and a brief caption; (b) ordinary text only; or (c) no message. photo=null is a complete, valid choice. Do not choose a photo just because the app offered this moment.",
    `Available categories for THIS turn: ${types}. If sharing a photo, choose its category and actual scene intentionally; do not always downgrade a mutually wanted private adult portrait to a generic selfie, or upgrade an everyday snapshot to be suggestive.`,
    allowedSuggestive && privateMoment
      ? `PRIVATE ROMANTIC PHOTO OPTION: Current established setting is private and suggestive is eligible. ${profile.guidance} If you personally feel playful, affectionate and comfortable, a suggestive non-explicit image is one possible autonomous choice alongside ordinary photo, mature romantic or no photo. Keep the existing outfit, privacy, and actual setting. Prior flirting never obligates you.`
      : allowedSuggestive
        ? "Although suggestive is technically eligible, this current setting does not establish a private photo moment. For this opportunity favor an ordinary context-appropriate image or no photo rather than inventing privacy, a new location or an outfit change."
        : "Do not choose a romantic or suggestive photo category unless it appears in the eligible list; an ordinary image or photo=null can be the right answer.",
    "If you do choose an image, return the actual complete photo action (willing=true, contextual=true, accurate framing, permitted type, concrete scene); do not merely promise a future photo. If you decline, return photo=null without inventing one. Do not alter your boundaries or the relationship to make a category eligible.",
  ].join("\n");
}
