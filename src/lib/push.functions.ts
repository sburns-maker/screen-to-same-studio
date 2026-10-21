import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Register (or refresh) this device's Web Push subscription. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        endpoint: z.string().url().max(1000),
        keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
        userAgent: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: data.endpoint, keys: data.keys, user_agent: data.userAgent ?? null },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpoint: z.string().url().max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint).eq("user_id", context.userId);
    return { ok: true };
  });

/** Permission + subscription state for the Settings status indicator. */
export const pushStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, last_used_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return { subscriptions: data ?? [], configured: true };
  });

/** Send a real Web Push test notification to every subscribed device. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWebPush } = await import("./webpush.server");
    const { VAPID_PUBLIC_KEY } = await import("./push-config");
    const vapidPrivate = process.env["VAPID_PRIVATE_KEY"];
    if (!vapidPrivate) throw new Error("Push is not configured on the server yet.");
    const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", userId);
    if (!subs?.length) throw new Error("No devices subscribed. Turn on background notifications first.");
    let sent = 0;
    const failures: string[] = [];
    for (const sub of subs) {
      try {
        const r = await sendWebPush(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify({ title: "Chats", body: "Test notification — background push is working.", url: "/inbox", tag: "test-push" }),
          VAPID_PUBLIC_KEY,
          vapidPrivate,
        );
        if (r.ok) sent++;
        else {
          failures.push(`status ${r.status}`);
          if (r.gone) await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message.slice(0, 80) : "error");
      }
    }
    return { sent, failed: failures.length, failures };
  });

/** Global quiet hours (wall-clock, America/New_York). Nulls disable them. */
export const updateQuietHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        quietStart: z.number().int().min(0).max(23).nullable(),
        quietEnd: z.number().int().min(0).max(23).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("user_profile")
      .upsert({ user_id: userId, quiet_start: data.quietStart, quiet_end: data.quietEnd, updated_at: new Date().toISOString() });
    return { ok: true };
  });

export const quietHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_profile")
      .select("quiet_start, quiet_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { quietStart: data?.quiet_start ?? null, quietEnd: data?.quiet_end ?? null };
  });

/**
 * Developer-only Living World Timeline: recent world events, job history and
 * the durable AI-pause state. world_events is owner-RLS (user's own rows);
 * job_runs is service-role only, read here through the admin client after auth.
 */
export const worldTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: events } = await supabase
      .from("world_events")
      .select("id, character_key, kind, summary, payload, occurs_at, processed_at")
      .eq("user_id", userId)
      .order("occurs_at", { ascending: false })
      .limit(60);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: jobs }, { data: control }] = await Promise.all([
      supabaseAdmin.from("job_runs").select("id, job, status, detail, started_at, finished_at").order("started_at", { ascending: false }).limit(20),
      supabaseAdmin.from("world_control").select("key, value, updated_at"),
    ]);
    return { events: events ?? [], jobs: jobs ?? [], control: control ?? [] };
  });

/** Manually run one world tick (developer debug action). */
export const runWorldTickNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runWorldTick } = await import("./world.server");
    return runWorldTick();
  });
