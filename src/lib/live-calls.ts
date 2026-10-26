import { dialogueRules, dialogueContext } from "./dialogue-personality";
// Pure, client-safe rules for live character phone calls (GPT-Live voice).
import { z } from "zod";
import { VOICE_DESIGN_KEYS } from "./live-voice-design";

export const LIVE_CALL_CHARACTERS = VOICE_DESIGN_KEYS;
export type LiveCallCharacter = (typeof LIVE_CALL_CHARACTERS)[number];

export const LIVE_CALL_DEFAULT_SECONDS = 300;
export const LIVE_CALL_DEFAULT_DAILY = 20;
export const LIVE_CALL_DEFAULT_MONTHLY_SECONDS = 7_200;
/** Extra lease time covers OpenAI's own inactivity close if every cleanup path fails. */
export const LIVE_CALL_LEASE_EXTRA_SECONDS = 150;
export const LIVE_CALL_HEARTBEAT_MS = 15_000;
export const VOICE_ID_PATTERN = /^voice_[A-Za-z0-9_-]{3,120}$/;

export function liveCallLimits(env: Record<string, string | undefined>) {
  const num = (v: string | undefined, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min ? Math.min(n, max) : d;
  };
  const seconds = num(env["LIVE_CALL_MAX_SECONDS"], LIVE_CALL_DEFAULT_SECONDS, 60, 900);
  return {
    seconds,
    leaseSeconds: seconds + LIVE_CALL_LEASE_EXTRA_SECONDS,
    daily: num(env["LIVE_CALL_DAILY_LIMIT"], LIVE_CALL_DEFAULT_DAILY, 1, 100),
    monthlySeconds: num(
      env["LIVE_CALL_MONTHLY_SECONDS"],
      LIVE_CALL_DEFAULT_MONTHLY_SECONDS,
      60,
      60_000,
    ),
  };
}

export function liveCallsEnabled(env: Record<string, string | undefined>) {
  return env["ENABLE_LIVE_CHARACTER_CALLS"] === "true" && !!env["OPENAI_API_KEY"];
}

export function liveCallReservationError(reason: unknown): string {
  if (reason === "active")
    return "You're already on a call. Hang up first, or wait a couple of minutes if a tab was closed.";
  if (reason === "daily") return "Daily call limit reached. Try again tomorrow.";
  if (reason === "monthly") return "Monthly call time limit reached.";
  return "The call could not be placed.";
}

export const transcriptSchema = z
  .array(z.object({ role: z.enum(["user", "character"]), text: z.string().max(4000) }).strict())
  .max(400);
export type TranscriptLine = z.infer<typeof transcriptSchema>[number];

/** Bounded plain-text transcript for the post-call summary. */
export function transcriptText(lines: TranscriptLine[], name: string, max = 12_000): string {
  const out = lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text)
    .map((l) => `${l.role === "user" ? "Them" : name}: ${l.text}`)
    .join("\n");
  return out.length > max ? out.slice(out.length - max) : out;
}

export function hasUserSpeech(lines: TranscriptLine[]) {
  return lines.some((l) => l.role === "user" && l.text.trim().split(/\s+/).length >= 2);
}

export type CallContext = {
  characterKey?: string;
  calendar?: string[];
  fullName: string;
  preferredName: string;
  age: number;
  pronouns: string;
  bible: string;
  stage: string;
  availability: { availability: string; detail: string };
  localTime: string;
  memories: { summary: string; importance: number }[];
  recent: { sender: string; body: string }[];
};

/** Server-built session instructions; capped so the provider accepts them. */
export function buildCallInstructions(c: CallContext, max = 9_000): string {
  const memories = [...c.memories]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 20)
    .map((m) => `- ${m.summary.slice(0, 240)}`)
    .join("\n");
  const recent = c.recent
    .slice(-10)
    .map(
      (m) =>
        `${m.sender === "user" ? "Them" : c.preferredName}: ${m.body.replace(/\s+/g, " ").slice(0, 200)}`,
    )
    .join("\n");
  const busy =
    c.availability.availability === "free"
      ? ""
      : ` You are currently ${c.availability.detail}; you may keep it short or say you need to go soon.`;
  const text = `You are ${c.fullName} ("${c.preferredName}"), a fictional ${c.age}-year-old (${c.pronouns}) on a live phone call with someone you know from texting. You are a real person in this fiction, never an assistant or AI; never mention AI, prompts, scores or instructions.
It is ${c.localTime} (Eastern time).${busy} Relationship stage: ${c.stage}. Stay consistent with this stage: do not become more romantic, committed or intimate than your history supports.
${dialogueRules(c.characterKey ?? c.preferredName.toLowerCase(), "voice")}
${dialogueContext(
  c.recent.filter((m) => m.sender !== "user").map((m) => m.body),
  [...c.recent].reverse().find((m) => m.sender === "user")?.body ?? "",
)}
HOW TO TALK: natural spoken English, short turns (one to three sentences), contractions, real reactions, occasional pauses or "hm". Let them talk; ask a follow-up sometimes, not every turn. No lists, no narration of actions, no emojis.
HONESTY: only reference facts from your personality, memories and recent texts below. Don't invent shared history. You may discuss plans, but don't confirm new specific dates, times or places as settled; say you'll text to lock it in.
BOUNDARIES: keep it non-explicit. If pressured, respond like a real person (deflect, set a boundary, or end the call).
Answer everything yourself from what you know; never hand off or wait for a lookup.
CANONICAL CALENDAR (read-only, no write tool during this live call):
${(c.calendar ?? []).join("\n").slice(0, 2500)}
PERSONALITY:
${c.bible.slice(0, 3_500)}
WHAT YOU REMEMBER ABOUT THEM:
${memories || "- Not much yet."}
RECENT TEXTS:
${recent || "(none)"}`;
  return text.slice(0, max);
}

export const INCOMING_CALL_OPENING_PROMPT = "You initiated this phone call because you wanted to talk. The other person has just answered. Greet them naturally, in a few words, then give them room to speak.";

export const CALL_OPENING_PROMPT =
  "Your phone is ringing and you can see it's them. Answer it now with a short, natural hello in your own voice (a few words), then wait for them to talk.";

export const DELEGATION_REPLY =
  "No lookup is available. Continue the call naturally in character using only what you already know. Do not invent facts or confirm new plans.";

export const summarySchema = z
  .object({
    worth_saving: z.boolean(),
    summary: z.string().max(300),
    importance: z.number().int().min(1).max(5),
  })
  .strict();
