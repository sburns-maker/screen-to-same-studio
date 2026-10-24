import { currentActivity } from "./world-continuity";
import {
  worldRuntimeAvailable,
  persistWorldCheckpoint,
  continuityContext,
  deferIntention,
  recordPhotoDecision,
  recordPhotoDecisionOutcome,
  reserveWorldAi,
} from "./world-runtime.server";
import { claimMessagePush, messagePushBody } from "./message-notifications.server";
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
import { characterFor } from "./characters";
import { activeLifeEvent, decideInitiation, weatherFlavor } from "./tess-life";
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
const LEASE_MINUTES = 15; // Four bounded text + image calls can exceed the former three-minute lease.

function pickState(row: Record<string, unknown> | null | undefined): TessState {
  const s = {} as TessState;
  for (const k of STATE_KEYS) s[k] = Number(row?.[k] ?? SEED_STATE[k]);
  return s;
}

/** Quiet hours are stored as a user_profile fact row: key 'quiet_hours', value "23-7" (or empty = off). */
export function parseQuietHours(value: string | null | undefined): {
  start: number | null;
  end: number | null;
} {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(value ?? "");
  if (!m) return { start: null, end: null };
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start > 23 || end > 23) return { start: null, end: null };
  return { start, end };
}

/** Quiet hours are wall-clock hours in America/New_York; nulls mean "no quiet hours". */
export function inQuietHours(
  now: Date,
  quietStart: number | null,
  quietEnd: number | null,
): boolean {
  if (quietStart == null || quietEnd == null) return false;
  const h =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(now),
    ) % 24;
  return quietStart > quietEnd ? h >= quietStart || h < quietEnd : h >= quietStart && h < quietEnd;
}

/** Which conversations are due for a world check right now. Pure + tested. */
export function isDue(
  lastCheckIso: string | null | undefined,
  now: Date,
  intervalMinutes = TICK_INTERVAL_MINUTES,
): boolean {
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
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      detail: { error: "lease expired (stale run reclaimed)" },
    })
    .eq("job", "world-tick")
    .eq("status", "running")
    .lt("started_at", staleBefore);
  const { data, error } = await admin
    .from("job_runs")
    .insert({ job: "world-tick", status: "running" })
    .select("id")
    .single();
  if (error || !data) return null; // unique violation = another run holds the lease
  return { runId: data.id };
}

