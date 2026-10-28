import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  callAvailability,
  ringSeconds,
  ACTIVE_CALL_STATES,
  type CallRow,
  type CallPreferences,
} from "./phone-calls";
import { voiceConfiguration, recognizeSpeech, synthesizeSpeech } from "./voice-provider.server";
import { waveSeconds } from "./phone-audio";
type Client = SupabaseClient<Database>;
export async function phoneAvailable(db: Client) {
  const r = await db.rpc("phone_status", {} as never);
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Calls unavailable");
  return r.data === 23;
}
export async function phoneCommand(
  db: Client,
  user: string,
  id: string,
  command: string,
  payload: Json = {},
  now = new Date(),
) {
  const r = await db.rpc("phone_command", {
    p_user: user,
    p_id: id,
    p_command: command,
    p_payload: payload,
    p_now: now.toISOString(),
  });
  if (r.error) throw new Error("Call action could not be confirmed. Refresh before trying again.");
  return r.data;
}
export async function ownedCall(db: Client, user: string, id: string) {
  const r = await db.from("phone_calls").select("*").eq("user_id", user).eq("id", id).maybeSingle();
  if (r.error || !r.data) throw new Error("Call unavailable");
  return r.data;
}
export async function phoneSnapshot(db: Client, user: string, sweep = true, conversation?: string) {
  const config = voiceConfiguration();
  if (!(await phoneAvailable(db)))
    return {
      available: false,
      configured: false,
      incomingLive: incomingLiveMode(),
      calls: [] as CallRow[],
      preferences: { enabled: false, incoming: false, save_transcripts: false } as CallPreferences,
      provider: "OpenAI speech chain",
      models: { transcription: "", speech: "" },
    };
  if (sweep) await phoneCommand(db, user, "00000000-0000-4000-a000-000000000000", "sweep");
  let history = db.from("phone_calls").select("*").eq("user_id", user);
  if (conversation) history = history.eq("conversation_id", conversation);
  const [calls, pref] = await Promise.all([
    history.order("offered_at", { ascending: false }).limit(50),
    db.from("call_preferences").select("*").eq("user_id", user).maybeSingle(),
  ]);
  if (calls.error || pref.error) throw new Error("Call history unavailable");
  return {
    available: true,
    configured: config.ready,
    incomingLive: incomingLiveMode(),
    configurationBlockers: config.blockers,
    calls: calls.data ?? [],
    preferences: pref.data ?? { enabled: false, incoming: false, save_transcripts: false },
    provider: "OpenAI speech chain",
    models: { transcription: config.transcription, speech: config.speech },
  };
}
export async function startCall(db: Client, user: string, id: string, conversation: string) {
  if (!voiceConfiguration().ready)
    throw new Error("Voice calling has not been configured and validated. See Calls settings.");
  if (!(await phoneAvailable(db))) throw new Error("Calls setup is incomplete");
  await phoneCommand(db, user, id, "sweep");
  const r = await db
    .from("conversations")
    .select("*,character:characters(*)")
    .eq("user_id", user)
    .eq("id", conversation)
    .maybeSingle();
  if (r.error || !r.data) throw new Error("Contact unavailable");
  const key = (r.data.character as { key: string }).key as CallRow["character_key"];
  const presence = await db
    .from("social_presence")
    .select("*")
    .eq("user_id", user)
    .eq("character_key", key)
    .gt("until_at", new Date().toISOString())
    .maybeSingle();
  const a = presence.data
    ? { outcome: "busy", reason: "attending_event" }
    : callAvailability(key, new Date());
  return phoneCommand(db, user, id, "start", {
    conversation,
    direction: "outgoing",
    ...a,
    ring: ringSeconds(id),
  });
}
export async function guardVoiceTurn(
  db: Client,
  user: string,
  conversation: string,
  voice: { callId: string; turnId: string; sourceId: string | null },
) {
  const c = await ownedCall(db, user, voice.callId);
  const t = await db
    .from("call_turns")
    .select("*")
    .eq("user_id", user)
    .eq("call_id", c.id)
    .eq("id", voice.turnId)
    .maybeSingle();
  if (
    c.conversation_id !== conversation ||
    c.state !== "connected" ||
    Date.parse(c.expires_at) <= Date.now() ||
    t.error ||
    t.data?.status !== "reserved"
  )
    throw new Error("Call is no longer connected");
  if (voice.sourceId && t.data.user_message_id !== voice.sourceId)
    throw new Error("Call speech source mismatch");
}
export async function processVoiceTurn(
  db: Client,
  user: string,
  callId: string,
  turnId: string,
  base64: string | null,
) {
  const cfg = voiceConfiguration();
  if (!cfg.ready) throw new Error("Voice calling is not configured");
  const c = await ownedCall(db, user, callId);
  const bytes = base64 ? new Uint8Array(Buffer.from(base64, "base64")) : null;
  const seconds = bytes ? Math.ceil(waveSeconds(bytes)) : 0;
  const claim = (await phoneCommand(db, user, callId, "claim", {
    turn: turnId,
    seconds,
    cents: cfg.turnCents,
    daily_cents: cfg.dailyCents,
    monthly_cents: cfg.monthlyCents,
  })) as { claimed?: boolean };
  if (!claim.claimed)
    throw new Error("This voice turn was already attempted; it will not be charged again");
  const start = Date.now();
  let actionId: string | null = null;
  try {
    if (!bytes && c.turns > 0) throw new Error("Opening already attempted");
    if (bytes) {
      const text = await recognizeSpeech(bytes);
      await phoneCommand(db, user, callId, "input", { turn: turnId, text });
    }
    const { runTurn } = await import("./tess.functions");
    const result = await runTurn(
      db,
      user,
      c.conversation_id,
      "America/New_York",
      bytes
        ? undefined
        : {
            gapHours: 0,
            reason: `A telephone call has just connected. ${c.direction === "incoming" ? "You called for this grounded reason: " + c.reason : "You answered the user’s call."} Say a short natural greeting, not a fabricated user sentence.`,
            photoKey: `phone-opening:${callId}`,
            budgetReserved: true,
            ...(c.source_record_id ? { intentionId: c.source_record_id } : {}),
          },
      { callId, turnId, sourceId: bytes ? turnId : null },
    );
    actionId = (result as { preparedActionId?: string }).preparedActionId ?? null;
    if (!actionId) throw new Error("Voice reply could not be prepared");
    await phoneCommand(db, user, callId, "ready", {
      turn: turnId,
      action: actionId,
      latency_ms: Date.now() - start,
    });
    const job = await db.from("job_runs").select("detail").eq("id", actionId).maybeSingle();
    const plan = (
      job.data?.detail as {
        plan?: { rows: { body: string; metadata?: { voice_end?: boolean } }[] };
      }
    )?.plan;
    if (job.error || !plan?.rows.length) throw new Error("Voice reply unavailable");
    const text = plan.rows.map((r) => r.body).join(" "),
      audio = await synthesizeSpeech(text, c.character_key as never);
    await ownedCall(db, user, callId).then((c) => {
      if (c.state !== "connected" || Date.parse(c.expires_at) <= Date.now())
        throw new Error("Call ended");
    });
    const latencyMs = Date.now() - start;
    await db
      .from("phone_calls")
      .update({ last_latency_ms: latencyMs })
      .eq("user_id", user)
      .eq("id", callId);
    await db
      .from("call_turns")
      .update({ latency_ms: latencyMs })
      .eq("user_id", user)
      .eq("id", turnId);
    return {
      ...audio,
      endCall: !!plan.rows[0]?.metadata?.voice_end,
      latencyMs,
    };
  } catch {
    if (actionId)
      await db
        .from("job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", actionId)
        .eq("status", "running");
    await phoneCommand(db, user, callId, "turn_failed", { turn: turnId }).catch(() => {});
    throw new Error(
      "The voice connection was interrupted. This turn will not be regenerated automatically.",
    );
  }
}
/** GPT-Live incoming offer uses the existing zero-cost ring transport, not legacy TTS.
 * Separately gated; callers must still explicitly answer to start paid WebRTC.
 */
