import { describe, expect, it } from "vitest";
import { COUNTRY_NAMES } from "./world-order-countries";
import { empireDailyIncome, empireTotals, nationContribution } from "./world-order-empire";
import { newConquestWorld, restoreConquestWorld } from "./world-order-conquest";

describe("World Order empire dividends", () => {
 it("starts at zero with no foreign land or alliances", () => {
  const world=newConquestWorld();
  expect(empireTotals(world)).toEqual({
   incomePerDay:0,militaryStrength:0,influence:0,power:0,
   controlled:0,partners:0,protectorates:0,occupied:0,contributors:0,
  });
  expect(empireDailyIncome(world)).toBe(0);
 });
 it("gives all four automatic benefits to a controlled country", () => {
  const world=newConquestWorld();
  world.territory["Canada"]="controlled";
  const yields=empireTotals(world);
  expect(yields.controlled).toBe(1);
  expect(yields.incomePerDay).toBeGreaterThan(0);
  expect(yields.militaryStrength).toBeGreaterThan(0);
  expect(yields.influence).toBeGreaterThan(0);
  expect(yields.power).toBeGreaterThan(0);
  expect(empireDailyIncome(world)).toBe(yields.incomePerDay);
 });
 it("makes partners and protectorates useful but weaker than direct control", () => {
  for(const c of ["Canada","Brazil","Ghana"] as const) {
   const partner=nationContribution(c,"partner");
   const protectorate=nationContribution(c,"protectorate");
   const owned=nationContribution(c,"controlled");
   for(const field of ["incomePerDay","militaryStrength","influence","power"] as const) {
    expect(partner[field]).toBeGreaterThanOrEqual(0);
    expect(protectorate[field]).toBeGreaterThan(partner[field]);
    expect(owned[field]).toBeGreaterThan(protectorate[field]);
   }
  }
 });
 it("switching partnership to control upgrades the yield without stacking duplicate bonuses", () => {
  const w=newConquestWorld();
  w.territory["Mexico"]="partner";
  const partner=empireTotals(w);
  w.territory["Mexico"]="controlled";
  const controlled=empireTotals(w);
  expect(controlled.contributors).toBe(1);
  expect(controlled.partners).toBe(0);
  expect(controlled.controlled).toBe(1);
  expect(controlled.incomePerDay).toBeGreaterThan(partner.incomePerDay);
  expect(empireTotals(w)).toEqual(controlled);
 });
 it("sums yields for all 82 countries and retains them through save migration", () => {
  const world=newConquestWorld();
  for(const c of COUNTRY_NAMES)world.territory[c]="controlled";
  const totals=empireTotals(world);
  expect(totals.controlled).toBe(COUNTRY_NAMES.length);
  expect(totals.contributors).toBe(COUNTRY_NAMES.length);
  const restored=restoreConquestWorld(world);
  expect(empireTotals(restored)).toEqual(totals);
 });
 it("does not give independent countries payouts", () => {
  expect(nationContribution("United States","independent")).toEqual({
   incomePerDay:0,militaryStrength:0,influence:0,power:0,
  });
 });
});
