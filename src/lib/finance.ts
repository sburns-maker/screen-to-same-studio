import { z } from "zod";
export const financeAssetSchema = z.object({
  key: z.string(), label: z.string(), category: z.enum(["business","residential","commercial"]),
  workplaceKey: z.string().nullable(), priceCents: z.number(), monthlyProfitCents: z.number(),
  monthlyCostCents: z.number(), staffCount: z.number(), owned: z.boolean(),
  loanCents: z.number(), loanMonthsLeft: z.number(), ownerSince: z.string().nullable(),
  baselineRevenueCents: z.number(), companyReservesCents: z.number(), ownerDrawPct: z.number(),
});
export const financeSnapshotSchema = z.object({
  cashCents: z.number(), investmentsCents: z.number(), visibility: z.enum(["private","disclosed"]),
  playerSalaryCents: z.number(),
  financePace: z.literal("7 virtual days per real day"),
  virtualDate: z.string(),
  workers: z.array(z.object({ key:z.string(), assetKey:z.string(), name:z.string(), role:z.string(), salaryCents:z.number(), characterKey:z.string().nullable(), active:z.boolean() })),
  assets: z.array(financeAssetSchema),
  transactions: z.array(z.object({
    event_type: z.string(), amount_cents: z.number(), cash_after_cents: z.number(),
    asset_key: z.string().nullable(), note: z.string(), created_at: z.string(),
  })),
});
export type FinanceSnapshot = z.infer<typeof financeSnapshotSchema>;
export function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
export function estimatedMonthlyPayment(principalCents: number, months = 120, rate = 0.08): number {
  if (!principalCents) return 0;
  const r = rate / 12;
  return Math.ceil(principalCents / months + principalCents * r);
}
