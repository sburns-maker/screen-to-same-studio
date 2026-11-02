import { z } from "zod";

/** Structured fictional pregnancy actions, emitted by the CHARACTER, not the player.
 * Validators require an exact quote in the committed character message.
 */
export const pregnancyCharacterActionSchema = z.discriminatedUnion("kind", [
 z.object({kind:z.literal("decision"),lifecycleId:z.string().uuid(),choice:z.enum(["continue","abortion","adoption"]),quote:z.string().min(3).max(400)}),
 z.object({kind:z.literal("appointment"),lifecycleId:z.string().uuid(),appointmentKind:z.enum(["confirmation","prenatal","ultrasound","screening","postpartum"]),at:z.string().datetime({offset:true}),quote:z.string().min(3).max(400)}),
 z.object({kind:z.literal("labor"),lifecycleId:z.string().uuid(),quote:z.string().min(3).max(400)}),
 z.object({kind:z.literal("outcome"),lifecycleId:z.string().uuid(),outcome:z.enum(["ended_birth","ended_abortion","ended_miscarriage"]),quote:z.string().min(3).max(400)}),
]).nullable();

export type PregnancyCharacterAction = z.infer<typeof pregnancyCharacterActionSchema>;
export const PREGNANCY_CHARACTER_ACTION_RULES = `FICTIONAL PREGNANCY LIFE: pregnancy_character_action is normally null. You may autonomously make decisions, book medical visits, or describe labor only for an existing canonical active pregnancy lifecycle ID explicitly given in private character context. Use an action only when your own outgoing message contains an exact contiguous quote supporting the action. No action from player text alone. Never invent a pregnancy, force an outcome, invent medical diagnoses, or claim a birth is complete without a witnessed in-world event. Your character retains autonomy; discussions are not decisions.`;
export function validPregnancyCharacterAction(
 action:PregnancyCharacterAction,body:string,eligibleLifecycleIds:readonly string[],
) {
 return !!action && eligibleLifecycleIds.includes(action.lifecycleId) &&
  body.includes(action.quote) && action.quote.trim().length>=3;
}
