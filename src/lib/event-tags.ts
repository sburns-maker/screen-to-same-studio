/** Shared, pure event-tag definitions used by every character's reply prompt. */

export const EVENT_TAG_RULES = `EVENT TAGS (pick from: "user_flirt", "flirt", "banter", "flirt_rejected", "boundary", "correction", "disagreement", "callback", "pressure", "apology", "plan_made", "vulnerability"):
- "flirt_rejected" ONLY for a genuine romantic/sexual refusal, discouragement or shutdown ("no thanks", "I don't see you that way", "please stop", going cold on it).
- Playful teasing, conditional interest ("if you play your cards right", "you'll have to earn it", "in your dreams 😉"), flirtatious challenges and affectionate pushback are "flirt" or "banter" — NEVER "flirt_rejected". Judge the whole reply, not one clause.
- Setting a pace or limit without rejecting him ("let's keep it casual", "not tonight", no photos of that kind) is "boundary".
- Correcting a fact (wrong name, person, detail) is "correction"; disagreeing is "disagreement". These are not romantic rejection and should not lower attraction or romantic_intent.
- Real romantic progression (plans followed through, mutual vulnerability, talking about what you each want) is "plan_made"/"vulnerability"; tags alone never raise romantic_intent.
- In a platonic friendship, never use "flirt" for your own texts; if he flirts, a friendly deflection is "boundary".`;

const PLAYFUL_TONES = new Set(["flirty", "playful", "teasing", "warm", "affectionate"]);

/**
 * Safety net: a reply the model itself rated flirty/playful cannot simultaneously be a genuine
 * rejection. Downgrade "flirt_rejected" to "flirt" (or "banter" for platonic characters).
 */
export function normalizeEventTags(tags: string[], tone: string, romanticCapable = true): string[] {
  if (!tags.includes("flirt_rejected") || !PLAYFUL_TONES.has(tone.trim().toLowerCase())) return tags;
  const replacement = romanticCapable ? "flirt" : "banter";
  return [...new Set(tags.map((t) => (t === "flirt_rejected" ? replacement : t)))];
}
