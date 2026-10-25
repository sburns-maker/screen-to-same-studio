import { it, expect } from "vitest";
import { zonedInstant } from "@/lib/calendar-time";
import { resolveDate } from "@/lib/calendar-logic";
import { followupCanStart, calendarWeek } from "@/lib/calendar-view";
it("converts valid Eastern times on both sides of DST without a fixed UTC offset", () => {
  expect(zonedInstant("2026-10-31", "14:00")).toBe("2026-10-31T18:00:00.000Z");
  expect(zonedInstant("2026-11-01", "14:00")).toBe("2026-11-01T19:00:00.000Z");
});
it("rejects invalid dates, invalid zones, DST holes and folds", () => {
  for (const [d, t] of [
    ["2026-02-30", "14:00"],
    ["2027-03-14", "02:30"],
    ["2026-11-01", "01:30"],
  ])
    expect(zonedInstant(d!, t!)).toBeNull();
  expect(zonedInstant("2026-10-24", "13:00", "Nowhere/Invalid")).toBeNull();
});
it("supports non-integer-hour IANA offsets without assuming Eastern", () => {
  expect(zonedInstant("2026-10-24", "13:00", "Asia/Kathmandu")).toBe("2026-10-24T07:15:00.000Z");
  expect(zonedInstant("2026-04-05", "01:45", "Australia/Lord_Howe")).toBeNull();
});
it("resolves relative dates using the conversation local date at midnight and a new week", () => {
  expect(resolveDate("tomorrow", new Date("2026-10-25T03:59Z"))).toBe("2026-10-25");
  expect(resolveDate("tomorrow", new Date("2026-10-25T04:01Z"))).toBe("2026-10-26");
  expect(resolveDate("next Monday", new Date("2026-10-26T12:00Z"))).toBe("2026-11-02");
  expect(calendarWeek("2026-11-01")).toEqual([
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
});
it("a paused parent cannot authorize a follow-up; recorded completion unlocks its fictional continuation", () => {
  const child = { status: "accepted", starts_at: "2026-10-24T22:30Z" },
    parent = { ends_at: "2026-10-24T22:00Z" },
    scene = { mode: "interactive", state: "paused", updated_at: "2026-10-25T18:00Z" },
    now = new Date("2026-10-25T18:30Z");
  expect(followupCanStart(child, parent, scene, now)).toBe(false);
  expect(followupCanStart(child, parent, { ...scene, state: "completed" }, now)).toBe(true);
});
