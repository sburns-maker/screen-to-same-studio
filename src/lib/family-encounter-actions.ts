import { z } from "zod";
/** Optional structured acknowledgement of a completed adult intimate encounter.
 * Model output is evidence of the character's own choice, never player consent.
 */
export const encounterActionSchema=z.object({
  action:z.literal("completed"),
  quote:z.string().min(3).max(300),
}).nullable();
export type EncounterAction=z.infer<typeof encounterActionSchema>;
export const ENCOUNTER_ACTION_RULES = `OPTIONAL FAMILY-LIFE ENCOUNTER RECORD: encounter_action is normally null. Only during an actual ongoing LIVE EXPERIENCE in which the player has already clearly and voluntarily confirmed a mutually wanted, completed off-screen adult intimate encounter, and you independently agree that it happened, may you set encounter_action={action:"completed",quote:"exact contiguous words from YOUR own current visible dialogue indicating your consent and that the encounter actually occurred"}. This is world bookkeeping, not a request to narrate sexual details. Never mark proposals, future plans, flirting, touching, a kiss, an assumed hookup, hesitation, or a refusal as a completed encounter. Never assert the player's consent on their behalf. Outside a live experience always use null.`;
const HYPOTHETICAL=/\?|\b(?:if|wish|would|could|should|might|maybe|pretend|fantasy|someday|tomorrow|later|want to|wanna|let['’]s|going to|gonna|plan to|hope to|not|never|don['’]t|didn['’]t|stop|wait)\b/i;
const COMPLETED=/\b(?:(?:have|had|having) sex|slept together|sleep together|made love|make love|making love|hooked up|(?:spend|spent|spending) the night together as lovers|(?:progress(?:es|ed)?|went|go(?:es)?) beyond kissing)\b/i;
/** Player narration that an adult encounter actually happened (non-graphic). Proposals, kisses, attraction and hypotheticals never count. */
export function completedEncounterNarration(text:string) {
 return (text.match(/[^.!?\n]+[.!?]?/g) ?? []).some(c=>COMPLETED.test(c) && !HYPOTHETICAL.test(c));
}
const CONSENT=/\b(?:i want (?:you|this|that|to keep going|some privacy|some time alone)|i want to\b|come back to my place|i['’]m glad we chose this|i(?:['’]d| would) like to keep kissing you)\b/i;
const REFUSAL=/\b(?:i don['’]t want|not tonight|i['’]m not ready|slow down|i need to stop|let['’]s stop)\b/i;
/** Deterministic, idempotent reconciliation over recorded moments: first confirmed player narration of a completed encounter, after the character's own willingness and without a later refusal. */
export function reconcileExperienceEncounter(moments:{id:string;source:string;body:string;confirmed?:boolean;created_at:string}[]) {
 let consent=false;
 for (const m of moments) {
  if (m.source==="character") { if (REFUSAL.test(m.body)) consent=false; else if (CONSENT.test(m.body)) consent=true; continue; }
  if (m.source==="user" && m.confirmed!==false && consent && completedEncounterNarration(m.body)) return m;
 }
 return null;
}
export function experienceEncounterId(experienceId:string){ return `experience:${experienceId}`; }
export function verifyEncounterAction(action:EncounterAction,characterText:string,userText:string) {
 if(!action?.quote || !characterText.includes(action.quote))return false;
 return completedEncounterNarration(userText);
}
