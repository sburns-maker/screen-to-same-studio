/**
 * Living-world engine: a bounded, idempotent server-side tick that advances
 * every character's simulated life while the app is closed. Runs from the
 * managed cron route (/api/public/jobs/world-tick) and from the developer
 * "run tick now" debug action.
 *
 * Design rules (see spec §9/§14):
 * - Event-driven, not continuous: a conversation is only considered when its
 *   last world check is older than TICK_INTERVAL_MINUTES.
 * - Bounded: at most MAX_USERS users, MAX_AI_CALLS generations per run.
 * - Single-flight: a lease row in job_runs prevents overlapping runs.
 * - Idempotent: initiation is recorded in tess_life.last_initiated_at and
 *   world_events; a re-run within the gap cannot double-send.
 * - Circuit breaker: an AI 402/403 pauses the run (status 'paused') and no
 *   further AI calls are made; the next scheduled run probes once.
 * - No backlog floods: catch-up never generates more than one initiated
 *   message per character per run, regardless of how long the user was away.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { characterAvailability, characterFor } from "./characters";
import { activeLifeEvent, decideInitiation, scheduleFor, weatherFlavor } from "./tess-life";
import { deriveStage, type TessState, STATE_KEYS, SEED_STATE } from "./tess-logic";
import { sendWebPush, type PushTarget } from "./webpush.server";
import { VAPID_PUBLIC_KEY } from "./push-config";

type Admin = SupabaseClient<Database>;

export const TICK_INTERVAL_MINUTES = 30;
export const MAX_USERS_PER_RUN = 20;
export const MAX_AI_CALLS_PER_RUN = 4;
const LEASE_MINUTES = 3;

function pickState(row: Record<string, unknown> | null | undefined): TessState {
  const s = {} as TessState;
  for (const k of STATE_KEYS) s[k] = Number(row?.[k] ?? SEED_STATE[k]);
  return s;
}

/** Quiet hours are wall-clock hours in America/New_York; nulls mean "no quiet hours". */
export function inQuietHours(now: Date, quietStart: number | null, quietEnd: number | null): boolean {
  if (quietStart == null || quietEnd == null) return false;
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now)) % 24;
  return quietStart > quietEnd ? h >= quietStart || h < quietEnd : h >= quietStart && h < quietEnd;
}

/** Which conversations are due for a world check right now. Pure + tested. */
export function isDue(lastCheckIso: string | null | undefined, now: Date, intervalMinutes = TICK_INTERVAL_MINUTES): boolean {
  if (!lastCheckIso) return true;
  return now.getTime() - new Date(lastCheckIso).getTime() >= intervalMinutes * 60_000;
}

async function acquireLease(admin: Admin): Promise<{ runId: string } | null> {
  const since = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();
  const { data: running } = await admin
    .from("job_runs")
    .select("id")
    .eq("job", "world-tick")
    .eq("status", "running")
    .gte("started_at", since)
    .limit(1);
  if (running?.length) return null;
  const { data, error } = await admin.from("job_runs").insert({ job: "world-tick", status: "running" }).select("id").single();
  if (error || !data) return null;
  return { runId: data.id };
}

async function finishRun(admin: Admin, runId: string, status: "ok" | "failed" | "paused", detail: Record<string, unknown>) {
  await admin
    .from("job_runs")
    .update({ status, detail, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

async function pushToUser(
  admin: Admin,
  userId: string,
  payload: { title: string; body: string; url: string; tag: string },
): Promise<{ sent: number; removed: number; skipped: string | null }> {
  const vapidPrivate = process.env["VAPID_PRIVATE_KEY"];
  if (!vapidPrivate) return { sent: 0, removed: 0, skipped: "no VAPID key" };
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", userId);
  if (!subs?.length) return { sent: 0, removed: 0, skipped: "no subscriptions" };
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, keys: sub.keys as PushTarget["keys"] },
        JSON.stringify(payload),
        VAPID_PUBLIC_KEY,
        vapidPrivate,
      );
      if (result.ok) {
        sent++;
        await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
      } else if (result.gone) {
        removed++;
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    } catch {
      // One bad subscription must not block the others.
    }
  }
  return { sent, removed, skipped: null };
}

export type TickReport = {
  runId: string | null;
  skipped: boolean;
  users: number;
  conversationsChecked: number;
  initiated: { conversationId: string; character: string; reason: string | null }[];
  pushed: number;
  aiCalls: number;
  paused: boolean;
  errors: string[];
};