export function incomingLiveMode() {
  return process.env["ENABLE_INCOMING_GPT_LIVE_CALLS"] === "true" &&
    process.env["ENABLE_LIVE_CHARACTER_CALLS"] === "true" &&
    !!process.env["OPENAI_API_KEY"];
}

/** Offers only explicit, due callback promises. No inference, no generic hourly calls, no external ringing. */
export async function offerDueCallback(db: Client, user: string, now: Date) {
  if (
    (!incomingLiveMode() && !voiceConfiguration().ready) ||
    (process.env["ENABLE_INCOMING_VOICE_CALLS"] !== "true" && !incomingLiveMode()) ||
    !(await phoneAvailable(db))
  )
    return false;
  const snap = await phoneSnapshot(db, user);
  if (
    !snap.preferences.enabled ||
    !snap.preferences.incoming ||
    !snap.preferences.save_transcripts ||
    snap.calls.some(
      (c) =>
        ACTIVE_CALL_STATES.includes(c.state),
    )
  )
    return false;
  const quiet = await db
    .from("user_profile")
    .select("value")
    .eq("user_id", user)
    .eq("key", "quiet_hours")
    .maybeSingle();
  const { inQuietHours, parseQuietHours } = await import("./world.server");
  const q = parseQuietHours(quiet.data?.value);
  if (quiet.error || inQuietHours(now, q.start, q.end)) return false;
  const due = await db
    .from("world_records")
    .select("*")
    .eq("user_id", user)
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .gt("expires_at", now.toISOString())
    .order("due_at")
    .limit(5);
  if (due.error) return false;
  for (const r of due.data ?? []) {
    if (!/\b(?:call you|phone you|give you a call|call back)\b/i.test(r.source_quote)) continue;
    const key = r.character_key as CallRow["character_key"];
    if (
      !["tess", "maya", "claire", "jordan", "ben", "riley", "sienna"].includes(key) ||
      callAvailability(key, now).outcome !== "answer" ||
      snap.calls.some(c => c.character_key === key && now.getTime() - Date.parse(c.offered_at) < 6 * 3_600_000)
    )
      continue;
    const conv = await db
      .from("conversations")
      .select("muted,real_time_mode")
      .eq("user_id", user)
      .eq("id", r.conversation_id)
      .maybeSingle();
    const occupied = await db
      .from("social_presence")
      .select("character_key")
      .eq("user_id", user)
      .eq("character_key", key)
      .gt("until_at", now.toISOString())
      .maybeSingle();
    if (
      conv.error ||
      !conv.data ||
      conv.data.muted ||
      occupied.error ||
      occupied.data
    )
      continue;
    const source = await db
      .from("messages")
      .select("body,sender")
      .eq("user_id", user)
      .eq("conversation_id", r.conversation_id)
      .eq("id", r.source_message_id!)
      .maybeSingle();
    // Character replies use the shared tess transport sender; identity comes from
    // the owned conversation, not from the transport label.
    if (source.error || source.data?.sender !== "tess" || !source.data.body.includes(r.source_quote)) continue;
    if (incomingLiveMode()) {
      const { resolveCharacterVoice } = await import("./live-calls.server");
      if (!(await resolveCharacterVoice(db as never, key))) continue;
    }
    try {
      await phoneCommand(
        db,
        user,
        crypto.randomUUID(),
        "start",
        {
          conversation: r.conversation_id,
          direction: "incoming",
          outcome: "answer",
          reason: r.summary.slice(0, 200),
          ring: 25,
          source: r.id,
        },
        now,
      );
      return true;
    } catch {
      throw new Error("Incoming callback offer could not be confirmed");
    }
  }
  return false;
}


