import { z } from "zod";
/** Optional structured acknowledgement of a completed adult intimate encounter.
 * Model output is evidence of the character's own choice, never player consent.
 */
export const encounterActionSchema=z.object({
  action:z.literal("completed"),
  quote:z.string().min(3).max(300),
}).nullable().optional();
export type EncounterAction=z.infer<typeof encounterActionSchema>;
export const ENCOUNTER_ACTION_RULES = `OPTIONAL FAMILY-LIFE ENCOUNTER RECORD: encounter_action is normally null. Only during an actual ongoing LIVE EXPERIENCE in which the player has already clearly and voluntarily confirmed a mutually wanted, completed off-screen adult intimate encounter, and you independently agree that it happened, may you set encounter_action={action:"completed",quote:"exact contiguous words from YOUR own current visible dialogue indicating your consent and that the encounter actually occurred"}. This is world bookkeeping, not a request to narrate sexual details. Never mark proposals, future plans, flirting, touching, a kiss, an assumed hookup, hesitation, or a refusal as a completed encounter. Never assert the player's consent on their behalf. Outside a live experience always use null.`;
export function verifyEncounterAction(action:EncounterAction,characterText:string,userText:string) {
 if(!action?.quote || !characterText.includes(action.quote))return false;
 const player=userText.toLowerCase().trim();
 if(/\b(?:if|wish|would|might|maybe|pretend|fantasy|someday|tomorrow|later|not|don't|stop|wait)\b/.test(player))return false;
 return /\b(?:we (?:slept together|made love|had sex|hooked up))\b/.test(player);
}
