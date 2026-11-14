import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { financeSnapshotSchema } from "./finance";

export const loadFinances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await db.rpc("finance_snapshot" as never, { p_user: context.userId } as never);
    if (result.error) throw new Error("Financial world unavailable. Apply migration 0080 first.");
    return financeSnapshotSchema.parse(result.data);
  });

export const changeFinances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    requestId: z.string().uuid(),
    action: z.enum(["purchase", "sell", "hide", "disclose"]),
    assetKey: z.string().max(90).default(""),
    financed: z.boolean().default(false),
  }).parse(value))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await db.rpc("finance_action" as never, {
      p_user: context.userId, p_request: data.requestId, p_action: data.action,
      p_asset: data.assetKey, p_finance: data.financed,
    } as never);
    if (result.error) {
      const known = ["Unknown fictional asset", "Insufficient fictional funds", "Asset action not allowed"];
      throw new Error(known.includes(result.error.message) ? result.error.message : "Transaction was not completed. Refresh your finances.");
    }
    return financeSnapshotSchema.parse(result.data);
  });

export const setEmployeeSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    requestId: z.string().uuid(),
    assetKey: z.string().max(90),
    workerKey: z.string().max(90),
    salaryCents: z.number().int().min(0).max(50000000000),
  }).parse(value))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await db.rpc("finance_set_salary" as never, {
      p_user: context.userId,p_request: data.requestId,p_asset: data.assetKey,
      p_worker: data.workerKey,p_salary: data.salaryCents,
    } as never);
    if (result.error) {
      const allowed = ["Salary out of bounds","Business ownership required","Unknown active employee"];
      throw new Error(allowed.includes(result.error.message) ? result.error.message : "Could not update fictional salary.");
    }
    return financeSnapshotSchema.parse(result.data);
  });

export const ownerDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    requestId: z.string().uuid(), assetKey: z.string().max(90),
    amountCents: z.number().int().positive().max(100000000000000),
  }).parse(value))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await db.rpc("finance_owner_draw" as never, {
      p_user: context.userId,p_request: data.requestId,p_asset: data.assetKey,p_amount: data.amountCents,
    } as never);
    if(result.error) {
      const known=["Draw must be positive","Owned business required","Not enough company reserves"];
      throw new Error(known.includes(result.error.message)?result.error.message:"Owner draw could not be completed.");
    }
    return financeSnapshotSchema.parse(result.data);
  });

export const setDrawRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    requestId: z.string().uuid(), assetKey: z.string().max(90),
    percent: z.number().int().min(0).max(100),
  }).parse(value))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await db.rpc("finance_set_draw_rate" as never, {
      p_user: context.userId,p_request: data.requestId,p_asset: data.assetKey,p_rate: data.percent,
    } as never);
    if(result.error) throw new Error("Draw percentage could not be changed.");
    return financeSnapshotSchema.parse(result.data);
  });
