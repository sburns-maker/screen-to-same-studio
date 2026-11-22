import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const tessBackgroundStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_profile").select("value")
      .eq("user_id", context.userId).eq("key", "tess_background_paused").maybeSingle();
    if (error) throw new Error("Unable to load the Tess background setting");
    return { paused: data?.value === "true" };
  });

export const setTessBackgroundPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ paused: z.boolean() }).parse(v))
  .handler(async ({ context, data }) => {
    // One user's private setting; no global cron or world control mutations.
    const { error } = await context.supabase.from("user_profile").upsert({
      user_id: context.userId, key: "tess_background_paused",
      value: data.paused ? "true" : "false",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,key" });
    if (error) throw new Error("Unable to update Tess background setting");
    return { paused: data.paused };
  });