/** Independent, optional character-initiated in-app calls.
 * Each available contact makes their own choice; database call caps still apply.
 * An hourly stable draw plus per-character history prevents worker poll spam.
 * Promised callbacks remain separate and have priority in the world worker.
 */
export async function offerSpontaneousCall(db: Client, user: string, now: Date) {
  if ((!incomingLiveMode() && !voiceConfiguration().ready) || (process.env["ENABLE_INCOMING_VOICE_CALLS"] !== "true" && !incomingLiveMode()) || !(await phoneAvailable(db))) return false;
  const snap = await phoneSnapshot(db, user);
  if (!snap.preferences.enabled || !snap.preferences.incoming || !snap.preferences.save_transcripts ||
      snap.calls.some(c=>ACTIVE_CALL_STATES.includes(c.state))) return false;
  const { evaluateIncomingCalls } = await import("./call-readiness.server");
  const report = await evaluateIncomingCalls(db, user, now);
  if (report.globalBlocks.length) return false;
  for (const contact of report.characters) {
    if (contact.blockers.length) continue;
    const key = contact.character;
    const activity = { detail: contact.activity };
    const conv = { id: contact.conversationId };
    if (incomingLiveMode()) {
      const { resolveCharacterVoice } = await import("./live-calls.server");
      if (!(await resolveCharacterVoice(db as never, key))) continue;
    }
    const reason=`I had a free moment and wanted to catch up. ${activity.detail}`.slice(0,200);
    try{
      await phoneCommand(db,user,crypto.randomUUID(),"start",{
        conversation:conv.id,direction:"incoming",outcome:"answer",reason,ring:incomingLiveMode() ? 30 : 25
      },now);
      return true;
    }catch{throw new Error("Incoming call offer could not be confirmed");}
  }
  return false;
}
