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
  directOrdinaryRequest?: boolean;
}): string {
  const { character, opportunitySelected, eligibleTypes, currentSetting } = args;
  if (args.directOrdinaryRequest) {
    const ordinary = eligibleTypes.filter(type => !["mature_romantic", "suggestive", "mature_nude"].includes(type));
    if (!ordinary.length) return "No ordinary photograph is permitted right now. photo=null; answer honestly without promising an attachment.";
    return [
      "DIRECT EVERYDAY PHOTO REQUEST: The player asked for an ordinary picture. This is a normal question, not automatically an intimacy test, romantic escalation, pressure or reason to tease/deflect.",
      `You CAN take and send a fresh photograph right now if comfortable, using only these currently allowed ordinary types: ${ordinary.join(", ")}. Honor known outfit and scene details; if unspecified, ordinary plausible clothes and a simple consistent background are fine. If the request is for your face, consider a casual selfie or candid if allowed; if it is for an object or place, an object photo is fine.`,
      "Make a genuine choice before drafting the response. If happy to share, return a complete generated photo action with willing=true, contextual=true, framing=ordinary, an eligible ordinary type and a specific present-moment scene, plus a short natural caption. Do not merely say you might send one later.",
      "An ordinary selfie does not require new romantic feelings or suggestive framing. Do NOT escalate an ordinary-photo request into a mature or suggestive photo, even when those categories are independently eligible.",
      "If busy, uncomfortable or maintaining a real photo boundary, photo=null is valid. Answer plainly and briefly; do not manufacture a rejection ritual or treat the mere request as misconduct. Repeated requests after an actual refusal can warrant firmer boundaries.",
    ].join("\n");
  }
  if (!eligibleTypes.length) return "No permitted photograph right now; photo=null.";
  if (!opportunitySelected) return [
    "ORDINARY PHOTO CHOICE: Without a special event or user request, you may independently share an ordinary image of your actual outfit, a pet, dinner, purchase, interesting object, or view.",
    "Evaluate photo, photo with a short contextual caption, ordinary text, and silence as separate valid options. Never fabricate a moment, force a photo, or bypass cost, privacy and relationship safeguards.",
    `Available types: ${eligibleTypes.join(", ")}. Use only eligible categories and a location consistent with schedule; mundane unspecified outfits, objects and background details can be filled plausibly. An object or scene photo is normal communication; no romantic context is needed.`,
    "A photo is optional; photo=null remains a genuine character decision, not a generation failure.",
  ].join("\n");
  const types = eligibleTypes.join(", ");
  const profile = PHOTO_INTENSITY_PROFILES[character];
  const privateMoment =
    /\b(?:at home|home relaxing|home alone|at (?:her|his|my) (?:house|apartment|place)|in (?:her|his|my) (?:bedroom|living room)|townhouse|private residence|on (?:her|his|my) couch)\b/i.test(currentSetting) &&
    !/\b(?:clinic|hospital|work|working|office|public|restaurant|store|errands|shift|customers|venue)\b/i.test(currentSetting);
  const allowedSuggestive = eligibleTypes.includes("suggestive") && profile?.maxCategory === "suggestive";
  return [
    "ACTIVE PHOTO OPPORTUNITY: Before writing a text, make a fresh independent choice: (a) an image you genuinely want to share from the current moment, with an appropriate eligible category and a brief caption; (b) ordinary text only; or (c) no message. photo=null is a complete, valid choice. Do not choose a photo just because the app offered this moment.",
    `Available categories for THIS turn: ${types}. If sharing a photo, choose its category and actual scene intentionally; do not always downgrade a mutually wanted private adult portrait to a generic selfie, or upgrade an everyday snapshot to be suggestive.`,
    allowedSuggestive && privateMoment
      ? `PRIVATE ROMANTIC PHOTO OPTION: Current established setting is private and suggestive is eligible. ${profile.guidance} If you personally feel playful, affectionate and comfortable, a suggestive non-explicit image is one possible autonomous choice alongside ordinary photo, mature romantic or no photo. Preserve known outfit, actual privacy and setting. When outfit or background was never specified, plausible ordinary details are allowed; prior flirting never obligates you.`
      : allowedSuggestive
        ? "Although suggestive is technically eligible, this current setting does not establish a private photo moment. For this opportunity favor an ordinary context-appropriate image or no photo rather than inventing privacy, a new location or an outfit change."
        : "Do not choose a romantic or suggestive photo category unless it appears in the eligible list; an ordinary image or photo=null can be the right answer.",
    "If you do choose an image, return the actual complete photo action (willing=true, contextual=true, accurate framing, permitted type, concrete scene); do not merely promise a future photo. If you decline, return photo=null without inventing one. Do not alter your boundaries or the relationship to make a category eligible.",
  ].join("\n");
}
