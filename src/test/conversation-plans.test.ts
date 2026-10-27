import { expect, it } from "vitest";
import { calendarStatus, nextConversationPlan } from "@/lib/calendar-view";
const plan = (id: string, status: string, starts_at: string | null, conversation_id = "own") => ({
  id,
  status,
  starts_at,
  conversation_id,
});
it("chooses the nearest confirmed plan ahead of an incomplete invitation without mutating history", () => {
  const events = [
    plan("invitation", "awaiting_details", null),
    plan("later", "accepted", "2026-10-30T18:00Z"),
    plan("near", "accepted", "2026-10-28T18:00Z"),
  ];
  const before = structuredClone(events);
  expect(nextConversationPlan(events, "own")?.id).toBe("near");
  expect(events).toEqual(before);
});
it("prioritizes an active outing and never shows another conversation or closed plans", () => {
  const events = [
    plan("foreign", "in_progress", null, "other"),
    plan("ended", "completed", null),
    plan("cancelled", "cancelled", null),
    plan("next", "accepted", "2026-10-28T18:00Z"),
    { ...plan("active", "accepted", "2026-10-27T18:00Z"), experience: { state: "paused" } },
  ];
  expect(nextConversationPlan(events, "own")?.id).toBe("active");
  expect(calendarStatus(events[4]!)).toBe("Paused experience");
  expect(nextConversationPlan(events, "missing")).toBeUndefined();
});
it("keeps missing details and proposed changes distinct from confirmation", () => {
  expect(calendarStatus({ status: "awaiting_details" })).toBe("Awaiting details");
  expect(calendarStatus({ status: "proposed" })).toBe("Invitation");
  expect(calendarStatus({ status: "rescheduled" })).toBe("New time proposed");
  expect(calendarStatus({ status: "accepted" })).toBe("Confirmed");
});
