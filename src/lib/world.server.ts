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
 * - Single-flight: a partial unique index on job_runs makes the lease atomic;
 *   a crashed run's stale lease is reclaimed after LEASE_MINUTES.
 * - Idempotent: initiation is recorded in tess_life.last_initiated_at and
 *   world_events; pushes are deduped by a metadata.pushed flag on the message.
 * - Circuit breaker: an AI 402/403 durably pauses the world (world_control
 *   'ai_pause'); while paused each run makes at most one probe call and
 *   resumes only after a probe succeeds.
 * - No backlog floods: catch-up never generates more than one initiated
 *   message per character per run, regardless of how long the user was away.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { characterAvailability, characterFor } from "./characters";
import { activeLifeEvent, decideInitiation, scheduleFor, weatherFlavor } from "./tess-life";
import { deriveStage, type TessState, STATE_KEYS, SEED_STATE } from "./tess-logic";
import { sendWebPush, type PushTarget } from "./webpush.server";
import { VAPID_PUBLIC_KEY } from "./push-config";
import { runSocialTick } from "./social.server";
import { storylineContext } from "./storyline.server";
import { storySchedule } from "./storyline-logic";

type Admin = SupabaseClient<Database>;

export const TICK_INTERVAL_MINUTES = 30;
export const MAX_USERS_PER_RUN = 20;
export const MAX_AI_CALLS_PER_RUN = 4;
export const MAX_PUSH_SWEEP_PER_RUN = 10;
const LEASE_MINUTES = 3;

function pickState(row: Record<string, unknown> | null | undefined): TessState {
  const s = {} as TessState;
  for (const k of STATE_KEYS) s[k] = Number(row?.[k] ?? SEED_STATE[k]);
  return s;
}

/** Quiet hours are stored as a user_profile fact row: key 'quiet_hours', value "23-7" (or empty = off). */
export function parseQuietHours(value: string | null | undefined): { start: number | null; end: number | null } {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(value ?? "");
  if (!m) return { start: null, end: null };
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start > 23 || end > 23) return { start: null, end: null };
  return { start, end };
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

/**
 * Atomic lease: a partial unique index (job_runs_one_running) allows only one
 * 'running' row per job. Stale leases (crashed runs) are reclaimed first.
 */
