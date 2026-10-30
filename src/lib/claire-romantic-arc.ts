import type { TessState } from "./tess-logic";

/**
 * A potential inner question, not an agreement to date. Use the same conservative
 * read in Claire's reply context and developer Mind summary.
 */
export function claireMayBeReconsideringFriendship(state: TessState): boolean {
  return state.comfort >= 70 &&
    state.trust >= 55 &&
    state.emotional_intimacy >= 45 &&
    state.romantic_attraction >= 40 &&
    state.romantic_intent >= 15 &&
    state.perceived_pressure < 15 &&
    state.irritation < 20;
}

type SpeakerMessage = { sender: string; body: string | null };

const EXPLICIT_FRIENDSHIP = /\b(?:as friends|just friends|as a friend|friends(?:hip)? only|keep (?:it|things|this) (?:platonic|as friends)|we (?:agreed|said|talked) (?:to be|about being) friends)\b/i;

export function claireHasExpressedFriendshipBoundary(
  messages: readonly SpeakerMessage[],
  memories: readonly string[],
): boolean {
  const ownWords = messages.some(m => m.sender === "tess" && EXPLICIT_FRIENDSHIP.test(m.body ?? ""));
  return ownWords || memories.some(m => EXPLICIT_FRIENDSHIP.test(m));
}

/**
 * Ground a new, private possibility in positive relationship state without
 * rewriting a previous friendship agreement or treating scores as consent.
 */
export function clairePrivateRomanticOutlook(
  state: TessState,
  messages: readonly SpeakerMessage[],
  memories: readonly string[],
): string {
  if (!claireMayBeReconsideringFriendship(state)) return "";

  const hasBoundary = claireHasExpressedFriendshipBoundary(messages, memories);
  return [
    "CLAIRE'S CURRENT PRIVATE UNCERTAINTY (not a new promise or relationship status):",
    "With growing familiarity and attraction, she may have genuine uncertainty about whether her feelings could shift beyond friendship. She has NOT decided to pursue romance and owes no answer. Allow an independently generated perspective to explore what THIS particular exchange brings up, including simply wanting friendship. Never repeat a scripted inner thought or force a romantic interpretation.",
    hasBoundary
      ? "She explicitly framed their time together as friends. That is STILL the current outward understanding, including their next planned movie night. Do not retcon or silently revoke it; if she ever changes her mind, she must choose to communicate that clearly herself."
      : "Respect any friendship agreement or boundary established in conversation or memory; romantic scores do not cancel it.",
    "Let the uncertainty appear naturally in her private character_perspective when relevant, not as a scripted confession or repeated inner monologue. Her outward messages can remain friendly and relaxed. If, after genuine experiences, she chooses to explore a different relationship, let her initiate a clear, low-pressure conversation rather than assuming escalation, physical affection, or acceptance.",
    "Do not automatically raise romantic_intent because this instruction exists, and never turn ordinary friendliness into flirt or an agreement to date.",
  ].join("\n");
}

/** A state-based diagnostic, never represented as a saved first-person thought. */
export function claireMindPossibility(state: TessState): string | null {
  if (!claireMayBeReconsideringFriendship(state)) return null;
  return "Current scores support the possibility of romantic curiosity while the stated friendship boundary still stands. This is a score interpretation, not a saved character-generated reflection or change of agreement.";
}
