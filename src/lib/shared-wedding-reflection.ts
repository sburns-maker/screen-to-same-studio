import { CHARACTERS, type CharacterKey } from "./characters";
import { weddingShowEligible } from "./fictional-marriage-show";
import { siennaMarriageReflectionGuidance } from "./sienna-marriage-reflection";
import type { TessState } from "./tess-logic";

type Moment = { source: string; body: string };
type PressureState = Pick<TessState, "perceived_pressure" | "irritation">;

const individualVoice: Partial<Record<CharacterKey, string>> = {
  tess: "Tess is dry, thoughtful and slow to offer big promises. A sincere practical question about what living together would mean is more authentic than an impulsive wedding stunt.",
  maya: "Maya may jokingly test the idea first, then reveal genuine curiosity underneath. Banter must not substitute for her own deliberate choice.",
  claire: "Claire is warm and deliberate. Any previously agreed friendship boundary stays in place unless SHE explicitly reopens it; discussing a television show is not romantic consent.",
  jordan: "Jordan is guarded and skeptical. She may ask one direct, almost blunt question about practical partnership, or simply decide the show is not for her. Do not make her suddenly effusive.",
  riley: "Riley's actual existing commitment status and autonomy matter; if they are already partners, she can privately explore a shared future without pretending they just met. Work and sleep schedule still apply.",
  kendra: "Kendra is playful and daring, with genuine independent desires. She may be intrigued by the wildcard challenge while caring more about chemistry and a real life than the cash.",
};

/** Optional personal continuation after the public listing has actually been
 * shown IN THIS CHARACTER'S saved experience, not another character's.
 * This is prompt guidance, never a proposal, acceptance or status mutation. */
export function weddingReflectionGuidance(args: {
  character: CharacterKey;
  moments: readonly Moment[];
  state: PressureState;
}): string {
  const { character, moments, state } = args;
  if (!weddingShowEligible(character) || !CHARACTERS[character].romanticCapable) return "";
  if (character === "sienna") return siennaMarriageReflectionGuidance(args);
  if (state.perceived_pressure >= 15 || state.irritation >= 20) return "";

  const listingIndex = moments.findIndex((m) => m.source === "user" &&
    /\b(?:wildcard wedding|the leap|casting (?:listing|call|page)|marriage show|wedding show)\b/i.test(m.body) &&
    /\b(?:show|marriage|marry|wedding|casting|listing)\b/i.test(m.body));
  if (listingIndex < 0) return "";
  const after = moments.slice(listingIndex + 1);
  if (after.filter(m => m.source !== "user").length < 3) return "";
  const last = moments.at(-1);
  if (!last) return "";
  const recentUser = after.filter(m => m.source === "user").slice(-3).map(m => m.body).join(" ");
  if (/\b(?:just say yes|you have to marry|stop saying no|i demand|answer me now)\b/i.test(recentUser))
    return "";
  if (last.source === "user" &&
      /\b(?:will you marry me|marry me|be my wife|do you want to marry me)\b/i.test(last.body))
    return ""; // Handle a direct proposal as itself, never through a side quest.
  if (after.some(m => m.source !== "user" &&
      /\b(?:i (?:do not|don't|won't|will not|never) want to marry you|i have decided not to marry you|marriage is off the table)\b/i.test(m.body)))
    return ""; // No reopening a final personal rejection.

  const previousQuestionIndex = moments.findIndex((m, i) => i > listingIndex && m.source !== "user" &&
    /\b(?:been thinking|i keep thinking|i've wondered|i have wondered|what if|can i ask|i need to ask)\b/i.test(m.body) &&
    /\b(?:marriage|marry|wedding|the show|million|cameras|choose me|choosing me)\b/i.test(m.body) &&
    /\?/u.test(m.body));
  if (previousQuestionIndex >= 0) {
    const answerIndex = moments.findIndex((m, i) => i > previousQuestionIndex && m.source === "user");
    if (answerIndex < 0 || moments.slice(answerIndex + 1).some(m => m.source !== "user"))
      return ""; // Do not repeat an already-asked question.
    return "PRIVATE WILDCARD WEDDING FOLLOW-THROUGH FOR " + CHARACTERS[character].preferredName.toUpperCase() +
      ": YOU chose to bring up the show's question earlier, and he has now answered. Consider the substance and your established relationship, including boundaries. Respond in your own style: you may be more curious, skeptical, interested, or still unwilling. His answer is not a password or an automatic yes. Do not claim engagement or marriage unless there is a separate explicit mutual commitment. Do not ask the same question again.";
  }

  return "OPTIONAL CHARACTER-LED WILDCARD WEDDING REFLECTION FOR " + CHARACTERS[character].preferredName.toUpperCase() +
    ":\nThe player showed you the in-world public casting listing during THIS outing. After sharing more of the evening, you can think about the idea independently rather than needing him to bring it up on every turn. " +
    (individualVoice[character] ?? "Keep your own values, priorities, pace and choices.") +
    "\nIf you are genuinely curious and the current relationship supports a serious conversation, you may volunteer that you've been thinking about the unusual wedding opportunity and ask ONE honest, character-specific question about what a real life together (without a TV show or money) could mean. Give him room to answer; consider that answer without any predetermined successful line. Or you may laugh it off, say you're not ready, or definitively decline. Never overwrite an explicit friendship or exclusivity boundary, invent feelings, claim selection/prize money, or make anyone engaged or married automatically. Actual commitments need a distinct clear proposal and mutual acceptance.";
}
