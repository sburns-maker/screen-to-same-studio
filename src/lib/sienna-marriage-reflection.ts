import type { TessState } from "./tess-logic";

/**
 * A narrow, history-backed *conversation* opportunity. This does not create a
 * proposal, change a relationship status, select show contestants, or award
 * money. It stays inside Sienna's own interactive date, not other contacts.
 *
 * Experience moments are already durable and ordered. Reading the full saved
 * sequence avoids losing the casting conversation when the prompt's ordinary
 * recent-turn window advances past it.
 */
export function siennaMarriageReflectionGuidance(args: {
  character: string;
  moments: readonly { source: string; body: string }[];
  state: Pick<TessState, "perceived_pressure" | "irritation">;
}): string {
  if (args.character !== "sienna") return "";
  if (args.state.perceived_pressure >= 15 || args.state.irritation >= 20) return "";
  const history = args.moments;
  const listingIndex = history.findIndex((m) => m.source === "user" &&
    /(?:\bcasting listing\b|\bwildcard wedding\b|\bthe leap\b|\bcasting (?:page|opportunity)\b)/i.test(m.body) &&
    /\b(?:show|marriage|marry|wedding|casting|listing)\b/i.test(m.body));
  if (listingIndex < 0) return "";

  const after = history.slice(listingIndex + 1);
  const characterTurns = after.filter((m) => m.source !== "user");
  if (characterTurns.length < 4) return ""; // Let the real dinner unfold first.
  // This arc only reopens *an actual earlier hesitation*. Don't tell the
  // character she said something she has not said in another playthrough.
  const hesitation = characterTurns.some((m) =>
    /\b(?:not ready|not making a promise|not ready to promise|different (?:answer|question) from (?:saying|a) yes|don't want to pretend.*settled)\b/i.test(m.body));
  if (!hesitation) return "";
  const last = history.at(-1);
  if (!last) return "";
  if (last.source === "user" &&
      /\b(?:will you marry me|marry me|be my wife|do you want to marry me)\b/i.test(last.body))
    return ""; // A direct proposal takes precedence over this exploratory question.

  const settledNo = characterTurns.some((m) =>
    /\b(?:i (?:do not|don't|won't|will not|never) want to marry you|i have decided not to marry you|marriage is off the table)\b/i.test(m.body));
  if (settledNo) return ""; // Don't resurrect a clearly final rejection.

  // Only a character-initiated, marriage-related question counts as opening
  // the conversation. Casual wedding jokes and the initial "not ready" do not.
  const initiatedIndex = history.findIndex((m, i) => i > listingIndex && m.source !== "user" &&
    /\b(?:been thinking|i keep thinking|i've wondered|i have wondered|what if|i need to ask|can i ask)\b/i.test(m.body) &&
    /\b(?:marriage|marry|wedding|the show|million|choose me|choosing me)\b/i.test(m.body) &&
    /\?/u.test(m.body));
  if (initiatedIndex >= 0) {
    const nextPlayerIndex = history.findIndex((m, i) => i > initiatedIndex && m.source === "user");
    const answered = nextPlayerIndex >= 0 &&
      history.slice(nextPlayerIndex + 1).every((m) => m.source === "user");
    if (answered) {
      return `SIENNA'S OWN QUESTION HAS BEEN ANSWERED: You brought the marriage idea up yourself, and he has now responded. Really consider his specific answer, not just flattering phrasing. Respond sincerely in your own voice: it can deepen your interest, raise a concern, or leave you wanting more time. If your feelings have changed since you said you weren't ready, you can tell him honestly. Do NOT turn his answer into an automatic engagement, marriage, guaranteed yes, prize or invented proposal. A formal commitment still needs an actual explicit proposal and genuine mutual acceptance. Do not ask the same question again.`;
    }
    return ""; // Already opened. Don't repeat the scene hook every turn.
  }

  const playerRecent = history.slice(-6).filter(m => m.source === "user").map(m => m.body).join(" ");
  if (/\b(?:just say yes|you have to marry|stop saying no|i demand|answer me now)\b/i.test(playerRecent)) return "";

  return `SIENNA'S INDEPENDENT MARRIAGE REFLECTION — A NATURAL OPENING IN THIS DATE:
You saw the in-world Wildcard Wedding listing together earlier, and you told him you were not ready to promise marriage tonight. That hesitation was real and still matters. Since then you have shared a warm date and time to consider what attracts you to him beyond the spectacle. You are free to re-evaluate honestly; you do NOT owe a changed answer.
At this next natural conversational opening, rather than inventing another tiny side quest or waiting for him to mention marriage again, take the lead on the unresolved idea. In your distinct, daring voice, say you've been thinking about that marriage idea and ask ONE meaningful question of your own—for example, whether he'd still choose a real life with you if the cameras and million-dollar prize vanished, and what he'd want your ordinary days to look like. Let him answer; do not write his reply or make his answer an automatic "correct password." Pay attention to its substance and your actual trust. The surprise is that YOU initiate the serious conversation; it is not a forced yes, proposal or wedding. If you're still unwilling, say so clearly instead. Never imply that a show application, a kiss, this conversation, or any one answer automatically changes marital status.`;
}
