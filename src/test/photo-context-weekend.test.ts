import { describe, it, expect } from "vitest";
import { photoContextForSchedule } from "@/lib/calendar-commitment";
import { photoOpportunity } from "@/lib/photo-opportunities";
import { scheduleFor } from "@/lib/tess-life";
describe("spontaneous weekend photos", () => {
  it("uses real weekend context instead of stale clinic storyline", () => {
    const schedule = scheduleFor(new Date("2026-10-24T20:15:00Z"));
    expect(schedule.detail).toMatch(/weekend/);
    const visual = photoContextForSchedule(
      schedule,
      "Tess and Sam are reviewing uneven clinic shift coverage",
    );
    expect(visual).toBe(schedule.detail);
    expect(visual).not.toMatch(/clinic|Sam/);
  });
  it("keeps actual activity primary even when a compatible story exists", () => {
    const schedule = scheduleFor(new Date("2026-10-24T20:15:00Z"));
    expect(photoContextForSchedule(schedule, "Mabel is curled up on the sofa")).toBe(
      schedule.detail,
    );
  });
});

it("does not use a future planning event as the current photograph scene", () => {
  const schedule = {
    activity: "at home",
    availability: "free" as const,
    detail: "at home, relaxing",
  };
  expect(
    photoContextForSchedule(schedule, "Maya and Becca are looking for a weekend together"),
  ).toBe("at home, relaxing");
  expect(photoContextForSchedule(schedule, null)).toBe("at home, relaxing");
});

it("strips the explicitly non-physical ongoing-story suffix from photo context", () => {
  const schedule = {
    activity: "at home",
    availability: "free" as const,
    detail: "relaxing at home; ongoing situation: Maya and Becca are looking for a weekend",
  };
  expect(photoContextForSchedule(schedule)).toBe("relaxing at home");
});
