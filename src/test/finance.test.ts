import { describe, expect, it } from "vitest";
import { estimatedMonthlyPayment, financeSnapshotSchema, money } from "../lib/finance";
describe("private living-world finance calculations", () => {
  it("formats USD and calculates declining-balance first payment", () => {
    expect(money(2500000000)).toBe("$25,000,000");
    expect(estimatedMonthlyPayment(0)).toBe(0);
    const financed = 42500000 * 0.75;
    expect(estimatedMonthlyPayment(financed)).toBeGreaterThan(financed / 120);
  });
  it("rejects malformed wealth visibility", () => {
    expect(financeSnapshotSchema.safeParse({
      cashCents: 2500000000, investmentsCents: 1500000000,
      visibility: "private", assets: [], transactions: [],
    }).success).toBe(true);
    expect(financeSnapshotSchema.safeParse({
      cashCents: 2500000000, investmentsCents: 1500000000,
      visibility: "everyone_knows", assets: [], transactions: [],
    }).success).toBe(false);
  });
});
