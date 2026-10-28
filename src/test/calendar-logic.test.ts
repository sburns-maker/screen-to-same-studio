import { describe, it, expect } from "vitest";
import {
  resolveDate,
  resolveTime,
  easternInstant,
  recognizePlan,
  type CalendarPlan,
} from "@/lib/calendar-logic";
import { PLACE_REGISTRY, interpretVenueAction, placeKnowledge, venueFromText } from "@/lib/place-registry";
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
  it("creates a noon lunch plan from Tess's formal proposal conversation", () => {
    const user = {
      ...m("Alright, Ms. Morgan, here's my revised formal proposal. Today, noon, lunch at Fanelli's. Just the two of us, good food, and no spreadsheets. Think you can escape by 12?", "user"),
      created_at: "2026-10-24T10:47:00Z",
      character_key: "tess",
    };
    expect(resolveTime(user.body)).toBe("12:00");
    expect(recognizePlan(user, [], null)).toMatchObject({
      action: "invite",
      category: "dinner",
      date: "2026-10-24",
      time: "12:00",
      place: "dinner:fanellis",
    });
  });

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
  it("resolves Maya's 8:15 dinner move without inventing AM/PM for unrelated plans", () => {
    const dinner = { ...plan, id: "maya-dinner", category: "dinner", status: "awaiting_details", time_local: null };
    expect(resolveTime("move it to 8:15")).toBeUndefined();
    expect(resolveTime("move dinner tonight to 8:15")).toBe("20:15");
    expect(recognizePlan(m("Can we move it to 8:15?", "user"), [dinner], "unrelated")).toMatchObject({
      action: "reschedule",
      planId: "maya-dinner",
      time: "20:15",
    });
    expect(recognizePlan(m("Valley Table at 8:15 tonight"), [dinner], "unrelated")).toMatchObject({
      action: "details",
      planId: "maya-dinner",
      time: "20:15",
    });
    expect(recognizePlan(m("Move it to 8:15", "user"), [plan], "invite").time).toBeUndefined();
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
  it("recognizes Riley accepting a specific coffee outing even with a playful if clause", () => {
    const coffee = { ...plan, id: "riley-coffee", category: "coffee", status: "proposed",
      user_response: "accepted", character_response: "invited", date_local: "2026-10-26",
      time_local: "07:00", place_key: "coffee:local" } as CalendarPlan;
    expect(recognizePlan(m("Coffee, yes. You can call it a date if you promise not to use my post-shift brain as an easy target 😁"), [coffee], "invite")).toMatchObject({ action: "accept", planId: "riley-coffee" });
    expect(recognizePlan(m("Coffee, maybe, if I'm not too tired"), [coffee], "invite").action).not.toBe("accept");
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
  it("recognizes a 'what about' dinner invitation with a venue short name and bare evening hour", () => {
    const invite = recognizePlan(
      m("Dinner out tomorrow, just at a civilized hour 😏 What about Fanelli’s around 7?"),
      [],
      null,
    );
    expect(invite).toMatchObject({
      action: "invite",
      category: "dinner",
      date: "2026-10-23",
      time: "19:00",
      place: "dinner:fanellis",
      planId: null,
    });
  });
  it("accepts mid-message 'that sounds good' and a character's '<venue> at <time> it is'", () => {
    const dinner = {
      ...plan,
      id: "maya-dinner",
      category: "dinner",
      status: "proposed",
      last_message_id: "invite",
    } as CalendarPlan;
    expect(
      recognizePlan(
        m("Finelli's 7pm. Let the evening decide if we do more after diner. That sounds good to me.", "user"),
        [dinner],
        "invite",
      ),
    ).toMatchObject({ action: "accept", planId: "maya-dinner", time: "19:00", place: "dinner:fanellis" });
    expect(
      recognizePlan(m("Fanelli’s at 7 it is 😏 And yes, we can let the evening make its own decisions 😂"), [dinner], "invite"),
    ).toMatchObject({ action: "accept", planId: "maya-dinner" });
  });
  it("does not treat a bare 'it is' without plan details as a confirmation", () => {
    const dinner = { ...plan, id: "maya-dinner", category: "dinner", status: "proposed" } as CalendarPlan;
    expect(recognizePlan(m("It is what it is, honestly."), [dinner], "invite").action).toBe("none");
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
    expect(PLACE_REGISTRY).toHaveLength(24);
    // Only owner-supplied addresses are shown; everything else has none.
    expect(PLACE_REGISTRY.filter((p) => p.address !== null).map((p) => p.key)).toEqual(["bar:4ds"]);
    expect(PLACE_REGISTRY.every((p) => p.coordinatesStatus === "illustrative_fictional")).toBe(true);
    expect(placeKnowledge()).toContain("NO VERIFIED STREET ADDRESS");
    expect(PLACE_REGISTRY.find((p) => p.key === "hope:drop-in")?.designation).toBe(
      "unverified_real_name_fictional_scene",
    );
  });
  it("registers Fanelli's as a public dinner venue without a verified address", () => {
    const f = PLACE_REGISTRY.find((p) => p.key === "dinner:fanellis");
    expect(f?.kind).toBe("restaurant");
    expect(f?.eventCategories).toContain("dinner");
    expect(f?.address).toBeNull();
    expect(f?.designation).toBe("unverified_real_name_fictional_scene");
    expect(venueFromText("Meet you at Fanelli's Italian Villa").map((p) => p.key)).toEqual(["dinner:fanellis"]);
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
