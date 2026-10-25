import { z } from "zod";
export const SCHEDULE_ZONE = "America/New_York";
export const scheduleActionSchema = z.object({
  action: z.enum(["invite", "accept", "details", "reschedule", "decline", "cancel"]),
  planId: z.string().uuid().nullable(),
  parentPlanId: z.string().uuid().nullable(),
  title: z.string().max(120).nullable(),
  description: z.string().max(600).nullable(),
  category: z.enum(["coffee", "dinner", "walk", "book_club", "meetup"]).nullable(),
  date: z
    .string()
    .regex(/^20\d\d-\d\d-\d\d$/)
    .nullable(),
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  timeHint: z.string().max(100).nullable(),
  timeZone: z.string().max(80).nullable(),
  place: z.string().max(100).nullable(),
  durationMinutes: z.number().int().min(15).max(360).nullable(),
  userQuote: z.string().max(500).nullable(),
});
export const scheduleActionsSchema = z.array(scheduleActionSchema).max(3).nullable();
export type ScheduleAction = z.infer<typeof scheduleActionSchema>;
export const SCHEDULE_RULES = `SCHEDULING CONTRACT:
Return schedule_actions for definite invitations, acceptances, detail changes, reschedules, cancellations or declines; otherwise null. Use the canonical plan IDs in calendar context. Do not invent an ID, venue, address, booking or user consent. For a NEW plan planId is null. Your proposal accepts only your own participation. Accepting a user's actual proposal accepts yours; never re-confirm an already agreed date or mistake it for a competing appointment. A changed time is a counterproposal, not automatic user acceptance. Preserve approximate times in timeHint; leave time null instead of inventing precision. Use the event's IANA timeZone (default America/New_York). Never infer completed attendance from elapsed time.
For an immediate outing after the current experience, create a NEW invite with parentPlanId equal to the current event; preserve the active experience. A proposed follow-up is not a schedule conflict with its own parent. 'Afterward' can be scheduled after the parent's planned end and travel time; no fictional user travel or attendance is implied. If no venue is agreed leave place null and ask naturally.
If an actual latest user reply accepts your existing proposal, userQuote may quote their exact words; never invent a quote. Do not claim an event was added, changed, cancelled or confirmed in the calendar in dialogue: the UI displays the persistence receipt after the transaction succeeds. Say what you agree to, rather than claiming an unverified database operation.`;
export function hasCalendarSuccessClaim(text: string) {
  return /\b(?:i(?:'ve| have)?|it(?:'s| is))\s+(?:added|saved|updated|booked|put|confirmed|cancelled|canceled)\b.{0,45}\b(?:calendar|schedule|plans)\b|\b(?:added|saved|updated)\s+(?:it|that|this|our date)\s+(?:to|in)\s+(?:your|the|our)\s+calendar/i.test(
    text,
  );
}
/** Exact, current user evidence is required; playful hypotheticals do not confer consent. */
export function acceptsPlan(text: string) {
  return (
    /^(?:yes\b|yeah\b|yep\b|absolutely\b|sure\b|definitely\b|sounds (?:good|great|perfect)\b|that (?:works|sounds good)\b|i['’]d love to\b|i would love to\b|count me in\b|let['’]s do it\b|i['’]m in\b|you bet\b)/i.test(
      text.trim(),
    ) && !/\b(?:maybe|might|can't|cannot|but not|if we|if i)\b/i.test(text)
  );
}
