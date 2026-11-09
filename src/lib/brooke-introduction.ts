/**
 * Durable Carly → Brooke introduction (pure rules; persistence lives in
 * brooke-introduction.server.ts and the `after_dark_introductions` table).
 *
 * Brooke is a gated contact: her thread exists only after Brooke agreed to the
 * introduction (canon, recorded at offer time) AND the player accepted it.
 * The offer fires once, after the first meaningful Carly conversation, and is
 * never repeated after it was offered, accepted or declined.
 */
import { BROOKE_MOVING_INTRO } from "./after-dark-cast";

export type IntroductionStatus = "not_mentioned" | "text_offered" | "contact_accepted" | "declined" | "met";
export const INTRODUCTION_STATUSES = ["not_mentioned", "text_offered", "contact_accepted", "declined", "met"] as const;
export type IntroductionAction = "offer" | "accept" | "decline" | "meet";

/** Contacts that must never be auto-created by the inbox. */
export const GATED_CONTACTS: Readonly<Record<string, true>> = { brooke: true };

export const BROOKE_OFFER_TEXT =
  "Hey, random favor. 😘 My friend Brooke needs help moving a couple things. She said I could pass you her number if you're up for helping. Mind texting her? I think you'll like her.";
export const BROOKE_FIRST_TEXT = BROOKE_MOVING_INTRO.optionalBrookeFirstText;
export const OFFER_METADATA_KEY = "after_dark_intro";

/** Minimum exchange before Carly's conversation counts as "meaningful". */
export const MEANINGFUL_USER_MESSAGES = 3;
export const MEANINGFUL_CARLY_MESSAGES = 3;

export function contactUnlocked(key: string, status: IntroductionStatus | null | undefined): boolean {
  if (!GATED_CONTACTS[key]) return true;
  return status === "contact_accepted" || status === "met";
}

export function meaningfulConversation(userMessages: number, carlyMessages: number): boolean {
  return userMessages >= MEANINGFUL_USER_MESSAGES && carlyMessages >= MEANINGFUL_CARLY_MESSAGES;
}

const SERIOUS = /\b(?:died|death|funeral|hospital|emergency|accident|suicid|kill myself|depress|panic attack|crying|sick|cancer|breakup|broke up|fired|lost my job|scared|hurt|assault|grief|angry at you|upset with you)\b/i;

/** An offer interrupts nothing heavy: no serious/distress topic in the latest player text. */
export function naturalOpening(latestUserText: string): boolean {
  const t = latestUserText.trim();
  if (!t) return false;
  return !SERIOUS.test(t);
}

export function shouldOffer(input: {
  characterKey: string;
  status: IntroductionStatus | null | undefined;
  userMessages: number;
  carlyMessages: number;
  latestUserText: string;
  initiation: boolean;
}): boolean {
  if (input.characterKey !== "carly" || input.initiation) return false;
  if ((input.status ?? "not_mentioned") !== "not_mentioned") return false;
  return meaningfulConversation(input.userMessages, input.carlyMessages) && naturalOpening(input.latestUserText);
}

/** Valid transitions only; anything else returns null (no write). */
export function transition(status: IntroductionStatus, action: IntroductionAction): IntroductionStatus | null {
  if (action === "offer") return status === "not_mentioned" ? "text_offered" : null;
  if (action === "accept") return status === "text_offered" ? "contact_accepted" : null;
  if (action === "decline") return status === "text_offered" ? "declined" : null;
  if (action === "meet") return status === "contact_accepted" ? "met" : null;
  return null;
}

/** Private, per-character context lines. Carly never learns Brooke's chats and vice versa. */
export function introductionContext(key: string, status: IntroductionStatus | null | undefined): string | null {
  const s = status ?? "not_mentioned";
  if (key === "carly") {
    if (s === "text_offered") return "BROOKE INTRODUCTION: You already asked if the player would text Brooke about moving help; they haven't answered yet. Don't ask again or pressure them.";
    if (s === "declined") return "BROOKE INTRODUCTION: The player politely passed on helping Brooke move. That's completely fine; don't bring it up again or hold it against them.";
    if (s === "contact_accepted" || s === "met") return "BROOKE INTRODUCTION: The player agreed and you passed along Brooke's number for moving help. You do not know what they have texted each other or whether they've met unless the player tells you.";
    return null;
  }
  if (key === "brooke") {
    if (s === "contact_accepted") return "HOW YOU KNOW THE PLAYER: Carly passed along your number with your permission because you need help moving a couple of things. You have NOT met in person yet. Coordinate a time and your place for the move yourself; the move will be your first meeting. Helping is kindness, not a date or consent to anything.";
    if (s === "met") return "HOW YOU KNOW THE PLAYER: Carly introduced you; you first met in person when they helped you move. Anything beyond friendship develops only through your own feelings and choices.";
  }
  return null;
}
