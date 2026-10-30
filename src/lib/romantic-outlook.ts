import type { CharacterKey } from "./characters";
import type { Stage, TessState } from "./tess-logic";
import {
  claireHasExpressedFriendshipBoundary,
  claireMindPossibility,
  clairePrivateRomanticOutlook,
} from "./claire-romantic-arc";

type SpeakerMessage = { sender: string; body: string | null };
type Thresholds = {
  comfort: number;
  trust: number;
  emotional_intimacy: number;
  romantic_attraction: number;
  romantic_intent: number;
};

// All romance-capable adults can reconsider their feelings, but not at the
// same pace. The thresholds are prompt-guidance gates, never score awards.
const THRESHOLDS: Partial<Record<CharacterKey, Thresholds>> = {
  tess:   { comfort: 58, trust: 40, emotional_intimacy: 30, romantic_attraction: 38, romantic_intent: 12 },
  maya:   { comfort: 55, trust: 35, emotional_intimacy: 25, romantic_attraction: 38, romantic_intent: 12 },
  jordan: { comfort: 60, trust: 40, emotional_intimacy: 30, romantic_attraction: 40, romantic_intent: 10 },
  riley:  { comfort: 60, trust: 40, emotional_intimacy: 35, romantic_attraction: 45, romantic_intent: 20 },
  sienna: { comfort: 52, trust: 32, emotional_intimacy: 22, romantic_attraction: 38, romantic_intent: 12 },
  kendra: { comfort: 52, trust: 32, emotional_intimacy: 22, romantic_attraction: 38, romantic_intent: 12 },
};

const VOICES: Partial<Record<CharacterKey, { thought: string; behavior: string }>> = {
  tess: {
    thought: "I didn't expect to care this much about seeing him again. Maybe I should let myself find out where this goes.",
    behavior: "Tess notices her own repeated wish to see him, remembers a small detail, or suggests unhurried time together. Her guarded humor is optional; private feelings need not become an immediate confession.",
  },
  maya: {
    thought: "I really like how I feel around him. Am I starting to hope for something more?",
    behavior: "Maya can notice growing romantic excitement behind her easy sociability without confusing every playful text with a promise. She remains able to ask for an unhurried date and take her time.",
  },
  claire: {
    thought: "I didn't expect him to become so important to me. I wonder what we'll choose to build together next.",
    behavior: "Claire is thoughtful and gently open about closeness, while keeping every agreement and consent boundary that has actually been made. She can feel hopeful without narrating her feelings every time.",
  },
  jordan: {
    thought: "Huh. I've been thinking about him more than I planned. That might actually mean something.",
    behavior: "Jordan processes this mostly alone: a rare callback, inviting him climbing, or simply choosing to spend time together can matter more than an emoji or speech. Keep her concise, dry, independent and unhurried; do not force increased texting or a confession.",
  },
  riley: {
    thought: "I like what we're building. I wonder what the next chapter might look like, at our own pace.",
    behavior: "Riley can privately consider deepening a relationship she has actually agreed to, without being portrayed as only a friend or as owing escalating affection. Preserve the existing commitment and her ability to make independent choices.",
  },
  sienna: {
    thought: "He's turning into someone I actually want to plan things with. Interesting. Maybe there's more here.",
    behavior: "Sienna's playful confidence can coexist with unexpected sincerity. A spontaneous shared outing or honest remark can show interest; flirtation alone is never a relationship agreement.",
  },
  kendra: {
    thought: "I keep looking forward to seeing him. Is this turning into something I want to explore?",
    behavior: "Kendra may enjoy flirtation and looking forward to dates, but can notice more genuine emotional curiosity beneath it. Keep fashion and photography part of her life, not proof of romantic intent.",
  },
};

const DATING_STAGES: ReadonlySet<Stage> = new Set(["Early dating", "Dating", "Established relationship"]);

export function characterCanPrivatelyReconsider(key: CharacterKey, state: TessState): boolean {
  if (key === "claire") {
    // Claire's current relationship state already passes this distinct gate.
    return !!claireMindPossibility(state);
  }
  const min = THRESHOLDS[key];
  if (!min || !VOICES[key]) return false;
  return state.comfort >= min.comfort &&
    state.trust >= min.trust &&
    state.emotional_intimacy >= min.emotional_intimacy &&
    state.romantic_attraction >= min.romantic_attraction &&
    state.romantic_intent >= min.romantic_intent &&
    state.perceived_pressure < 15 &&
    state.irritation < 20;
}

export function characterPrivateRomanticOutlook(
  key: CharacterKey,
  state: TessState,
  stage: Stage,
  messages: readonly SpeakerMessage[],
  memories: readonly string[],
): string {
  if (!characterCanPrivatelyReconsider(key, state)) return "";
  if (key === "claire" && !DATING_STAGES.has(stage)) return clairePrivateRomanticOutlook(state, messages, memories);
  const voice = VOICES[key];
  if (!voice) return "";
  const hasFriendBoundary = claireHasExpressedFriendshipBoundary(messages, memories);
  const alreadyDating = DATING_STAGES.has(stage);
  return [
    `${key.toUpperCase()}'S OPTIONAL PRIVATE RELATIONSHIP REFLECTION (not a new fact, proposal, commitment or required reply):`,
    alreadyDating
      ? `When relevant, she can wonder how the relationship she already has might deepen. A possible private sentiment in her own style: "${voice.thought}" This is not an obligation or a request to advance it.`
      : `If her actual experiences and recent feelings support it, she may quietly wonder whether she wants to explore a closer romantic bond. One possible private sentiment in her own style: "${voice.thought}" This is a possibility, not a confirmed decision or a scripted inner thought.`,
    voice.behavior,
    hasFriendBoundary
      ? "She has previously stated a friendship boundary. It remains the outward agreement, even if she privately wonders whether her feelings are changing. Never silently revoke it; only a new, freely chosen explicit conversation can change the understanding."
      : "Any explicitly stated friendship or romantic boundaries in the conversation or saved memories still apply. A high score never cancels them.",
    "Show the nuance in character_perspective only when it genuinely fits the interaction; ordinary days need no romantic monologue. Never automatically change state_delta, invent a romantic agreement, recast a platonic plan as a date, or treat friendliness as consent. She may choose to remain friends.",
  ].join("\n");
}

/** A tentative reading from scores only. Never claim it was saved as a thought. */
export function characterMindPossibility(key: CharacterKey, state: TessState, stage: Stage): string | null {
  if (!characterCanPrivatelyReconsider(key, state)) return null;
  if (key === "claire" && !DATING_STAGES.has(stage)) return claireMindPossibility(state);
  const voice = VOICES[key];
  if (!voice) return null;
  const stageMeaning = DATING_STAGES.has(stage)
    ? "This concerns an existing relationship, not whether they are more than friends."
    : "Any established friendship boundary remains in effect until explicitly revisited.";
  return `Possible private thought: "${voice.thought}" ${stageMeaning} Derived from scores, NOT a saved reflection, commitment, or evidence that an agreement changed.`;
}
