import type { CharacterKey } from "./characters";
import type { TessState } from "./tess-logic";

export type InitiativeMode = "ordinary" | "new_adventure" | "surprise_invitation" | "bold_romance" | "direct_vulnerability";
export type InitiativeChannel = "text" | "experience";
export type CharacterInitiative = { mode: InitiativeMode; instruction: string };

/** A stable turn-specific opportunity, not a dice roll that can change on retry. */
function stableChoice(key: string): number {
  let hash = 2166136261;
  for (const ch of key) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/**
 * Character-specific agency: choose what sort of initiative the character can
 * consider rather than merely instructing her to "be spontaneous".
 * The language model independently decides whether to act on the opportunity.
 * No calendar, relationship, housing or financial changes originate here.
 */
export function characterInitiativeOpportunity(args: {
  key: CharacterKey;
  channel: InitiativeChannel;
  state: TessState;
  latestPlayerMessage: string;
  latestCharacterMessage: string;
  turnCount: number;
  availabilityDetail: string;
}): CharacterInitiative | null {
  // The first rollout deliberately affects Sienna only, not other characters' voices.
  if (args.key !== "sienna") return null;
  const previous = args.latestPlayerMessage.trim();
  const pressure = args.state.perceived_pressure >= 20 || args.state.irritation >= 25;
  if (pressure) return {
    mode: "ordinary",
    instruction: "SIENNA'S AGENCY: She can challenge a boundary, say no, slow down, or change the subject. Boldness never means accepting pressure.",
  };
  if (/\b(?:will you marry|marry me|be my wife|do you accept|do you want to marry)\b/i.test(previous)) return {
    mode: "direct_vulnerability",
    instruction: "SIENNA'S AGENCY: He made an actual direct proposal. Answer that proposal sincerely and clearly as yourself, with yes, no, or a specific request for time. No comic diversion, automatic acceptance or invented commitment. A surprisingly bold yes is allowed if genuinely desired.",
  };
  const signal = stableChoice([args.channel, args.turnCount, previous.slice(-180), args.latestCharacterMessage.slice(-100)].join("|")) % 100;
  const mode: InitiativeMode = signal < 9 ? "ordinary" : signal < 36 ? "new_adventure"
    : signal < 61 ? "surprise_invitation" : signal < 84 ? "bold_romance" : "direct_vulnerability";
  const instructions: Record<InitiativeMode, string> = {
    ordinary: "Sometimes just enjoy the existing conversation; bold people can have quiet, unremarkable moments.",
    new_adventure: "Consider inventing a fresh, concrete, achievable adventure from the CURRENT circumstances: an unexpected detour, dancing, night walk, photo mission, silly dare or alternate destination. Let Sienna choose the idea, not just agree to his.",
    surprise_invitation: "Consider confidently inviting him into a new shared experience on her own initiative, with a real-world-plausible activity and timing. An invitation is not a confirmed plan; he may say no.",
    bold_romance: "If current reciprocal chemistry supports it, consider initiating a kiss, stating what she wants, making a playful daring offer, or advancing a romantic conversation herself. She can choose a startling romantic leap, but is never compelled and must not assume his consent.",
    direct_vulnerability: "Consider surprising him by plainly naming what she genuinely wants or fears, without deflecting into another joke or a vague 'we'll see'. Honesty can be the unexpected bold choice.",
  };
  return {
    mode,
    instruction: `SIENNA INITIATIVE OPPORTUNITY (${mode}, not an obligation): ${instructions[mode]} She is outgoing, daring, creative, sometimes impulsive and not easily embarrassed; she can drive events instead of only reacting. Respond to his current question or invitation FIRST. Never manufacture his words, an agreed plan, proof of an event, a pending proposal, sex or a relationship decision. Read the current location, working hours and past boundaries; if busy, propose something realistic for later. Keep actions varied and natural, not a stunt every turn.`,
  };
}

export function characterInitiativeGuidance(args: Parameters<typeof characterInitiativeOpportunity>[0]): string {
  return characterInitiativeOpportunity(args)?.instruction ?? "";
}
