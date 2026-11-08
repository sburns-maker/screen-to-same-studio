import { describe, expect, it } from "vitest";
import { pregnancyNextCheckpoint, pregnancyMilestoneSnapshot, pregnancyAppointmentSnapshot } from "./pregnancy-world";

describe("pregnancy narrative checkpoints", () => {
 it("offers a first-care step rather than inventing a visit", () => {
  const result = pregnancyNextCheckpoint(7, []);
  expect(result.visitState).toBe("none");
  expect(result.nextStep).toContain("first-visit plan");
 });
 it("distinguishes proposed, scheduled and completed care", () => {
  const proposed = pregnancyNextCheckpoint(12, [
   {kind:"prenatal",at:"2026-11-20T10:00:00Z",status:"proposed"},
  ]);
  expect(proposed.visitState).toBe("proposed");
  expect(pregnancyNextCheckpoint(12, [
   {kind:"prenatal",at:"2026-11-20T10:00:00Z",status:"scheduled"},
  ]).visitState).toBe("scheduled");
  expect(pregnancyNextCheckpoint(12, [
   {kind:"prenatal",at:"2026-11-10T10:00:00Z",status:"completed"},
  ]).visitState).toBe("completed");
 });
 it("changes topics by trimester without inventing a medical result or birth", () => {
  expect(pregnancyNextCheckpoint(20, []).stage).toBe("mid-pregnancy");
  const third = pregnancyNextCheckpoint(32, []);
  expect(third.stage).toBe("third trimester");
  expect(pregnancyNextCheckpoint(38, []).nextStep).toContain("without inferring labor");
 });
});

describe("persistent pregnancy history summaries", () => {
 it("separates due, upcoming and completed milestones", () => {
  const view=pregnancyMilestoneSnapshot([
   {key:"initial_visit",dueAt:"2026-11-10T15:00:00Z",completedAt:null},
   {key:"second_trimester",dueAt:"2026-11-20T15:00:00Z",completedAt:null},
   {key:"early_ultrasound",dueAt:"2026-11-12T15:00:00Z",completedAt:"2026-11-13T15:00:00Z"},
  ],new Date("2026-11-15T15:00:00Z"));
  expect(view.due.map(m=>m.key)).toEqual(["initial_visit"]);
  expect(view.upcoming?.key).toBe("second_trimester");
  expect(view.completed.map(m=>m.key)).toEqual(["early_ultrasound"]);
 });
 it("does not mistake proposed care for booked or completed care", () => {
  const view=pregnancyAppointmentSnapshot([
   {kind:"confirmation",at:"2026-11-09T14:00:00Z",status:"completed"},
   {kind:"prenatal",at:"2026-11-25T14:00:00Z",status:"proposed"},
   {kind:"ultrasound",at:"2026-11-23T14:00:00Z",status:"scheduled"},
  ],new Date("2026-11-15T14:00:00Z"));
  expect(view.lastCompleted?.kind).toBe("confirmation");
  expect(view.nextScheduled?.kind).toBe("ultrasound");
  expect(view.nextProposed?.kind).toBe("prenatal");
 });
 it("keeps a past scheduled visit unresolved without proof of completion", () => {
  const view=pregnancyAppointmentSnapshot([
   {kind:"prenatal",at:"2026-11-10T14:00:00Z",status:"scheduled"},
  ],new Date("2026-11-15T14:00:00Z"));
  expect(view.lastCompleted).toBeNull();
  expect(view.overdueScheduled).toHaveLength(1);
 });
});
