import { describe, expect, it } from "vitest";
import { estimatedMonthlyPayment, financeSnapshotSchema, money } from "../lib/finance";

describe("private living-world finances", () => {
  it("formats billionaire balances without losing cents", () => {
    expect(money(500000000000)).toBe("$5,000,000,000");
    expect(estimatedMonthlyPayment(0)).toBe(0);
    expect(estimatedMonthlyPayment(200000000000)).toBeGreaterThan(0);
  });
  it("requires private or explicitly disclosed wealth", () => {
    const fixture = {
      cashCents: 500000000000,
      investmentsCents: 300000000000,
      visibility: "private", financePace:"7 virtual days per real day", virtualDate:"2026-11-14", playerSalaryCents:10000000, workers:[],
      assets:[],transactions:[],
    };
    expect(financeSnapshotSchema.safeParse(fixture).success).toBe(true);
    expect(financeSnapshotSchema.safeParse({...fixture,visibility:"everyone_knows"}).success).toBe(false);
  });
  it("validates company reserves and owner distribution rates", () => {
    const fixture = {
      cashCents: 500000000000, investmentsCents: 300000000000,
      visibility:"private",financePace:"7 virtual days per real day",virtualDate:"2026-11-14",playerSalaryCents:10000000,workers:[],transactions:[],
      assets:[{
        key:"work:upmc-altoona",label:"UPMC Altoona",category:"business",
        workplaceKey:"work:riley",priceCents:200000000000,
        monthlyProfitCents:5000000000,monthlyCostCents:400000000,
        baselineRevenueCents:5000000000,companyReservesCents:0,ownerDrawPct:60,
        staffCount:4500,owned:false,loanCents:0,loanMonthsLeft:0,ownerSince:null,
      }],
    };
    expect(financeSnapshotSchema.safeParse(fixture).success).toBe(true);
    expect(financeSnapshotSchema.safeParse({...fixture,assets:[{...fixture.assets[0],ownerDrawPct:"nope"}]}).success).toBe(false);
  });
});
