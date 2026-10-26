export { contactPhoneNumber } from "./contact-numbers";
import { characterFor, type CharacterKey } from "./characters";
import { currentActivity } from "./world-continuity";
import { scheduleFor } from "./tess-life";
/** Legacy reserved service allocations; not display aliases. Explicit allocations: append future contacts; never derive numbers from an array's current order. */
export const FICTIONAL_NUMBERS: Record<string, number> = {
  tess: 100,
  maya: 101,
  claire: 102,
  jordan: 103,
  ben: 104,
  "rowan-ellis": 105,
  "leah-moss": 106,
  "nolan-reed": 107,
  "mira-dalton": 108,
  "theo-finch": 109,
  "inez-carter": 110,
  "orla-june": 111,
  "elliot-reed": 112,
  "robin-hale": 113,
  "dana-soler": 114,
};
export function fictionalNumber(key: string) {
  const n = FICTIONAL_NUMBERS[key];
  return n === undefined ? null : `(814) 555-${String(n).padStart(4, "0")}`;
}
export const CALL_VOICES: Record<CharacterKey, { style: string }> = {
  tess: {
    style:
      "Dry, intelligent, restrained; subtle sarcasm and occasional affection. Never exaggerated cheerfulness.",
  },
  maya: {
    style:
      "Warm, playful, expressive and emotionally responsive. Everyday conversational delivery.",
  },
  claire: {
    style: "Calm, thoughtful, natural, with grounded enthusiasm when appropriate.",
  },
  jordan: {
    style: "Understated, wry and sincere. No automatic emotional tests or deflection.",
  },
  ben: { style: "Relaxed, ordinary, friendly and entirely platonic." },
  riley: { style: "Natural, understated and observant, with dry humor and occasional tired wit." },
};
export const ACTIVE_CALL_STATES = ["calling", "ringing", "connecting", "connected"];
export type CallRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  character_key: CharacterKey;
  direction: "incoming" | "outgoing";
  state: string;
  outcome: string;
  reason: string;
  offered_at: string;
  ring_until: string;
  answered_at: string | null;
  ended_at: string | null;
  expires_at: string;
  duration_seconds: number;
  turns: number;
  summary: string;
  last_failure: string | null;
  last_latency_ms: number | null;
  reserved_cents: number;
  source_record_id: string | null;
};
export type CallPreferences = { enabled: boolean; incoming: boolean; save_transcripts: boolean };
export function callAvailability(key: CharacterKey, now: Date) {
  const a = currentActivity(characterFor(key), now);
  const base = key === "tess" ? scheduleFor(now) : a;
  if (a.availability === "asleep" || base.availability === "asleep")
    return { outcome: "missed", reason: "asleep" };
  if (/driv|commut|traffic|flight/i.test(a.detail))
    return { outcome: "unavailable", reason: "travelling" };
  if (a.availability === "busy" || base.availability === "busy")
    return { outcome: "busy", reason: "occupied" };
  if (/at work/i.test(a.activity)) return { outcome: "declined", reason: "working" };
  return { outcome: "answer", reason: "available" };
}
export function ringSeconds(id: string) {
  return 5 + ([...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 7);
}
export function callDuration(c: Pick<CallRow, "answered_at" | "ended_at">, now = new Date()) {
  return c.answered_at
    ? Math.max(
        0,
        Math.floor(
          ((c.ended_at ? Date.parse(c.ended_at) : now.getTime()) - Date.parse(c.answered_at)) /
            1000,
        ),
      )
    : 0;
}
export const CALL_LABELS: Record<string, string> = {
  calling: "Calling",
  ringing: "Incoming call",
  connecting: "Connecting",
  connected: "Connected",
  ended: "Call ended",
  busy: "Busy",
  unavailable: "Unavailable",
  declined: "Declined",
  missed: "No answer",
  failed: "Failed connection",
};
