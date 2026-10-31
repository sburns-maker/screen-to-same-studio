import { SCHEDULE_RULES } from "./calendar-contract";
import { CONTINUITY_RULES } from "./world-continuity";
import { KNOWLEDGE_RULES } from "./social-logic";

/**
 * Interactive encounters are acted scenes, not SMS. Keep response-schema
 * instructions without passing unrelated texting/photo-generation policies.
 * This deliberately does not decide whether the character wants intimacy.
 */
export function inPersonSystem(system: string): string {
  return system
    .replace("texting someone you know.", "interacting with someone in person at the recorded scene.")
    .replace(/Respond as ([^.\n]+) would naturally text\./, "Respond as $1 would naturally speak and act in person.");
}

export function inPersonOutputRules(name: string, romanticCapable: boolean): string {
  return `IN-PERSON EXPERIENCE OUTPUT (OVERRIDES TEXTING-ONLY FORMAT RULES)
${SCHEDULE_RULES}
${CONTINUITY_RULES}
${KNOWLEDGE_RULES}
- messages: ONE concise, coherent first-person in-person scene beat as ${name}, with natural dialogue and grounded actions. This is NOT an SMS message, caption or phone conversation. Never narrate the player's unrecorded actions, feelings, consent or replies.
- Treat the most recent actual scene action or question as immediate; no unrelated older topic pivot. Do not recycle the same reassuring phrase, kiss, forehead touch or staying-close description turn after turn. If the scene has settled, a new ordinary activity, conversation topic, meaningful pause, or natural goodbye is more realistic than rephrasing the same moment. You may still be affectionate when you genuinely wish to.
- The character's current decision is real. If she said she does not want to go further today, maintain that boundary for today's scene; never treat repeated invitations as a reason to reverse it. Wanting someone, kissing, or being on a date never implies consent to more. She can be direct about her choice without delivering repetitive pacing speeches.
- Romance and an off-screen consensual hookup remain possible in other circumstances, when BOTH adults independently choose them. An explicit mutual choice may transition non-graphically; never fabricate that choice or treat marriage, pregnancy or exclusivity as automatic consequences.
- send_delay_seconds: 0 (not relevant during an interactive in-person scene).
- photo: null; photo_boundary_decision: unchanged. Phone photo eligibility, framing, captions and camera requests do not apply to this experience.
- state_delta: integer changes per dimension, usually 0, with modest changes only for actual interaction. ${romanticCapable ? "Mutual adult affection is not automatically pressure or an award; explicit declined escalation must be respected." : "Keep romantic_attraction and physical_attraction at exactly 0 for this platonic character."}
- memory_candidates: preserve genuinely consequential shared experiences, new decisions, affection, boundaries and plans that really occurred; never invent unrecorded milestones. Use memory_type relationship, personal or fact and importance 1–5.
- character_perspective: 1–3 sentences of freshly authored private character fiction reflecting what the character genuinely thinks right now; never leak it into messages. Null only if no reply.
- tone: one descriptive word.
- event_tags: classify the player's actual behavior independently of the character's actual response; normal affection does not force a flirt tag or consent. All other structured fields follow their existing schemas.`;
}
