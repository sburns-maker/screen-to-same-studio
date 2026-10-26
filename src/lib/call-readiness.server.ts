import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ACTIVE_CALL_STATES, callAvailability, fictionalNumber } from "./phone-calls";
type Client = SupabaseClient<Database>;
/** Shared read-only policy used by the worker and developer diagnostics. Server-only. */
export async function evaluateIncomingCalls(db: Client, user: string, now = new Date()) {
  const server = await import("./phone-calls.server");
  const cfg = (await import("./voice-provider.server")).voiceConfiguration();
  const installed = await server.phoneAvailable(db);
  const snap = installed ? await server.phoneSnapshot(db, user, false) : null;
  const enabled = process.env["ENABLE_INCOMING_VOICE_CALLS"] === "true";
  const { inQuietHours, parseQuietHours } = await import("./world.server");
  const { data: quiet, error: quietError } = await db
    .from("user_profile")
    .select("value")
    .eq("user_id", user)
    .eq("key", "quiet_hours")
    .maybeSingle();
  const q = parseQuietHours(quiet?.value);
  const quietNow = inQuietHours(now, q.start, q.end);
  const { data: conversations, error: conversationError } = await db
    .from("conversations")
    .select("id,muted,real_time_mode,character:characters(key)")
    .eq("user_id", user);
  const { CHARACTERS } = await import("./characters");
  const { currentActivity } = await import("./world-continuity");
  const { incomingCallSelection } = await import("./incoming-call-policy");
  const contacts = [];
  for (const conversation of conversations ?? []) {
    const key = (conversation.character as { key?: string } | null)?.key as
      keyof typeof CHARACTERS | undefined;
    if (!key || !CHARACTERS[key]) continue;
    const activity = currentActivity(CHARACTERS[key], now);
    const { data: presence, error: presenceError } = await db
      .from("social_presence")
      .select("character_key")
      .eq("user_id", user)
      .eq("character_key", key)
      .gt("until_at", now.toISOString())
      .maybeSingle();
    const cooldown = !!snap?.calls.some(
      (c) => c.character_key === key && now.getTime() - Date.parse(c.offered_at) < 6 * 3_600_000,
    );
    const selection = incomingCallSelection(user, key, now);
    const availability = callAvailability(key, now);
    const blockers = [
      ...(!fictionalNumber(key) ? ["Contact not provisioned for this calling service"] : []),
      ...(conversation.muted ? ["Contact muted"] : []),
      ...(availability.outcome !== "answer" ? [`Currently ${availability.reason}`] : []),
      ...(presenceError ? ["Presence check failed"] : presence ? ["Attending an event"] : []),
      ...(cooldown ? ["Recent call within six hours"] : []),
      ...(!selection.selected ? ["Not selected this hour"] : []),
    ];
    contacts.push({
      character: key,
      conversationId: conversation.id,
      realTime: !!conversation.real_time_mode,
      muted: !!conversation.muted,
      activity: activity.detail,
      availability: activity.availability,
      occupied: !!presence,
      presenceCheckFailed: !!presenceError,
      cooldown,
      selectedThisHour: selection.selected,
      chanceThisHour: selection.chance,
      blockers,
    });
  }
  const blocked = [
    ...(!installed ? ["Database calling migration missing"] : []),
    ...(!cfg.ready ? ["Voice provider not ready"] : []),
    ...(!enabled ? ["Server incoming-call switch disabled"] : []),
    ...(!snap?.preferences.enabled ? ["User outgoing/calling permission disabled"] : []),
    ...(!snap?.preferences.incoming ? ["User incoming-call permission disabled"] : []),
    ...(!snap?.preferences.save_transcripts ? ["Transcript consent missing"] : []),
    ...(snap?.calls.some((c) => ACTIVE_CALL_STATES.includes(c.state))
      ? ["Another call active"]
      : []),
    ...(quietError ? ["Quiet-hours lookup failed"] : quietNow ? ["Quiet hours active"] : []),
    ...(conversationError ? ["Conversation lookup failed"] : []),
  ];
  return {
    checkedAt: now.toISOString(),
    globalBlocks: blocked,
    quietHours: q,
    characters: contacts,
    note: "Read-only snapshot. Random selection is stable per hour; it is not a guarantee that a worker ran. No call was placed.",
  };
}
export async function incomingCallDiagnostics(db: Client, user: string, now = new Date()) {
  const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
  if (!developerPhotosAllowed(user)) throw new Error("Developer diagnostics unavailable");
  const [report, checkpoint] = await Promise.all([
    evaluateIncomingCalls(db, user, now),
    db
      .from("world_control")
      .select("value,updated_at")
      .eq("key", `incoming_calls:${user}`)
      .maybeSingle(),
  ]);
  const value = checkpoint.data?.value as { offered?: boolean; failed?: boolean } | null;
  return {
    ...report,
    worker: {
      lastCheckedAt: checkpoint.data?.updated_at ?? null,
      offered: value?.offered ?? false,
      failed: value?.failed ?? false,
      lookupFailed: !!checkpoint.error,
    },
    serviceNote:
      "Incoming offers use the OpenAI speech-chain service, not the separate GPT-Live/Voice Studio service. Both Practice and Real-Time contacts are eligible. Ringing is visible while the app is open; background phone ringing is not implemented.",
  };
}
export async function developerTestRing(
  db: Client,
  user: string,
  conversationId: string,
  id: string,
) {
  const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
  if (!developerPhotosAllowed(user)) throw new Error("Developer diagnostics unavailable");
  const server = await import("./phone-calls.server");
  if (process.env["ENABLE_INCOMING_VOICE_CALLS"] !== "true")
    throw new Error("Server incoming-call switch disabled");
  const readiness = (await import("./voice-provider.server")).voiceConfiguration();
  if (!readiness.ready || !(await server.phoneAvailable(db)))
    throw new Error("Voice service or call database is not ready");
  const snap = await server.phoneSnapshot(db, user);
  const previous = snap.calls.find((c) => c.id === id);
  if (previous) {
    if (
      previous.conversation_id !== conversationId ||
      previous.reason !== "Developer-triggered test ring (not character-initiated)"
    )
      throw new Error("Request ID already used by another call");
    return { id, note: "This test ring was already recorded; no new call was placed." };
  }
  if (!snap.preferences.enabled || !snap.preferences.incoming || !snap.preferences.save_transcripts)
    throw new Error("Enable outgoing, incoming and transcript preferences first");
  if (snap.calls.some((c) => ACTIVE_CALL_STATES.includes(c.state)))
    throw new Error("Another call is in progress");
  const { data: conv, error } = await db
    .from("conversations")
    .select("id,muted,real_time_mode,character:characters(key)")
    .eq("user_id", user)
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !conv || conv.muted) throw new Error("Choose an owned, unmuted conversation");
  const key = (conv.character as { key?: string } | null)?.key;
  if (!key || !fictionalNumber(key))
    throw new Error("Contact not provisioned for this calling service");
  const availability = callAvailability(key as Parameters<typeof callAvailability>[0], new Date());
  if (availability.outcome !== "answer")
    throw new Error(`Contact unavailable: ${availability.reason}`);
  const { inQuietHours, parseQuietHours } = await import("./world.server");
  const quiet = await db
    .from("user_profile")
    .select("value")
    .eq("user_id", user)
    .eq("key", "quiet_hours")
    .maybeSingle();
  if (quiet.error) throw new Error("Quiet-hours check unavailable");
  const hours = parseQuietHours(quiet.data?.value);
  if (inQuietHours(new Date(), hours.start, hours.end)) throw new Error("Quiet hours active");
  const presence = await db
    .from("social_presence")
    .select("character_key")
    .eq("user_id", user)
    .eq("character_key", key)
    .gt("until_at", new Date().toISOString())
    .maybeSingle();
  if (presence.error || presence.data)
    throw new Error("Character presence unavailable or occupied");
  await server.phoneCommand(db, user, id, "start", {
    conversation: conv.id,
    direction: "incoming",
    outcome: "answer",
    reason: "Developer-triggered test ring (not character-initiated)",
    ring: 25,
  });
  return {
    id,
    note: "Test ring created. Decline or let it expire to avoid provider charges; answering may start a paid voice session.",
  };
}
