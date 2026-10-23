import { describe, expect, it } from "vitest";
import { canTransition, nextExperience, eligibleForAutomaticRomance, type Experience } from "@/lib/experience-lifecycle";
const start = new Date("2026-10-23T21:30:00Z");
const e: Experience = { id:"experience-1", planId:"plan-1", state:"scheduled", startAt:start.toISOString(), claimDeadline:"2026-10-24T01:30:00Z", claimedAt:null, mode:null, outcomeId:null, revision:0 };
describe("Experience Mode lifecycle", () => {
  it("allows joining after the listed start without falsely standing anyone up", () => {
    const at = new Date("2026-10-23T22:30:00Z");
    expect(nextExperience(e,"claim",at)).toMatchObject({state:"interactive",mode:"interactive",revision:1});
  });
  it("protects claimed, paused and resumed experiences from background simulation", () => {
    const at = new Date("2026-10-23T22:30:00Z");
    const claimed=nextExperience(e,"claim",at);
    const paused=nextExperience(claimed,"pause",at);
    expect(canTransition(claimed,"auto_claim",new Date("2026-10-24T03:00:00Z"))).toBe(false);
    expect(canTransition(paused,"auto_claim",new Date("2026-10-24T03:00:00Z"))).toBe(false);
    expect(nextExperience(paused,"resume",at).state).toBe("interactive");
  });
  it("only permits auto simulation after the claim deadline for an untouched event", () => {
    expect(canTransition(e,"auto_claim",new Date("2026-10-23T23:00:00Z"))).toBe(false);
    expect(nextExperience(e,"auto_claim",new Date("2026-10-24T01:30:00Z")).state).toBe("auto_running");
  });
  it("prevents applying a second outcome", () => {
    const at=new Date("2026-10-23T22:30:00Z");
    const done=nextExperience(nextExperience(e,"claim",at),"finish",at,"outcome-one");
    expect(done.outcomeId).toBe("outcome-one");
    expect(() => nextExperience(done,"finish",at,"outcome-two")).toThrow();
  });
  it("does not invent romantic milestones on autopilot", () => {
    expect(eligibleForAutomaticRomance([{kind:"affection",summary:"maybe we kiss",confirmed:false}])).toBe(false);
    expect(eligibleForAutomaticRomance([{kind:"affection",summary:"established mutual affection",confirmed:true}])).toBe(true);
  });
});
