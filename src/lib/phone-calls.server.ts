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
export async function phoneSnapshot(db: Client, user: string) {
  const config = voiceConfiguration();
  if (!(await phoneAvailable(db)))
    return {
      available: false,
      configured: false,
      calls: [] as CallRow[],
      preferences: { enabled: false, incoming: false, save_transcripts: false } as CallPreferences,
      provider: "OpenAI speech chain",
      models: { transcription: "", speech: "" },
    };
  await phoneCommand(db, user, "00000000-0000-4000-a000-000000000000", "sweep");
  const [calls, pref] = await Promise.all([
    db
      .from("phone_calls")
      .select("*")
      .eq("user_id", user)
      .order("offered_at", { ascending: false })
      .limit(50),
    db.from("call_preferences").select("*").eq("user_id", user).maybeSingle(),
  ]);
  if (calls.error || pref.error) throw new Error("Call history unavailable");
  return {
    available: true,
    configured: config.ready,
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
/** Offers only explicit, due callback promises. No inference, no generic hourly calls, no external ringing. */
export async function offerDueCallback(db: Client, user: string, now: Date) {
  if (
    !voiceConfiguration().ready ||
    process.env["ENABLE_INCOMING_VOICE_CALLS"] !== "true" ||
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
  if (inQuietHours(now, q.start, q.end)) return false;
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
      !["tess", "maya", "claire", "jordan", "ben", "riley"].includes(key) ||
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
      !conv.data?.real_time_mode ||
      conv.data.muted ||
      occupied.error ||
      occupied.data
    )
      continue;
    const source = await db
      .from("messages")
      .select("body,sender")
      .eq("user_id", user)
      .eq("id", r.source_message_id!)
      .maybeSingle();
    if (source.data?.sender !== "tess" || !source.data.body.includes(r.source_quote)) continue;
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
      return false;
    }
  }
  return false;
}


/** Independent, optional character-initiated in-app calls.
 * No account-wide daily quota: each available contact makes their own choice.
 * An hourly stable draw plus per-character history prevents worker poll spam.
 * Promised callbacks remain separate and have priority in the world worker.
 */
export async function offerSpontaneousCall(db: Client, user: string, now: Date) {
  if (!voiceConfiguration().ready || process.env["ENABLE_INCOMING_VOICE_CALLS"] !== "true" || !(await phoneAvailable(db))) return false;
  const snap = await phoneSnapshot(db, user);
  if (!snap.preferences.enabled || !snap.preferences.incoming || !snap.preferences.save_transcripts ||
      snap.calls.some(c=>ACTIVE_CALL_STATES.includes(c.state))) return false;
  const {data: quiet}=await db.from("user_profile").select("value").eq("user_id",user).eq("key","quiet_hours").maybeSingle();
  const {inQuietHours,parseQuietHours}=await import("./world.server");
  const q=parseQuietHours(quiet?.value);
  if(inQuietHours(now,q.start,q.end)) return false;
  const {data: conversations,error}=await db.from("conversations").select("id,muted,real_time_mode,character:characters(key)").eq("user_id",user);
  if(error || !conversations?.length) return false;
  const {CHARACTERS}=await import("./characters");
  const {currentActivity}=await import("./world-continuity");
  const slot=Math.floor(now.getTime()/3_600_000);
  for(const conv of conversations){
    const key=(conv.character as {key?:string}|null)?.key as keyof typeof CHARACTERS|undefined;
    if(!key || !CHARACTERS[key] || conv.muted || !conv.real_time_mode) continue;
    if(snap.calls.some(c=>c.character_key===key && now.getTime()-Date.parse(c.offered_at)<6*3_600_000)) continue;
    const activity=currentActivity(CHARACTERS[key],now);
    if(activity.availability!=="free") continue;
    const {data:presence}=await db.from("social_presence").select("character_key").eq("user_id",user).eq("character_key",key).gt("until_at",now.toISOString()).maybeSingle();
    if(presence)continue;
    // Stable low-probability choice: a character can call on her own without
    // every worker invocation rerolling, and other characters have independent draws.
    let h=2166136261;
    for(const ch of `${user}:${key}:${slot}`)h=Math.imul(h^ch.charCodeAt(0),16777619);
    if((h>>>0)/4294967296 > 0.12 * CHARACTERS[key].initiation.scoreMultiplier)continue;
    const reason=`I had a free moment and wanted to catch up. ${activity.detail}`.slice(0,200);
    try{
      await phoneCommand(db,user,crypto.randomUUID(),"start",{
        conversation:conv.id,direction:"incoming",outcome:"answer",reason,ring:25
      },now);
      return true;
    }catch(e){console.warn("[spontaneous-call] Offer deferred",e);return false;}
  }
  return false;
}