async function acquireLease(admin: Admin): Promise<{ runId: string } | null> {
  const staleBefore = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();
  await admin
    .from("job_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), detail: { error: "lease expired (stale run reclaimed)" } })
    .eq("job", "world-tick")
    .eq("status", "running")
    .lt("started_at", staleBefore);
  const { data, error } = await admin.from("job_runs").insert({ job: "world-tick", status: "running" }).select("id").single();
  if (error || !data) return null; // unique violation = another run holds the lease
  return { runId: data.id };
}

async function finishRun(admin: Admin, runId: string, status: "ok" | "failed" | "paused", detail: Record<string, unknown>) {
  await admin
    .from("job_runs")
    .update({ status, detail: detail as unknown as Json, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

/** Durable AI pause state (survives across runs and restarts). */
async function readAiPause(admin: Admin): Promise<{ paused: boolean; reason?: string | undefined; since?: string | undefined }> {
  const { data } = await admin.from("world_control").select("value").eq("key", "ai_pause").maybeSingle();
  const v = (data?.value ?? {}) as { paused?: boolean; reason?: string; since?: string };
  return { paused: !!v.paused, reason: v.reason, since: v.since };
}

async function writeAiPause(admin: Admin, paused: boolean, reason?: string) {
  await admin.from("world_control").upsert({
    key: "ai_pause",
    value: paused ? { paused: true, reason: reason ?? "AI credits/policy block", since: new Date().toISOString() } : { paused: false },
    updated_at: new Date().toISOString(),
  });
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
  aiPausedGlobally: boolean;
  social: { eventsNew: number; knowledgeAdded: number; linkChanges: number; storylinesStarted: number; storylinesAdvanced: number };
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
    aiPausedGlobally: false,
    social: { eventsNew: 0, knowledgeAdded: 0, linkChanges: 0, storylinesStarted: 0, storylinesAdvanced: 0 },
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
    const aiPause = await readAiPause(admin);
    report.aiPausedGlobally = aiPause.paused;
    // While paused, each run may make exactly one probe call; a successful
    // probe lifts the pause, a failed one keeps it (background-jobs rules).
    const aiBudget = aiPause.paused ? 1 : MAX_AI_CALLS_PER_RUN;

    // --- Push sweep: delayed replies that became visible since the last tick.
    // Covers interactive-path messages (visible_at in the future when written).
    // Dedupe: metadata.pushed is set in the same step as the push attempt.
    const { data: due } = await admin
      .from("messages")
      .select("id, conversation_id, user_id, body, created_at, metadata, conversation:conversations(muted, last_read_at, character:characters(key, preferred_name))")
      .eq("sender", "tess")
      .lte("visible_at", nowIso)
      .gte("created_at", new Date(now.getTime() - 24 * 3_600_000).toISOString())
      .is("metadata->>pushed", null)
      .order("created_at", { ascending: true })
      .limit(MAX_PUSH_SWEEP_PER_RUN);

    for (const msg of due ?? []) {
      const conv = msg.conversation as {
        muted?: boolean;
        last_read_at?: string | null;
        character?: { key?: string; preferred_name?: string } | null;
      } | null;
      // Mark first so a retry never double-notifies, even if the push fails.
      const md = { ...((msg.metadata as Record<string, unknown>) ?? {}), pushed: true };
      await admin.from("messages").update({ metadata: md }).eq("id", msg.id);
      if (conv?.muted) continue;
      if (conv?.last_read_at && new Date(conv.last_read_at) >= new Date(msg.created_at)) continue; // already seen
      const { data: profile } = await admin
        .from("user_profile")
        .select("value")
        .eq("user_id", msg.user_id)
        .eq("key", "quiet_hours")
        .maybeSingle();
      const qh = parseQuietHours(profile?.value);
      if (inQuietHours(now, qh.start, qh.end)) continue;
      const name = conv?.character?.preferred_name ?? "Chats";
      const push = await pushToUser(admin, msg.user_id, {
        title: name,
        body: msg.body?.slice(0, 80) || "New message",
        url: `/chat/${msg.conversation_id}`,
        tag: `conv-${msg.conversation_id}`,
      });
      report.pushed += push.sent;
      if (push.sent > 0 || push.removed > 0) {
        await admin.from("world_events").insert({
          user_id: msg.user_id,
          conversation_id: msg.conversation_id,
          character_key: conv?.character?.key ?? "unknown",
          kind: "notification",
          summary: push.sent > 0 ? `Push sent to ${push.sent} device(s)` : `Push skipped (${push.skipped ?? "none delivered"})`,
          payload: { ...push, messageId: msg.id },
        });
      }
    }

    // --- Initiation checks. Least-recently-active conversations first so quiet
    // users' worlds keep moving; active users already get interactive turns.
    const { data: convRows } = await admin
      .from("conversations")
      .select("id, user_id, character_id, difficulty, muted, last_read_at, real_time_mode, character:characters(key)")
      .order("updated_at", { ascending: true })
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

    let probeAttempted = false;
    for (const [userId, convs] of users) {
      const { data: profile } = await admin
        .from("user_profile")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "quiet_hours")
        .maybeSingle();
      const quiet = parseQuietHours(profile?.value);

      // Social world: independent circles, shared events, knowledge
      // propagation. Structured simulation only — bounded, idempotent, no AI.
      try {
        const social = await runSocialTick(admin, userId, now);
        report.social.eventsNew += social.eventsNew;
        report.social.knowledgeAdded += social.knowledgeAdded;
        report.social.linkChanges += social.linkChanges;
        report.social.storylinesStarted += social.storylinesStarted;
        report.social.storylinesAdvanced += social.storylinesAdvanced;
      } catch (e) {
        report.errors.push(`social: ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`);
      }

      for (const conv of convs ?? []) {
        if (report.aiCalls >= aiBudget || report.paused) break;
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
        const story = await storylineContext(admin, userId, def.key, now);
        const lifeEvent = story.event ?? (isTess
          ? activeLifeEvent(now, weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined)
          : null);
        const schedule = storySchedule(isTess
          ? scheduleFor(now, conv.difficulty === "chaos" ? 2 : 1)
          : (() => {
              const a = characterAvailability(def, now);
              return { activity: a.detail, availability: a.availability, detail: a.detail };
            })(), story.event);
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
          if (aiPause.paused) probeAttempted = true;
          const { runTurn } = await import("./tess.functions");
          const result = await runTurn(admin, userId, conv.id, "America/New_York", { gapHours, reason });
          if (aiPause.paused && probeAttempted) {
            // Probe succeeded — lift the durable pause.
            await writeAiPause(admin, false);
            report.aiPausedGlobally = false;
          }
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

            // Immediate push for the initiation (its visible_at is ~seconds out,
            // so the next sweep would be up to a tick late). Mark messages pushed.
            if (!conv.muted && !inQuietHours(now, quiet.start, quiet.end)) {
              const push = await pushToUser(admin, userId, {
                title: def.preferredName,
                body: "New message",
                url: `/chat/${conv.id}`,
                tag: `conv-${conv.id}`,
              });
              report.pushed += push.sent;
              // Mark the just-written messages pushed (merge, don't overwrite metadata).
              const { data: newMsgs } = await admin
                .from("messages")
                .select("id, metadata")
                .eq("conversation_id", conv.id)
                .eq("sender", "tess")
                .gte("created_at", nowIso)
                .is("metadata->>pushed", null);
              for (const m of newMsgs ?? []) {
                await admin
                  .from("messages")
                  .update({ metadata: { ...((m.metadata as Record<string, unknown>) ?? {}), pushed: true } })
                  .eq("id", m.id);
              }
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
            // Circuit breaker: credits/policy block — durably pause the world.
            report.paused = true;
            report.errors.push(`AI paused: ${msg.slice(0, 120)}`);
            await writeAiPause(admin, true, msg.slice(0, 200));
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
      aiPausedGlobally: report.aiPausedGlobally,
      social: report.social,
      errors: report.errors,
    });
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e));
    await finishRun(admin, lease.runId, "failed", { error: report.errors[0] });
  }
  return report;
}
