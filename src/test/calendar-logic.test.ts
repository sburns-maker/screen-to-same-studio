import { describe, it, expect } from "vitest";
import {
  resolveDate,
  resolveTime,
  easternInstant,
  recognizePlan,
  type CalendarPlan,
} from "@/lib/calendar-logic";
import { PLACE_REGISTRY, interpretVenueAction, placeKnowledge } from "@/lib/place-registry";
const at = new Date("2026-10-23T00:30:00Z"); // Thursday evening Eastern.
const m = (body: string, sender = "tess") => ({
  id: "source",
  conversation_id: "conversation",
  character_key: "claire",
  created_at: at.toISOString(),
  sender,
  body,
});
const plan = {
  id: "plan",
  conversation_id: "conversation",
  category: "book_club",
  status: "awaiting_details",
  source_message_id: "invite",
  last_message_id: "invite",
} as CalendarPlan;
describe("grounded conversational calendar", () => {
  it("uses Eastern message dates, not the machine timezone", () => {
    expect(resolveDate("tonight", at)).toBe("2026-10-22");
    expect(resolveDate("tomorrow afternoon", at)).toBe("2026-10-23");
    expect(resolveDate("Saturday", at)).toBe("2026-10-24");
    expect(resolveDate("Friday October 23, 2026", at)).toBe("2026-10-23");
  });
  it("never fabricates a precise time from afternoon/later or an ambiguous bare clock", () => {
    expect(resolveTime("tomorrow afternoon")).toBeUndefined();
    expect(resolveTime("at 5:30")).toBeUndefined();
    expect(resolveTime("at 5:30 PM")).toBe("17:30");
    expect(resolveTime("at 19:15")).toBe("19:15");
    expect(resolveTime("at midnight")).toBeUndefined();
  });
  it("leaves invalid and ambiguous DST wall times unresolved", () => {
    expect(resolveDate("2026-99-99", at)).toBeUndefined();
    expect(easternInstant("2026-11-01", "01:30")).toBeNull();
    expect(easternInstant("2026-03-08", "02:30")).toBeNull();
    expect(easternInstant("2026-10-22", "19:00")).toBe("2026-10-22T23:00:00.000Z");
  });
  it("recognizes Claire’s invitation and the ordinary acceptance without a second event", () => {
    expect(recognizePlan(m("Want to come along to book club tonight?"), [], null)).toMatchObject({
      action: "invite",
      category: "book_club",
      date: "2026-10-22",
      planId: null,
    });
    expect(
      recognizePlan(m("Yes! Want me to pick you up or meet you there?", "user"), [plan], "invite"),
    ).toMatchObject({ action: "accept", planId: "plan" });
  });
  it("tracks missing address follow-through without inventing a venue", () => {
    expect(
      recognizePlan(m("Meet me there. I'll send you the address."), [plan], "invite"),
    ).toMatchObject({ action: "details", planId: "plan", followthrough: "venue_details" });
  });
  it("fills an agreed venue/time on the same invitation", () => {
    expect(
      recognizePlan(m("Let's use Lantern Reading Room at 7 PM."), [plan], "invite"),
    ).toMatchObject({ action: "details", planId: "plan", place: "reading:lantern", time: "19:00" });
  });
  it("does not treat unrelated yes, hypothetical interest or repeated mentions as new invitations", () => {
    expect(recognizePlan(m("Yes, beautiful weather.", "user"), [plan], "unrelated")).toEqual({
      action: "none",
      planId: null,
    });
    expect(recognizePlan(m("I can't come to book club."), [], null).action).toBe("none");
    expect(recognizePlan(m("Book club was nice last year."), [], null).action).toBe("none");
  });
  it("requires a specific target when multiple invitations are ambiguous", () => {
    expect(
      recognizePlan(
        m("Yes!", "user"),
        [plan, { ...plan, id: "other", category: "coffee", last_message_id: "other-source" }],
        "unrelated",
      ).action,
    ).toBe("none");
  });
  it("targets explicit calendar buttons by the owned source plan, even with two similar invitations", () => {
    const source = {
      ...m("Yes, I accept our Book club invitation.", "user"),
      metadata: { calendar_plan: "second" },
    };
    expect(recognizePlan(source, [plan, { ...plan, id: "second" }], "unrelated")).toMatchObject({
      action: "accept",
      planId: "second",
    });
    expect(
      recognizePlan(
        { ...source, metadata: { calendar_plan: "another-user-plan" } },
        [plan, { ...plan, id: "second" }],
        "unrelated",
      ).action,
    ).toBe("none");
  });
  it("recognizes change/cancel without creating a second plan or assuming romance", () => {
    expect(
      recognizePlan(m("Can we reschedule book club to Friday at 7 PM?", "user"), [plan], "invite"),
    ).toMatchObject({ action: "reschedule", planId: "plan" });
    expect(
      recognizePlan(m("Please cancel our book club plan.", "user"), [plan], "invite").action,
    ).toBe("cancel");
    expect(recognizePlan(m("Let's take a walk Saturday.", "user"), [], null).category).toBe("walk");
  });
  it("has only clearly fictional/unverified map pins and no invented real addresses", () => {
    expect(PLACE_REGISTRY).toHaveLength(11);
    expect(
      PLACE_REGISTRY.every(
        (p) => p.address === null && p.coordinatesStatus === "illustrative_fictional",
      ),
    ).toBe(true);
    expect(placeKnowledge()).toContain("NO VERIFIED STREET ADDRESS");
    expect(PLACE_REGISTRY.find((p) => p.key === "hope:drop-in")?.designation).toBe(
      "unverified_real_name_fictional_scene",
    );
  });
  it("interprets bounded user actions without guaranteeing another person’s consent", () => {
    expect(interpretVenueAction("Order coffee for two")).toEqual({
      action: "order_coffee",
      quantity: 2,
    });
    expect(interpretVenueAction("Sit beside Claire")?.action).toBe("seat");
    expect(interpretVenueAction("Force Claire to hug me")).toBeNull();
    expect(interpretVenueAction("Verify an email reservation")).toBeNull();
  });
});
