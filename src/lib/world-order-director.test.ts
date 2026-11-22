import { describe, expect, it } from "vitest";
import { directorEvent, directorInterval } from "./world-order-director";

const base = {
  chapter: "cuba" as const,
  route: "reform" as const,
  trigger: "pass_day" as const,
  alreadyEmittedIds: [] as string[],
};
describe("World Order Balanced Director", () => {
  it("uses a two-day interval in Balanced mode", () => {
    expect(directorInterval("realistic")).toBe(5);
    expect(directorInterval("balanced")).toBe(2);
    expect(directorInterval("chaotic")).toBe(1);
    expect(directorEvent({ ...base, mode: "balanced", day: 3 })).toBeNull();
    expect(directorEvent({ ...base, mode: "balanced", day: 4 })?.day).toBe(4);
  });
  it("emits one stable event per game day and avoids repeats", () => {
    const first = directorEvent({ ...base, mode: "balanced", day: 8 });
    expect(first?.id).toBe("director:8");
    expect(directorEvent({ ...base, mode: "balanced", day: 8, alreadyEmittedIds: ["director:8"] })).toBeNull();
    expect(directorEvent({ ...base, mode: "balanced", day: 8 })).toEqual(first);
  });
  it("accounts for the player's Cuba route", () => {
    const reform = directorEvent({ ...base, mode: "balanced", day: 8 });
    const diplomacy = directorEvent({ ...base, route: "diplomacy", mode: "balanced", day: 8 });
    expect(reform?.summary).not.toBe(diplomacy?.summary);
  });
  it("rejects invalid dates", () => {
    expect(directorEvent({ ...base, mode: "balanced", day: 0 })).toBeNull();
    expect(directorEvent({ ...base, mode: "balanced", day: NaN })).toBeNull();
  });
});
