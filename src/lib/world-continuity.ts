import { z } from "zod";
import type { CharacterDef } from "./characters";
import { characterAvailability } from "./characters";
import { applyDisruption, disruptionFor } from "./daily-disruptions";
import { scheduleFor, type TessActivity } from "./tess-life";
import { overnightWake } from "./overnight-wake";

export const continuitySchema = z.object({
  fulfilled: z.object({ id: z.string(), source_quote: z.string() }).nullable(),
  intentions: z
    .array(
      z.object({
        kind: z.enum(["photo", "check_in", "plan"]),
        summary: z.string(),
        due_at: z.string(),
        source_quote: z.string(),
      }),
    )
    .max(3),
  facts: z
    .array(
      z.object({
        kind: z.enum(["npc", "possession", "preference", "commitment"]),
        key: z.string(),
        value: z.string(),
        status: z.enum(["confirmed", "tentative", "joke"]),
        source_quote: z.string(),
      }),
    )
    .max(4),
});
export type Continuity = z.infer<typeof continuitySchema>;
export const CONTINUITY_RULES = `CONTINUITY: Return continuity=null when there is nothing important to record. Otherwise include fulfilled (null unless completing an existing intention), intentions and facts arrays.
When actually completing a pending intention NOW, fulfilled must contain its exact record id and a source_quote copied from this response showing fulfillment. Never mark a refusal, delay, or another future promise as fulfillment. Photo fulfillment also requires an actual image attachment.
Intentions represent an explicit promise you actually make in this response ("I'll send a photo later", "I'll check in after work"). Supply kind photo/check_in/plan, a short summary, due_at as an ISO UTC timestamp grounded in your actual schedule, and source_quote copied EXACTLY from the delivered text. Do not create a promise merely because the user requested it. A future intention is not fulfillment or consent. Do not make a new promise to replace the one currently being fulfilled.
Facts: distinguish confirmed user-established information from your tentative improvisations or jokes. Use kind npc/possession/preference/commitment, a stable descriptive key, value, status confirmed/tentative/joke and exact source_quote. NPC introductions are tentative claims until independently established; reuse known names and never rewrite code canon. Important objects can move only when supported by conversation or a confirmed event. Do not mark guesses, sarcasm, imagined scenes, or desired future plans as completed facts. Canonical occupation, age, name, pets and appearance are authoritative. Correct a contradiction briefly; do not invent explanations.
Memory summaries must not elevate a joke, tentative claim or unfulfilled plan into confirmed history. Future plans remain future until their event is actually resolved.`;

export function evidenceContinuity(
  value: unknown,
  userText: string,
  ownText: string,
  now: Date,
): Continuity {
  const parsed = continuitySchema.safeParse(value);
  if (!parsed.success) return { fulfilled: null, intentions: [], facts: [] };
  const intentions = parsed.data.intentions
    .filter((item) => {
      const quote = item.source_quote.trim();
      const due = Date.parse(item.due_at);
      return (
        quote.length >= 8 &&
        ownText.includes(quote) &&
        /\b(I'll|I will|I’ll)\b/i.test(quote) &&
        /\b(send|share|show|check|text|message|let you know|meet|see you)\b/i.test(quote) &&
        (item.kind !== "photo" || /\b(photo|picture|pic|selfie|snapshot)\b/i.test(quote)) &&
        Number.isFinite(due) &&
        due >= now.getTime() + 15 * 60_000 &&
        due <= now.getTime() + 14 * 86_400_000
      );
    })
    .map((item) => ({ ...item, summary: item.summary.slice(0, 400) }));
  const facts = parsed.data.facts
    .filter((item) => {
      const quote = item.source_quote.trim();
      return (
        item.status !== "joke" &&
        quote.length >= 8 &&
        (userText.includes(quote) || ownText.includes(quote)) &&
        !/\b(occupation|job|age|legal.?name|appearance|hair.?colou?r|biography|birth|pet.?name)\b/i.test(
          item.key,
        )
      );
    })
    .map((item) => ({
      ...item,
      key: `${item.kind}:${item.key.toLowerCase().trim()}`.slice(0, 120),
      value: item.value.slice(0, 600),
      status:
        item.status === "confirmed" && userText.includes(item.source_quote)
          ? ("confirmed" as const)
          : ("tentative" as const),
    }));
  const claimed = parsed.data.fulfilled;
  const fulfilled =
    claimed &&
    claimed.source_quote.length >= 8 &&
    ownText.includes(claimed.source_quote) &&
    !/\b(I.ll|I will|later|can.t|cannot|not now|tomorrow)\b/i.test(claimed.source_quote)
      ? claimed
      : null;
  return { fulfilled, intentions, facts };
}

export function currentActivity(def: CharacterDef, now: Date, chaos = 1): TessActivity {
  const awakening = overnightWake(def.key,now);
  if (def.key !== "tess") {
    const a = characterAvailability(def, now);
    return a.availability==="asleep" && awakening ? awakening : { activity: a.detail, detail: a.detail, availability: a.availability };
  }
  const base = scheduleFor(now, chaos);
  return base.availability==="asleep" && awakening ? awakening : applyDisruption(base, disruptionFor(def.key, now, base.activity.startsWith("at work")));
}
export function locationCategory(activity: TessActivity): string {
  if (activity.availability === "asleep") return "home";
  if (/work|clinic|venue|library|firm|job.site/i.test(activity.activity)) return "work";
  if (/driv|traffic|commut/i.test(activity.detail)) return "travel";
  if (/walk|garden|hike|climb|outdoor/i.test(activity.activity)) return "outdoors";
  if (/trivia|parents|friend|family|bar/i.test(activity.activity)) return "social";
  return "home_or_local";
}
export function nextActivityAt(def: CharacterDef, now: Date, chaos = 1): string {
  const current = currentActivity(def, now, chaos);
  const start = Math.floor(now.getTime() / 900_000) * 900_000;
  for (let step = 1; step <= 96; step++) {
    const at = new Date(start + step * 900_000);
    const next = currentActivity(def, at, chaos);
    if (next.activity !== current.activity || next.availability !== current.availability)
      return at.toISOString();
  }
  return new Date(now.getTime() + 86_400_000).toISOString();
}

export function intentionDue(
  record: {
    due_at: string | null;
    expires_at: string | null;
    retry_at: string | null;
    status: string;
  },
  now: Date,
): boolean {
  return (
    record.status === "pending" &&
    !!record.due_at &&
    Date.parse(record.due_at) <= now.getTime() &&
    (!record.expires_at || Date.parse(record.expires_at) > now.getTime()) &&
    (!record.retry_at || Date.parse(record.retry_at) <= now.getTime())
  );
}
