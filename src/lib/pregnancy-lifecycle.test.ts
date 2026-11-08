import { describe, expect, it } from "vitest";
import { canRecordPregnancyChoice, canResolvePregnancy, characterPregnancySymptoms, pregnancySymptomOptions, duePregnancyMilestones, dueAutomaticPregnancyStages, postpartumProgress, pregnancyProgress } from "./pregnancy-lifecycle";

const start = "2026-11-01T19:00:00-05:00";
const later = (days: number) => new Date(Date.parse(start) + days * 86400000);
describe("60-day pregnancy lifecycle", () => {
 it("starts at gestational day 14 and reaches 280 after 60 real days", () => {
  expect(pregnancyProgress(start,later(0)).gestationalDay).toBe(14);
  expect(pregnancyProgress(start,later(60)).gestationalDay).toBe(280);
  expect(pregnancyProgress(start,later(60)).due).toBe(true);
 });
 it("clamps time and supports overdue clock without changing an outcome", () => {
  expect(pregnancyProgress(start,later(-5)).gestationalDay).toBe(14);
  expect(pregnancyProgress(start,later(90)).gestationalDay).toBe(280);
 });
 it("emits only unprocessed due milestones", () => {
  const due=duePregnancyMilestones(start,later(30),[]);
  expect(due.length).toBeGreaterThan(2);
  expect(duePregnancyMilestones(start,later(30),due.map(m=>m.key))).toHaveLength(0);
 });
 it("advances trimester and term stages without inventing medical visits or childbirth", () => {
  expect(dueAutomaticPregnancyStages(start,later(0))).toEqual([]);
  const stages=dueAutomaticPregnancyStages(start,later(60)).map(m=>m.key);
  expect(stages).toEqual(["second_trimester","third_trimester","term"]);
  expect(stages).not.toContain("early_ultrasound");
  expect(stages).not.toContain("initial_visit");
  expect(stages).not.toContain("birth_preparation");
 });
 it("does not allow the player to set a character's choice", () => {
  expect(canRecordPregnancyChoice("undecided","continue",false)).toBe(false);
  expect(canRecordPregnancyChoice("undecided","continue",true)).toBe(true);
 });
 it("keeps all outcome decisions explicit, including birth", () => {
  expect(canResolvePregnancy("pregnant","ended_birth",false)).toBe(false);
  expect(canResolvePregnancy("pregnant","ended_birth",true)).toBe(true);
  expect(canResolvePregnancy("ended_birth","ended_birth",true)).toBe(false);
 });
 it("uses a separate postpartum clock", () => {
  expect(postpartumProgress(start,later(0)).stage).toBe("newborn");
  expect(postpartumProgress(start,later(31)).stage).toBe("infant");
  expect(postpartumProgress(start,later(92)).stage).toBe("toddler");
 });

 it("offers stage-specific symptoms without requiring any", () => {
  expect(pregnancySymptomOptions(3)).toEqual([]);
  expect(pregnancySymptomOptions(8)).toContain("nausea");
  expect(pregnancySymptomOptions(34)).toContain("sleep_disruption");
  expect(characterPregnancySymptoms(8,123)).toEqual(characterPregnancySymptoms(8,123));
 });

});
