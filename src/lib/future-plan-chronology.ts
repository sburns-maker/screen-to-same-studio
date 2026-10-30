import { zonedInstant } from "./calendar-time";

export type FutureConversationPlan = {
  title: string;
  date: string;
  time: string;
  zone: string;
  weekday: string;
  event: string;
};

const EVENT_WORD = /\b(walk|dinner|coffee|movie|hike|concert|trivia|lunch|breakfast|visit|outing|date|game)\b/i;
const PAST_ATTENDANCE = /\b(?:we\s+(?:did\s+(?:get|have|take|go|enjoy|finish|complete)|already\s+(?:had|went|did|took|finished|completed)|had|went|got|enjoyed|finished|completed|took)|i\s+(?:loved|liked|enjoyed)|(?:our|that|the)\s+(?:walk|date|dinner|hike|movie|outing)\s+(?:was|went))\b/i;

/**
 * Read only unresolved, dated plans from the scoped canonical calendar context.
 * Never infer a completed outing from text memories alone.
 */
export function futureConversationPlans(lines: readonly string[], now: Date): FutureConversationPlan[] {
  const found: FutureConversationPlan[] = [];
  for (const line of lines) {
    const m = /^YOUR CONVERSATION PLAN [^:]+: ([^;]+); ([^;]+); date (\d{4}-\d{2}-\d{2}), time (\d{2}:\d{2}) ([^;]+);/.exec(line);
    if (!m) continue;
    const [, title, status, date, time, zone] = m;
    if (!title || !date || !time || !zone || !["accepted", "confirmed", "pending", "proposed"].includes((status ?? "").trim())) continue;
    const instant = zonedInstant(date, time, zone.trim());
    if (!instant || Date.parse(instant) <= now.getTime()) continue;
    const event = title.match(EVENT_WORD)?.[1]?.toLowerCase();
    if (!event) continue;
    const weekday = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
    found.push({ title: title.trim(), date, time, zone: zone.trim(), weekday, event });
  }
  return found;
}

/** Ground the text model in correct date/tense; a plan is not a memory. */
export function futurePlanChronologyContext(lines: readonly string[], now: Date): string[] {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "full",
  }).format(now);
  const plans = futureConversationPlans(lines, now);
  return [
    "AUTHORITATIVE SIMULATION DATE: " + today + " (Eastern). Past shared experiences and future calendar appointments are distinct; a confirmed upcoming plan has NOT happened. Only explicit completed events or enacted scenes are memories of attendance.",
    ...plans.map(p => "FUTURE, NOT YET ATTENDED: " + p.title + " is scheduled for " + p.weekday + ", " + p.date + " at " + p.time + " (" + p.zone + "). It has NOT occurred. Refer to this particular " + p.event + " in future tense and preserve the scheduled plan. Do not claim that you already went, held hands there, ate there, or remembered its outcome."),
  ];
}

/**
 * Detect explicit claims of attending THIS forthcoming appointment in the past.
 * Require matching weekday/date plus activity; past visits on other days remain valid.
 */
export function futurePlanCompletionClaim(
  text: string,
  plans: readonly FutureConversationPlan[],
): FutureConversationPlan | null {
  const sentences = text.split(/[.!?\n]+/);
  for (const plan of plans) {
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const day = plan.weekday.toLowerCase();
      const explicitDate = lower.includes(plan.date);
      const hasDay = new RegExp("\\b" + day + "\\b", "i").test(sentence);
      if (!hasDay && !explicitDate) continue;
      if (hasDay && new RegExp("\\b(?:last|previous)\\s+" + day + "\\b", "i").test(sentence)) continue;
      if (!new RegExp("\\b" + plan.event + "\\b", "i").test(sentence)) continue;
      // Remembering that a plan was *scheduled* is not remembering attendance.
      if (/\b(?:planned|scheduled|booked|arranged|confirmed|agreed)\b/i.test(sentence)) continue;
      if (PAST_ATTENDANCE.test(sentence)) return plan;
    }
  }
  return null;
}