async function finishRun(
  admin: Admin,
  runId: string,
  status: "ok" | "failed" | "paused",
  detail: Record<string, unknown>,
) {
  await admin
    .from("job_runs")
    .update({ status, detail: detail as unknown as Json, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

/** Durable AI pause state (survives across runs and restarts). */
async function readAiPause(
  admin: Admin,
): Promise<{ paused: boolean; reason?: string | undefined; since?: string | undefined }> {
  const { data } = await admin
    .from("world_control")
    .select("value")
    .eq("key", "ai_pause")
    .maybeSingle();
  const v = (data?.value ?? {}) as { paused?: boolean; reason?: string; since?: string };
  return { paused: !!v.paused, reason: v.reason, since: v.since };
}

async function writeAiPause(admin: Admin, paused: boolean, reason?: string) {
  await admin.from("world_control").upsert({
    key: "ai_pause",
    value: paused
      ? {
          paused: true,
          reason: reason ?? "AI credits/policy block",
          since: new Date().toISOString(),
        }
      : { paused: false },
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
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", userId);
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
        await admin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
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
  social: {
    eventsNew: number;
    knowledgeAdded: number;
    linkChanges: number;
    storylinesStarted: number;
    storylinesAdvanced: number;
  };
  errors: string[];
};

export async function runWorldTick(): Promise<TickReport> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  return runWorldTickWithAdmin(admin);
}

/** Injectable clock/database for offline integration tests. Production always uses the real clock. */
export async function runWorldTickWithAdmin(admin: Admin, now = new Date()): Promise<TickReport> {
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
    social: {
      eventsNew: 0,
      knowledgeAdded: 0,
      linkChanges: 0,
      storylinesStarted: 0,
      storylinesAdvanced: 0,
    },
    errors: [],
  };

  const lease = await acquireLease(admin);
  if (!lease) {
    report.skipped = true;
    return report;
  }
  report.runId = lease.runId;

  try {
    const worldReady = await worldRuntimeAvailable(admin);
    const nowIso = now.toISOString();
    const aiPause = await readAiPause(admin);
    report.aiPausedGlobally = aiPause.paused;
    // While paused, each run may make exactly one probe call; a successful
    // probe lifts the pause, a failed one keeps it (background-jobs rules).
    const aiBudget = aiPause.paused ? 1 : MAX_AI_CALLS_PER_RUN;

    // Resume prepared photo deliveries without another text/image call, even if a new initiation is not selected.
    const { data: photoJobs, error: photoJobError } = await admin
      .from("job_runs")
      .select("id, detail")
      .like("job", "photo-turn:%")
      .eq("status", "running")
      .eq("detail->>phase", "prepared")
      .limit(MAX_AI_CALLS_PER_RUN);
    if (photoJobError) report.errors.push("Photo recovery queue unavailable");
    for (const job of photoJobs ?? []) {
      const detail = job.detail as { conversationId?: string; userId?: string };
      if (!detail.conversationId || !detail.userId) continue;
      try {
        const { recoverPhotoDelivery } = await import("./photo-delivery.server");
        await recoverPhotoDelivery(admin, detail.conversationId, detail.userId);
      } catch {
        report.errors.push("A prepared photo remains queued for delivery");
      }
    }

    // --- Push sweep: delayed replies that became visible since the last tick.
    // Covers interactive-path messages (visible_at in the future when written).
    // Dedupe: metadata.pushed is set in the same step as the push attempt.
    const { data: due } = await admin
      .from("messages")
      .select(
        "id, conversation_id, user_id, body, created_at, metadata, conversation:conversations(muted, last_read_at, character:characters(key, preferred_name))",
      )
      .eq("sender", "tess")
      .lte("visible_at", nowIso)
      .gte("created_at", new Date(now.getTime() - 24 * 3_600_000).toISOString())
      .is("metadata->>pushed", null)
      .order("created_at", { ascending: true })
      .limit(MAX_PUSH_SWEEP_PER_RUN * 10);

    let pushAttempts = 0;
    for (const msg of due ?? []) {
      const conv = msg.conversation as {
        muted?: boolean;
        last_read_at?: string | null;
        character?: { key?: string; preferred_name?: string } | null;
      } | null;
      if (pushAttempts >= MAX_PUSH_SWEEP_PER_RUN) break;
      // Permanently suppress non-primary, muted and already-read bubbles so they cannot clog the queue.
      if (
        (msg.metadata as { push_primary?: boolean } | null)?.push_primary === false ||
        conv?.muted ||
        (conv?.last_read_at && new Date(conv.last_read_at) >= new Date(msg.created_at))
      ) {
        await claimMessagePush(admin, msg);
        continue;
      }
      const { data: profile } = await admin
        .from("user_profile")
        .select("value")
        .eq("user_id", msg.user_id)
        .eq("key", "quiet_hours")
        .maybeSingle();
      const qh = parseQuietHours(profile?.value);
      if (inQuietHours(now, qh.start, qh.end)) continue;
      if (!(await claimMessagePush(admin, msg))) continue;
      pushAttempts++;
      const name = conv?.character?.preferred_name ?? "Chats";
      const push = await pushToUser(admin, msg.user_id, {
        title: name,
        body: messagePushBody(msg),
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
          summary:
            push.sent > 0
              ? `Push sent to ${push.sent} device(s)`
              : `Push skipped (${push.skipped ?? "none delivered"})`,
          payload: { ...push, messageId: msg.id },
        });
      }
    }

    // --- Durable cursor prevents active or quiet conversations from starving later users.
    const { data: cursorRow } = await admin
      .from("world_control")
      .select("value")
      .eq("key", "world_cursor")
      .maybeSingle();
    const cursorValue = Number((cursorRow?.value as { offset?: number } | null)?.offset ?? 0);
    const offset = Number.isSafeInteger(cursorValue) && cursorValue >= 0 ? cursorValue : 0;
    const { data: convRows, error: convError } = await admin
      .from("conversations")
      .select(
        "id, user_id, character_id, difficulty, muted, last_read_at, real_time_mode, photo_frequency, photo_boundary, mature_photography, character:characters(key)",
      )
      .order("id", { ascending: true })
      .range(offset, offset + MAX_USERS_PER_RUN - 1);
    if (convError) throw new Error("World conversation queue unavailable");
    await admin.from("world_control").upsert({
      key: "world_cursor",
      value: {
        offset: (convRows?.length ?? 0) < MAX_USERS_PER_RUN ? 0 : offset + MAX_USERS_PER_RUN,
      },
      updated_at: nowIso,
    });
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

      try {
        if(!report.paused && !aiPause.paused && report.aiCalls < aiBudget) report.aiCalls += await (await import("./living-experiences.server")).runExperienceTick(admin,userId,now);
        if(!report.paused && !aiPause.paused && report.aiCalls < aiBudget) { report.aiCalls += await (await import("./travel-world.server")).runTravelMoments(admin,userId,now); }
      } catch {
        report.aiCalls = Math.min(aiBudget, report.aiCalls + 1);
        report.errors.push("Living Experience deferred; recorded progress retained");
      }
      try {
        await (await import("./interactive-world.server")).syncCalendar(admin, userId, now);
      } catch {
        report.errors.push("Conversation calendar sync deferred; source evidence retained");
      }
      try {
        const { runSharedWorldTick } = await import("./shared-world.server");
        await runSharedWorldTick(admin, userId, now);
      } catch {
        report.errors.push("Shared plan progression failed; existing state retained");
      }
      try {
        const calls = await import("./phone-calls.server");
        const promised = await calls.offerDueCallback(admin, userId, now);
        if (!promised) await calls.offerSpontaneousCall(admin, userId, now);
      } catch {
        report.errors.push("Call callback offer deferred");
      }
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

      if (process.env["ENABLE_NPC_FOLLOWUPS"] === "true") {
        try {
          const { runTownFollowups } = await import("./town-followups.server");
          const r = await runTownFollowups(
            admin,
            userId,
            now,
            !report.paused &&
              !aiPause.paused &&
              report.aiCalls < aiBudget &&
              !inQuietHours(now, quiet.start, quiet.end),
          );
          report.aiCalls += r.calls;
        } catch {
          report.aiCalls = Math.min(aiBudget, report.aiCalls + 1);
          report.errors.push("NPC follow-up failed; action will not be regenerated automatically");
        }
      }
      for (const conv of convs ?? []) {
        try {
          // AI budget never prevents structured world progression for the remaining characters.
          const def = characterFor((conv.character as { key?: string } | null)?.key);
          const isTess = def.key === "tess";

          const [
            { data: life },
            { data: last },
            { data: stateRow },
            { data: recentMsgs },
            { data: checkpoint },
          ] = await Promise.all([
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
            worldReady
              ? admin
                  .from("character_world_state")
                  .select("updated_at")
                  .eq("conversation_id", conv.id)
                  .eq("user_id", userId)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          // Throttle: skip conversations checked recently (event-driven, not continuous).
          const lastCheck = worldReady
            ? (checkpoint?.updated_at ?? null)
            : ((life?.last_initiation as { at?: string } | null)?.at ?? null);
          if (!isDue(lastCheck, now)) continue;
          report.conversationsChecked++;

          const gapHours = last
            ? (now.getTime() - new Date(last.created_at).getTime()) / 3_600_000
            : 999;
          const state = pickState(stateRow);
          const story = await storylineContext(admin, userId, def.key, now);
          const lifeEvent =
            story.event ??
            (isTess
              ? activeLifeEvent(
                  now,
                  weather
                    ? {
                        snowing: weather.snowing,
                        rain: weather.rain,
                        alert: !!weather.weather_alert,
                      }
                    : undefined,
                )
              : null);
          const { sharedPlanContext } = await import("./shared-world.server");
          const shared = await sharedPlanContext(admin, userId, def.key, now);
          const schedule =
            shared ??
            storySchedule(
              currentActivity(def, now, conv.difficulty === "chaos" ? 2 : 1),
              story.event,
            );
          if (worldReady)
            await persistWorldCheckpoint(admin, {
              userId,
              conversationId: conv.id,
              def,
              now,
              schedule,
              event: lifeEvent ? { ...lifeEvent } : {},
              chaos: conv.difficulty === "chaos" ? 2 : 1,
            });
          // Practice conversations retain interactive testing; they never receive real-clock background messages.
          // Practice conversations also receive background messages (user choice).
          if (worldReady) {
            const { error: expiryError } = await admin
              .from("world_records")
              .update({ status: "expired", updated_at: nowIso })
              .eq("user_id", userId)
              .eq("conversation_id", conv.id)
              .eq("status", "pending")
              .lte("expires_at", nowIso);
            if (expiryError) throw new Error("Follow-up expiry unavailable");
          }
          const continuity = worldReady
            ? await continuityContext(admin, userId, conv.id, now)
            : { due: null, lines: [] };
          const dueIntention = continuity.due;
          const list = recentMsgs ?? [];
          const userCount = list.filter((m) => m.sender === "user").length;
          const contactCount = list.filter((m) => m.sender === "tess").length;
          const hasPlausibleReason = !!(lifeEvent || dueIntention);

          // Orphaned user message: the user's latest text never got a reply
          // (app closed / request aborted). Answer it now, ahead of initiation.
          const newest = (recentMsgs ?? [])[0];
          if (
            newest?.sender === "user" &&
            report.aiCalls < aiBudget &&
            !report.paused &&
            schedule.availability !== "asleep" &&
            now.getTime() - new Date(newest.created_at).getTime() > 90_000
          ) {
            try {
              if (worldReady && !(await reserveWorldAi(admin, userId))) continue;
              report.aiCalls++;
              const { runTurn } = await import("./tess.functions");
              const r = await runTurn(admin, userId, conv.id, "America/New_York");
              if (r.count > 0) {
                await admin.from("world_events").insert({
                  user_id: userId,
                  conversation_id: conv.id,
                  character_key: def.key,
                  kind: "orphan_reply",
                  summary: `${def.preferredName} answered a message left without reply`,
                  payload: {},
                });
              }
            } catch (e) {
              report.errors.push(
                `orphan ${conv.id}: ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`,
              );
            }
            continue;
          }

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

          const blockedBy = [
            ...(conv.muted ? ["conversation muted"] : []),
            ...(inQuietHours(now, quiet.start, quiet.end) ? ["user quiet hours"] : []),
            ...(["busy", "asleep"].includes(schedule.availability)
              ? [`character ${schedule.availability}`]
              : []),
            ...(report.aiCalls >= aiBudget ? ["worker AI budget exhausted"] : []),
            ...(report.paused ? ["provider paused"] : []),
          ];
          // Record the check regardless of outcome (debug "why / why not").
          await admin.from("tess_life").upsert({
            conversation_id: conv.id,
            user_id: userId,
            current_event: lifeEvent ? { ...lifeEvent } : {},
            last_initiation: {
              at: nowIso,
              eligible: decision.eligible,
              initiated: false,
              selected: decision.initiate,
              score: decision.score,
              chance: decision.chance,
              reasons: [...decision.reasons, ...blockedBy],
              source: "world-tick",
            },
            updated_at: nowIso,
          });

          const { evaluateSpontaneousPhoto } = await import("./spontaneous-photo.server");
          const photoChance = await evaluateSpontaneousPhoto(admin, {
            def,
            conversation: conv,
            state,
            schedule,
            now,
            gapHours,
            lastInitiatedAt: life?.last_initiated_at ?? null,
            context: lifeEvent?.summary ?? schedule.detail,
          });
          const photoDecisionId = worldReady
            ? await recordPhotoDecision(admin, {
              userId,
              conversationId: conv.id,
              character: def.key,
              key: photoChance.key,
              eligible: photoChance.eligible,
              selected: photoChance.selected,
              reason: photoChance.reason,
              trigger: lifeEvent?.summary ?? schedule.detail ?? null,
              now,
            })
            : null;
          const photoOutcome = async (outcome: "message_sent" | "not_sent" | "blocked", why?: string | null) => {
            if (photoDecisionId && photoChance.selected)
              await recordPhotoDecisionOutcome(admin, { id: photoDecisionId, userId, outcome, reason: why ?? null }).catch(() => undefined);
          };
          const followUp =
            !!dueIntention &&
            gapHours >= 0.5 &&
            (!life?.last_initiated_at ||
              now.getTime() - Date.parse(life.last_initiated_at) >= 3_600_000);
          if (!decision.initiate && !photoChance.selected && !followUp) continue;
          const recordOutcome = async (initiated: boolean, blockers: string[]) => {
            const { error } = await admin
              .from("tess_life")
              .update({
                last_initiation: {
                  at: nowIso,
                  eligible: decision.eligible,
                  selected: decision.initiate || photoChance.selected || followUp,
                  initiated,
                  score: decision.score,
                  chance: decision.chance,
                  reasons: [...decision.reasons, ...blockers],
                  photoSelected: photoChance.selected,
                  followUp,
                  source: "world-tick",
                },
              })
              .eq("conversation_id", conv.id)
              .eq("user_id", userId);
            if (error) report.errors.push("Initiation outcome could not be saved");
          };
          if (blockedBy.length) {
            await recordOutcome(false, blockedBy);
            await photoOutcome("blocked", blockedBy.join("; "));
            continue;
          }

          // Generate the initiated message through the SAME turn pipeline as the
          // interactive path, so tone/photos/latency rules stay identical.
          const reason = followUp
            ? `Follow through on your pending ${dueIntention!.kind} intention: ${dueIntention!.summary}. Only fulfill it if appropriate now; do not claim a photo was sent without actually attaching one.`
            : photoChance.selected
              ? photoChance.hint
              : (lifeEvent?.summary ?? flavor ?? null);
          try {
            // Spontaneous contextual photo sharing is not a generic text-initiation.
            // Image generation still reserves its own bounded provider budget.
            if (worldReady && !photoChance.selected && !(await reserveWorldAi(admin, userId))) {
              await recordOutcome(false, ["per-user daily autonomous AI limit"]);
              await photoOutcome("blocked", "per-user daily autonomous AI limit");
              continue;
            }
            report.aiCalls++;
            if (aiPause.paused) probeAttempted = true;
            const { runTurn } = await import("./tess.functions");
            const result = await runTurn(admin, userId, conv.id, "America/New_York", {
              gapHours,
              reason,
              budgetReserved: worldReady,
              ...(followUp
                ? {
                    intentionId: dueIntention!.id,
                    photoKey: `intention:${dueIntention!.id}:${dueIntention!.attempts}`,
                  }
                : photoChance.selected
                  ? { photoKey: photoChance.key }
                  : {}),
            });
            if (!followUp)
              await photoOutcome(result.count > 0 ? "message_sent" : "not_sent",
                "reason" in result ? (result.reason ?? null) : result.count > 0 ? null : "no message produced");
            if (followUp && dueIntention && worldReady) {
              if ("reason" in result && result.reason?.includes("will not be recharged")) {
                await admin
                  .from("world_records")
                  .update({ status: "cancelled", updated_at: nowIso })
                  .eq("id", dueIntention.id)
                  .eq("user_id", userId)
                  .eq("status", "pending");
              } else
                await deferIntention(admin, dueIntention.id, userId, dueIntention.attempts, now);
            }
            if (aiPause.paused && probeAttempted) {
              // Probe succeeded — lift the durable pause.
              await writeAiPause(admin, false);
              report.aiPausedGlobally = false;
            }
            if (result.count > 0) {
              await recordOutcome(true, []);
              await admin
                .from("tess_life")
                .update({ last_initiated_at: nowIso, updated_at: nowIso })
                .eq("conversation_id", conv.id);
              report.initiated.push({
                conversationId: conv.id,
                character: def.preferredName,
                reason,
              });
              await admin.from("world_events").insert({
                user_id: userId,
                conversation_id: conv.id,
                character_key: def.key,
                kind: "initiation",
                summary: `${def.preferredName} texted first${reason ? ` — ${reason}` : ""}`,
                payload: {
                  score: decision.score,
                  reasons: decision.reasons,
                  gapHours: Math.round(gapHours * 10) / 10,
                },
              });

              // Claim the primary bubble only after it is visible. The sweep uses the same atomic claim.
              if ("notificationGroup" in result && typeof result.notificationGroup === "string") {
                const { data: primary } = await admin
                  .from("messages")
                  .select("id, body, metadata, visible_at")
                  .eq("conversation_id", conv.id)
                  .eq("metadata->>notification_group", result.notificationGroup)
                  .eq("metadata->>push_primary", "true")
                  .maybeSingle();
                if (primary) {
                  const waitMs = Date.parse(primary.visible_at) - Date.now();
                  if (waitMs > 0 && waitMs <= 5000)
                    await new Promise((resolve) => setTimeout(resolve, waitMs + 20));
                  if (
                    Date.parse(primary.visible_at) <= Date.now() &&
                    !conv.muted &&
                    !inQuietHours(new Date(), quiet.start, quiet.end) &&
                    (await claimMessagePush(admin, primary))
                  ) {
                    const push = await pushToUser(admin, userId, {
                      title: def.preferredName,
                      body: messagePushBody(primary),
                      url: `/chat/${conv.id}`,
                      tag: `conv-${conv.id}`,
                    });
                    report.pushed += push.sent;
                    await admin.from("world_events").insert({
                      user_id: userId,
                      conversation_id: conv.id,
                      character_key: def.key,
                      kind: "notification",
                      summary: `Push delivered to ${push.sent} device(s)`,
                      payload: { ...push, messageId: primary.id },
                    });
                  }
                }
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/\b(402|403)\b/.test(msg)) {
              // Circuit breaker: credits/policy block — durably pause the world.
              report.paused = true;
              report.errors.push(`AI paused: ${msg.slice(0, 120)}`);
              await writeAiPause(admin, true, msg.slice(0, 200));
              continue;
            }
            report.errors.push(`${def.key}: ${msg.slice(0, 120)}`);
          }
        } catch {
          report.errors.push(`World checkpoint or decision failed for conversation ${conv.id}`);
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
