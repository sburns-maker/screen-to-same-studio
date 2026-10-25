import { describe, expect, it } from "vitest";
import { recognizePlan, type CalendarPlan } from "@/lib/calendar-logic";

const plan = {
  id: "book-club",
  conversation_id: "c1",
  organizer: "claire",
  category: "book_club",
  status: "in_progress",
  date_local: "2026-10-25",
  time_local: "16:00",
  place_key: "books:hollidaysburg",
  parent_plan_id: null,
  last_message_id: null,
  source_message_id: null,
} as unknown as CalendarPlan;

describe("experience details actions", () => {
  it("never emits a details action without an existing plan id", () => {
    const patch = recognizePlan(
      {
        id: "m1",
        conversation_id: "c1",
        sender: "user",
        body: "Thanks for today. You're allowed to bring a book next time. Just one, though.",
        created_at: "2026-10-25T21:16:00Z",
        character_key: "claire",
        metadata: { experience_plan: "book-club" },
      } as never,
      [plan],
      null,
    );
    if (patch.action === "details") expect(patch.planId).toBe("book-club");
  });
});
