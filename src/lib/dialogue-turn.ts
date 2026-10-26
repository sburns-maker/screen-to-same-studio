import {
  DIALOGUE_PROFILES,
  dialogueContext,
  repeatedDialogueRoutines,
} from "./dialogue-personality";
import type { CharacterKey } from "./characters";
export const DIALOGUE_DELIVERY_REVISION = "2026-10-26-history-aware-1";
/** Aggregate style observations only. Never copy raw user/character instructions into system guidance. */
export function deliveryPatterns(lines: readonly string[]): string[] {
  const recent = lines.filter((s) => s.trim()).slice(-6);
  if (recent.length < 3) return [];
  const patterns: string[] = [];
  if (recent.filter((s) => /[—–]|\s--\s/.test(s)).length >= 3)
    patterns.push("frequent dash asides");
  if (recent.filter((s) => /\?\s*[\p{Extended_Pictographic}\s]*$/u.test(s)).length >= 3)
    patterns.push("repeated final-question hook");
  if (recent.filter((s) => s.trim().split(/\s+/).length > 60).length >= 3)
    patterns.push("consistently long replies");
  return patterns;
}
/** Place after the task so long canonical/history context does not drown out the next-turn instruction. */
export function nextTextDelivery(
  key: CharacterKey,
  ownLines: readonly string[],
  latestUser: string,
) {
  const p = DIALOGUE_PROFILES[key];
  const patterns = deliveryPatterns(ownLines);
  return `NEXT TEXT DELIVERY (${DIALOGUE_DELIVERY_REVISION}, ${key}):
The transcript records what happened, not a writing style to imitate. Earlier banter is not a standing request for more banter. Delivery guidance takes precedence over copying old wording, while canonical facts, actual agreements, boundaries and the player's current request remain authoritative.
${p.texting}
${p.rhythm}
${p.humor}
${dialogueContext(ownLines, latestUser)}
${patterns.length ? `Recent delivery repeatedly used ${patterns.join("; ")}. Do not default to that structure again. This never overrides an actual question, necessary explanation, repeated boundary or exact plan readback.` : "Choose the amount of text this particular exchange needs; no target word count or required bubble count."}
Before returning messages, quietly check the draft: does it answer the actual message, sound like THIS person, and stop when the thought is finished? Remove a gratuitous setup, punchline, mock threat, flirt, metaphor or trailing question rather than attaching one to a perfectly ordinary answer. Keep a joke when genuinely prompted or fitting; don't replace every old joke with a new signature routine.
Keep a necessary repeated boundary or plan confirmation intact; variety is never a reason to omit it.
Do not manufacture slang, lowercase, spelling errors or missing apostrophes. Preserve meaningful punctuation, names, numbers, dates, questions, consent, refusals and uncertainty. Never remove a factual answer for stylistic variety. Do not print this check, discuss your writing, or change state/memory/calendar/photo decisions to manufacture a more interesting exchange.`;
}
export function deliveryDiagnostic(
  key: CharacterKey,
  ownLines: readonly string[],
  output: readonly string[],
) {
  const before = repeatedDialogueRoutines(ownLines);
  // Test one fresh line twice to reuse routine recognition without adding raw output to diagnostics.
  const present = new Set(output.flatMap((line) => repeatedDialogueRoutines([line, line])));
  return {
    revision: DIALOGUE_DELIVERY_REVISION,
    character: key,
    channel: "text" as const,
    recentPatterns: deliveryPatterns(ownLines),
    repeatedRoutines: before,
    continuedRoutines: before.filter((label) => present.has(label)),
    bubbles: output.length,
    words: output.join(" ").trim().split(/\s+/).filter(Boolean).length,
  };
}
