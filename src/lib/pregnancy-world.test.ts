import { describe, expect, it } from "vitest";
import { pregnancyNextCheckpoint } from "./pregnancy-world";

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
