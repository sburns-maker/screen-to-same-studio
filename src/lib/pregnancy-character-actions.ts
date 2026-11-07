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

/** Prompt-only guidance. Canonical lifecycle and action validators remain authoritative.
 * Applies across text, autonomous turns and live experiences without assigning decisions.
 */
export function pregnancyProgressionGuidance(
 character: string,
 messages: readonly {sender:string;body:string}[],
 canonicalContext: readonly string[],
): string {
 const canon = canonicalContext.join(" ").toLowerCase();
 // A speculative player question is not proof of a pregnancy. Require the
 // character's own disclosure or a canonical world/memory pregnancy fact.
 const verified = /\b(?:pregnan(?:cy|t)|positive (?:pregnancy )?test|test (?:was|came back) positive|gestation|prenatal)\b/i.test(canon) ||
   messages.some(m => m.sender !== "user" && /\b(?:i(?:'|’)?m pregnant|my pregnancy|pregnancy test (?:was|is) positive|(?:i )?(?:got|had) a positive (?:pregnancy )?(?:test|result))\b/i.test(m.body));
 if (!verified) return "";
 const recent = messages.slice(-20);
 if (!recent.some(m => /\b(?:pregnan(?:cy|t)|positive (?:test|result)|doctor(?:'s)? appointment|be (?:a )?(?:mom|mother)|having (?:a )?baby)\b/i.test(m.body))) return "";
 const own = recent.filter(m => m.sender !== "user").map(m => m.body);
 const hesitations = own.filter(s => /\b(?:scared|afraid|numb|overwhelmed|don't know (?:what|if)|do not know (?:what|if)|need (?:a little )?time|not ready|everything (?:could|will) change|figure (?:it|this|everything) out)\b/i.test(s)).length;
 // Repeating "I haven't talked to the doctor" is a progression loop, not
 // meaningful new context. Count character replies only (not player questions).
 const doctorDeferrals = own.filter(s => /\b(?:haven't|have not|hasn't|has not|not yet|still need to|need to|going to|will|should|tomorrow|next week|haven't gotten around to)\b.{0,100}\b(?:doctor|ob|obgyn|midwife|clinic|prenatal|appointment|call)\b|\b(?:doctor|ob|midwife|clinic|appointment)\b.{0,70}\b(?:haven't|have not|not yet|tomorrow|next week)\b/i.test(s)).length;
 const approaches: Record<string,string> = {
  tess: "Tess tends to think carefully and speak plainly. Let her identify one specific unknown, propose a realistic next step if she wants it, or privately weigh a concrete implication rather than restating a general fear. Her caution is not paralysis.",
  kendra: "Kendra genuinely wants motherhood and a loving family. When an existing, confirmed pregnancy is wanted, her natural reaction can be openly excited, affectionate, hopeful, and eager to share plans for the future—perhaps with some practical nerves. She can initiate conversations about children and family without waiting for the player to lead. Do not default to generic fear, indecision, or modeling-career anxiety. Her actual feelings depend on circumstances and saved history, and her autonomy and decisions are always hers. Do not infer or invent pregnancy, partner agreement, medical outcomes, or a decision to continue.",
  riley: "Riley may process events in an associative, practical way influenced by her work schedule and existing relationship; don't imitate Tess's reserved phrasing or Kendra's bravado.",
  maya: "Maya may reach for candid conversation and actionable plans without turning the situation into a performance or teasing test.",
  sienna: "Sienna can respond proactively, with direct statements and personal priorities rather than a repeated reassurance loop.",
  claire: "Claire tends to be thoughtful and deliberate, but can ask direct questions and act on concrete information rather than endlessly analyzing.",
 };
 const voice = approaches[character] ?? "Follow this person's own established history and preferences rather than copying another character's pregnancy reaction.";
 return `PREGNANCY STORY CONTINUITY (only if this character's canonical context confirms pregnancy; do not infer new events):
${voice}
Do not default to the same 'scared, don't know, need time, thank you' monologue. Uncertainty can persist without repeated dialogue. Preserve what this character has already disclosed and decided, and do not fabricate a medical result, booked appointment, changed gestational stage, or decision.
${hesitations >= 2 ? "STALL SIGNAL: Multiple recent character messages already expressed uncertainty. Unless a new question genuinely calls for it, prefer a distinct next beat from established reality: a concrete question, privately initiated research, a request for space, a practical discussion, or an independently chosen eligible action. Do not automatically book, decide, disclose, or advance time. A brief ordinary non-pregnancy interaction is also valid." : "If it fits this turn, give a distinct, character-specific reaction or useful concrete detail rather than generic reassurance."}
Pregnancy is an ongoing part of ordinary life, not only a response when the player brings it up: on suitable turns proactively mention a stage-appropriate change, an existing plan or a specific practical step, without making every message about pregnancy. The time-based gestational stage comes ONLY from canonical lifecycle context. If no appointment is confirmed, be direct about what is actually arranged versus merely considered.
${doctorDeferrals >= 2 ? "DOCTOR LOOP DETECTED: This character has already repeated an uncompleted doctor/appointment plan. Do not repeat 'I still haven't talked to the doctor', promise another vague call tomorrow, or silently mark a visit done. Independently choose a concrete next beat in her own voice: ask to pick a real time to call now, explain a specific obstacle, suggest an eligible appointment with an explicit date/time via structured action, or clearly decline for a personal reason. If a visit is still outstanding, state that fact once and move the conversation beyond it." : "If the character mentions seeing a doctor, differentiate considering a visit, a proposed visit, an actually scheduled visit, and a completed visit. Do not automatically stall at the planning stage."}
Use medical context's recorded appointments and pending milestones to maintain chronology: do not replay an initial appointment after its completion, claim a screening occurred without a recorded event, or treat a proposed appointment as booked. If a milestone becomes due, choose a distinct plausible narrative beat (planning, preparations, reflections, support, work/household adjustments) without fabricating a medical visit or result.
Any decision or appointment must be independently chosen, explicitly said, supported by a canonical lifecycle ID, and recorded only through validated structured actions. Never force a pregnancy outcome.`;
}
