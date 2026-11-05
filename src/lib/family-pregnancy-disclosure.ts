import {z} from "zod";
export const pregnancyDisclosureActionSchema=z.object({
  eventId:z.string().uuid(),
  quote:z.string().min(3).max(300),
}).nullable();
export type PregnancyDisclosureAction=z.infer<typeof pregnancyDisclosureActionSchema>;
export const PREGNANCY_DISCLOSURE_RULES = `FICTIONAL PREGNANCY DISCOVERY: pregnancy_disclosure_action normally null. Only if your private canonical world context explicitly provides a due pregnancy event ID and its result may you choose independently to share that result in your own visible words and set pregnancy_disclosure_action={eventId:exact provided ID,quote:exact contiguous passage from your outgoing message}. Do not invent pregnancy results, infer them from intimacy, promise outcomes, or treat an undisclosed result as player knowledge. You may delay disclosure; your character's autonomy applies. This is an accelerated fictional time system, not medical advice.`;
export function validPregnancyDisclosure(
 action:PregnancyDisclosureAction,body:string,eligible:readonly string[],
 status?:"positive"|"negative",
) {
 if(!action?.eventId || !action.quote || !body.includes(action.quote) || !eligible.includes(action.eventId))return false;
 if(!status)return true;
 const text=body.toLowerCase();
 return status==="positive"
   ? /\b(?:i(?:['’]m| am) pregnant|we(?:['’]re| are) expecting|pregnancy test (?:was |is )?positive|test (?:came back|was) positive)\b/.test(text)
   : /\b(?:not pregnant|pregnancy test (?:was |is )?negative|test (?:came back|was) negative)\b/.test(text);
}

/** Model-facing, player-safe continuity for the latest already disclosed result.
 * A negative conception roll never creates a pregnancy or miscarriage event.
 */
export function disclosedPregnancyResultGuidance(
  status: "positive" | "negative",
  disclosedAt: string,
): string {
  if (status === "negative") {
    return `AUTHORITATIVE ALREADY-SHARED FICTIONAL RESULT (${disclosedAt}): The most recently disclosed conception roll was NEGATIVE: no pregnancy resulted from that encounter. This is NOT a miscarriage, pregnancy loss, death of a baby, or termination of an established pregnancy. Do not invent a pregnancy-loss history, grief/trauma narrative, physical recovery, or ongoing depressive state from this negative roll. The character may have ordinary, proportionate disappointment if pregnancy was hoped for, but should continue her normal personality, relationship, work, jokes, and daily routines. The player already knows: NEVER announce the same result as fresh news or repeatedly center conversation on it. Do not override another independently verified active pregnancy if one exists.`;
  }
  return `AUTHORITATIVE ALREADY-SHARED FICTIONAL RESULT (${disclosedAt}): The most recently disclosed conception result was POSITIVE and has ALREADY been communicated to the player. Never announce the same result as new again. Refer to it naturally only when relevant, preserving canonical lifecycle status and independently recorded outcomes.`;
}
