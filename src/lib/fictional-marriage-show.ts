import type { CharacterKey } from "./characters";

/**
 * Canonical IN-UNIVERSE entertainment listing. It is not a real-world program,
 * a payment promise, a signed contract or an existing commitment.
 */
export const FICTIONAL_MARRIAGE_SHOW = Object.freeze({
  id: "the-leap-wildcard-2026",
  title: "The Leap: Wildcard Wedding",
  production: "The Leap Productions (fictional in-world company)",
  postedDate: "2026-10-31",
  prizeUsd: 1_000_000,
  eligible: "Two consenting adults, including people who already know each other, may apply together for the Wildcard Wedding edition.",
  offer: "A selected pair may receive a combined $1,000,000 reality-TV appearance prize after a legal marriage is performed and the production contract is fulfilled.",
  limits: "An open casting listing is not selection or a guaranteed award. Both people must freely agree to apply, accept legal terms, and independently choose marriage. No in-game account is credited merely for discussing it.",
});

/** Only expose the listing in Sienna's own relevant thread; never leak private character state. */
export function siennaShowContext(
  key: CharacterKey,
  messages: readonly { sender: string; body: string | null }[],
  at: Date,
): string {
  if (key !== "sienna" || at.getFullYear() !== 2026) return "";
  const recent = messages.slice(-16).map(m => m.body ?? "").join("\n");
  if (!/\b(?:million|\$1m|\$1,000,000|marry|marriage|wedding|preacher|altar|proposal|tv show|reality show|officiant)\b/i.test(recent)) return "";
  return `IN-WORLD CASTING FACT — not a real show outside this fictional simulation: The in-world casting registry contains a genuine listing dated ${FICTIONAL_MARRIAGE_SHOW.postedDate}: "${FICTIONAL_MARRIAGE_SHOW.title}" by ${FICTIONAL_MARRIAGE_SHOW.production}. ${FICTIONAL_MARRIAGE_SHOW.eligible} ${FICTIONAL_MARRIAGE_SHOW.offer} ${FICTIONAL_MARRIAGE_SHOW.limits}
The user may SHOW this listing on his phone or describe its text at dinner. Only then can you react to having seen that evidence. Don't say you've seen it before he shows you; don't claim either of you applied, qualified, won, signed or collected money. His earlier example about marrying a STRANGER is a different format; you already rejected that. Being offered a genuine, person-specific proposal is a different question and you can reconsider independently. Sienna values spontaneous romance and true connection more than money: if she chooses an impulsive yes, she may say the million isn't what matters; if she doesn't want marriage, she can say no without being punished. No direct words or a joke alone creates a binding engagement or marriage; the normal explicit two-party commitment workflow still applies.`;
}