export async function runWorldTick(): Promise<TickReport> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const report: TickReport = {
    runId: null,
    skipped: false,
    users: 0,
    conversationsChecked: 0,
    initiated: [],
    pushed: 0,
    aiCalls: 0,
    paused: false,
    errors: [],
  };

  const lease = await acquireLease(admin);
  if (!lease) {
    report.skipped = true;
    return report;
  }
  report.runId = lease.runId;

  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Users with any conversation activity, most recent first, bounded.
    const { data: convRows } = await admin
      .from("conversations")
      .select("id, user_id, character_id, difficulty, muted, last_read_at, real_time_mode, character:characters(key)")
      .order("updated_at", { ascending: false })
      .limit(200);
    const byUser = new Map<string, typeof convRows>();
    for (const c of convRows ?? []) {
      const list = byUser.get(c.user_id) ?? [];
      if (list.length < 5) list.push(c);
      byUser.set(c.user_id, list);
    }
    const users = [...byUser.entries()].slice(0, MAX_USERS_PER_RUN);
    report.users = users.length;

    const { getWeatherContext } = await import("./tess-weather.server");
    const weather = await getWeatherContext().catch(() => null);
    const flavor = weather ? weatherFlavor(weather) : null;

    for (const [userId, convs] of users) {
      if (report.aiCalls >= MAX_AI_CALLS_PER_RUN || report.paused) break;
      const { data: profile } = await admin
        .from("user_profile")
        .select("quiet_start, quiet_end")
        .eq("user_id", userId)
        .maybeSingle();

      for (const conv of convs ?? []) {
        if (report.aiCalls >= MAX_AI_CALLS_PER_RUN || report.paused) break;
        const def = characterFor((conv.character as { key?: string } | null)?.key);
        const isTess = def.key === "tess";

        const [{ data: life }, { data: last }, { data: stateRow }, { data: recentMsgs }] = await Promise.all([
          admin.from("tess_life").select("*").eq("conversation_id", conv.id).maybeSingle(),
          admin
            .from("messages")
            .select("created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          admin.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
          admin
            .from("messages")
            .select("sender, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

        // Throttle: skip conversations checked recently (event-driven, not continuous).
        const lastCheck = (life?.last_initiation as { at?: string } | null)?.at ?? null;
        if (!isDue(lastCheck, now)) continue;
        report.conversationsChecked++;

        const gapHours = last ? (now.getTime() - new Date(last.created_at).getTime()) / 3_600_000 : 999;
        const state = pickState(stateRow);
        const lifeEvent = isTess
          ? activeLifeEvent(now, weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined)
          : null;
        const schedule = isTess
          ? scheduleFor(now, conv.difficulty === "chaos" ? 2 : 1)
          : (() => {
              const a = characterAvailability(def, now);
              return { activity: a.detail, availability: a.availability, detail: a.detail };
            })();
        const list = recentMsgs ?? [];
        const userCount = list.filter((m) => m.sender === "user").length;
        const contactCount = list.filter((m) => m.sender === "tess").length;
        const hasPlausibleReason = !!(flavor || lifeEvent || state.relationship_momentum > 35 || state.curiosity > 55);

        const decision = decideInitiation({
          state,
          stage: deriveStage(state),
          gapHours,
          lastInitiatedAt: life?.last_initiated_at ? new Date(life.last_initiated_at) : null,
          userCarrying: userCount > contactCount * 1.6 && userCount >= 5,
          recentQuality: Math.min(100, state.relationship_momentum + state.playfulness / 2),
          schedule,
          lifeEvent,
          hasPlausibleReason,
          now,
          minGapHours: def.initiation.minGapHours,
          scoreMultiplier: def.initiation.scoreMultiplier,
        });

        // Record the check regardless of outcome (debug "why / why not").
        await admin.from("tess_life").upsert({
          conversation_id: conv.id,
          user_id: userId,
          current_event: lifeEvent ? { ...lifeEvent } : {},
          last_initiation: {
            at: nowIso,
            eligible: decision.eligible,
            initiated: decision.initiate,
            score: decision.score,
            chance: decision.chance,
            reasons: decision.reasons,
            source: "world-tick",
          },
          updated_at: nowIso,
        });

        if (!decision.initiate) continue;

        // Generate the initiated message through the SAME turn pipeline as the
        // interactive path, so tone/photos/latency rules stay identical.
        const reason = lifeEvent?.summary ?? flavor ?? null;
        try {
          report.aiCalls++;
          const { runTurn } = await import("./tess.functions");
          const result = await runTurn(admin, userId, conv.id, "America/New_York", { gapHours, reason });
          if (result.count > 0) {
            await admin.from("tess_life").update({ last_initiated_at: nowIso, updated_at: nowIso }).eq("conversation_id", conv.id);
            report.initiated.push({ conversationId: conv.id, character: def.preferredName, reason });
            await admin.from("world_events").insert({
              user_id: userId,
              conversation_id: conv.id,
              character_key: def.key,
              kind: "initiation",
              summary: `${def.preferredName} texted first${reason ? ` — ${reason}` : ""}`,
              payload: { score: decision.score, reasons: decision.reasons, gapHours: Math.round(gapHours * 10) / 10 },
            });

            // Background push — one per conversation per tick, deduped by tag.
            if (!conv.muted && !inQuietHours(now, profile?.quiet_start ?? null, profile?.quiet_end ?? null)) {
              const push = await pushToUser(admin, userId, {
                title: def.preferredName,
                body: "New message",
                url: `/chat/${conv.id}`,
                tag: `conv-${conv.id}`,
              });
              report.pushed += push.sent;
              await admin.from("world_events").insert({
                user_id: userId,
                conversation_id: conv.id,
                character_key: def.key,
                kind: "notification",
                summary: push.sent > 0 ? `Push sent to ${push.sent} device(s)` : `Push skipped (${push.skipped ?? "none delivered"})`,
                payload: { ...push },
              });
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/\b(402|403)\b/.test(msg)) {
            // Circuit breaker: credits/policy block — pause the run, no more AI.
            report.paused = true;
            report.errors.push(`AI paused: ${msg.slice(0, 120)}`);
            break;
          }
          report.errors.push(`${def.key}: ${msg.slice(0, 120)}`);
        }
      }
    }

    await finishRun(admin, lease.runId, report.paused ? "paused" : "ok", {
      users: report.users,
      conversationsChecked: report.conversationsChecked,
      initiated: report.initiated.length,
      pushed: report.pushed,
      aiCalls: report.aiCalls,
      errors: report.errors,
    });
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e));
    await finishRun(admin, lease.runId, "failed", { error: report.errors[0] });
  }
  return report;
}
