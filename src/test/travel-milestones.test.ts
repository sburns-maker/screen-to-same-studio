import { describe,expect,it } from "vitest";
import { advanceTravelGoal, canDiscussCouplesTravel, ICELAND_WINTER_IDEAS, TESS_ICELAND_GOAL } from "@/lib/travel-milestones";
import { SEED_STATE } from "@/lib/tess-logic";
describe("Iceland relationship travel",()=>{
 it("keeps Tess's Iceland dream an aspiration rather than a booked trip",()=>{
  expect(TESS_ICELAND_GOAL.phase).toBe("dream");
  expect(TESS_ICELAND_GOAL.bothAgreed).toBe(false);
  expect(canDiscussCouplesTravel(SEED_STATE)).toBe(false);
 });
 it("requires agreement and dates before confirming",()=>{
  const discussing=advanceTravelGoal(TESS_ICELAND_GOAL,"discussing");
  const planning=advanceTravelGoal(discussing,"planning");
  expect(()=>advanceTravelGoal(planning,"confirmed",{})).toThrow();
  const confirmed=advanceTravelGoal(planning,"confirmed",{mutualAgreement:true,start:"2027-02-01",end:"2027-02-08"});
  expect(confirmed.phase).toBe("confirmed");
  expect(()=>advanceTravelGoal(confirmed,"completed")).toThrow();
  expect(()=>advanceTravelGoal(confirmed,"traveling")).toThrow();
  const traveling=advanceTravelGoal(confirmed,"traveling",{started:true});
  expect(advanceTravelGoal(traveling,"completed",{finished:true}).phase).toBe("completed");
 });
 it("makes wintry experience moments available without asserting they already happened",()=>{
  expect(ICELAND_WINTER_IDEAS.length).toBeGreaterThanOrEqual(5);
 });
});
