import { characterFor, type CharacterKey } from "./characters";
import { currentActivity } from "./world-continuity";
import { hashSeed, mulberry32 } from "./social-logic";
export const WORLD_PLACES = {
  "home:ben": "Ben's home",
  "coffee:local": "Local coffee shop",
  "library:school": "School library",
  "park:local": "Local park",
  "venue:maya": "Maya's venue",
  "clinic:tess": "Veterinary clinic",
} as const;
export type SharedPlan = {
  user_id: string;
  id: string;
  organizer: string;
  place_key: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  version: number;
  user_attendance: "not_reported";
  created_at: string;
};
export type SharedRsvp = {
  user_id: string;
  plan_id: string;
  character_key: string;
  response: string;
  channel: string;
  reason: string;
  updated_at: string;
};
export function scheduleAllows(character: CharacterKey, start: string, end: string) {
  const def = characterFor(character),
    a = Date.parse(start),
    b = Date.parse(end);
  // Includes travel lead-in, not a teleport into an incompatible work shift.
  for (let t = a - 30 * 60_000; t <= b + 30 * 60_000; t += 15 * 60_000) {
    const at = currentActivity(def, new Date(t));
    if (at.availability === "asleep" || at.availability === "busy") return false;
  }
  return true;
}
export function sharedRsvpDecision(
  plan: Pick<SharedPlan, "id" | "starts_at" | "ends_at">,
  character: CharacterKey,
  channel: string,
  now: Date,
) {
  if (now.getTime() > Date.parse(plan.starts_at) - 30 * 60_000)
    return { response: "declined" as const, reason: "invitation_expired" };
  if (!scheduleAllows(character, plan.starts_at, plan.ends_at))
    return { response: "declined" as const, reason: "schedule_or_travel_conflict" };
  const willingness = { tess: 0.55, maya: 0.8, claire: 0.65, jordan: 0.35, ben: 0.75, riley: 0.55 }[character];
  const chosen =
    mulberry32(hashSeed(`${plan.id}:${character}:rsvp`))() <
    willingness * (channel === "user_relay" ? 1 : 0.8);
  return {
    response: chosen ? ("accepted" as const) : ("declined" as const),
    reason: chosen ? "independent_interest" : "prefers_other_plans",
  };
}
/** Copied-state practice runner. Same RSVP/schedule rules; never writes or advances real time. */
export function previewSharedPlan(plan: SharedPlan, character: CharacterKey, now: Date, days = 3) {
  const copy = structuredClone(plan);
  const decision = sharedRsvpDecision(copy, character, "user_relay", now);
  const timeline = [
    { at: now.toISOString(), state: "invited" },
    { at: now.toISOString(), state: decision.response },
  ];
  const horizon = now.getTime() + Math.min(7, Math.max(1, days)) * 86_400_000;
  if (Date.parse(copy.starts_at) <= horizon)
    timeline.push({
      at: copy.starts_at,
      state: decision.response === "accepted" ? "active" : "no_meeting",
    });
  if (Date.parse(copy.ends_at) <= horizon)
    timeline.push({
      at: copy.ends_at,
      state: decision.response === "accepted" ? "completed" : "missed",
    });
  return { plan: copy, decision, timeline, userAttendance: "not_reported" };
}
