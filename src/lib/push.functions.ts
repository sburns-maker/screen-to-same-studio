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
