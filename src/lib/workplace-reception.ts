import type { CharacterKey } from "./characters";
import { WORKPLACES } from "./workplaces";

export type HandoffOutcome = "unresolved" | "message_left" | "waiting" | "declined";
export type ReceptionTurn = { speaker: "player" | "reception"; body: string };
export type ReceptionSession = {
  character: CharacterKey;
  item: string;
  turns: ReceptionTurn[];
  outcome: HandoffOutcome;
};

/** Public-facing fictional receptionist. No staff identity, private information, or
 * delivery acceptance is fabricated. Only the player's own words/actions enter chat. */
export function receptionReply(session: ReceptionSession, input: string): { reply: string; outcome: HandoffOutcome } {
  const work = WORKPLACES[session.character];
  const text = input.toLowerCase();
  if (/\b(?:go (?:inside|upstairs|back)|staff.only|laboratory|lab|treatment room|patient room|private office)\b/.test(text))
    return { reply: "I can't let visitors into staff-only areas. You can stay here in the public visitor area.", outcome: "unresolved" };
  if (/\b(?:leave (?:a |the )?(?:note|message)|pass (?:a |the )?message|tell (?:her|him|them))\b/.test(text))
    return { reply: "I can note your request here in this fictional scene. I can't confirm the employee has seen it or that the delivery was accepted.", outcome: "message_left" };
  if (/\b(?:wait|hang around|stay here|sit here)\b/.test(text))
    return { reply: "You're welcome to wait in the permitted public area. I can't say whether they'll be able to step away.", outcome: "waiting" };
  if (/\b(?:no thanks|nevermind|never mind|take it back|leave with it|cancel)\b/.test(text))
    return { reply: "Of course. You can take the item with you; nothing has been delivered.", outcome: "declined" };
  if (/\b(?:can (?:you|i)|could (?:you|i)|drop|deliver|bring|food|lunch|coffee|gift|package|flowers|item)\b/.test(text))
    return { reply: `I can help with a request at ${work.label}, but I can't promise to accept an item or reach anyone who's working. Would you like to wait in the public area or leave a message?`, outcome: "unresolved" };
  return { reply: "I understand. I can take a message request or you may wait in the public visitor area. I can't confirm the person's availability.", outcome: "unresolved" };
}

export function nextReceptionTurn(session: ReceptionSession, text: string): ReceptionSession {
  const input = text.trim().slice(0, 600);
  if (!input || session.turns.length >= 20 || session.outcome === "declined") return session;
  const result = receptionReply(session, input);
  return {
    ...session, outcome: result.outcome,
    turns: [...session.turns, { speaker: "player", body: input }, { speaker: "reception", body: result.reply }],
  };
}

export function dropoffSummary(session: ReceptionSession): string {
  const actions = session.turns.filter(t => t.speaker === "player").map(t => t.body).join(" ");
  const status = session.outcome === "message_left"
    ? "I requested that a message be left; no item acceptance or receipt was confirmed."
    : session.outcome === "waiting"
      ? "I stayed in the permitted public waiting area; no handoff was confirmed."
      : session.outcome === "declined"
        ? "I took the item back; no delivery occurred."
        : "I asked reception about a handoff; no delivery was confirmed.";
  return `I brought ${session.item} for ${session.character}. ${actions} ${status}`.slice(0, 900);
}
