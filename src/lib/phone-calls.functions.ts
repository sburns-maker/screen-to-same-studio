import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const loadPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await import("./phone-calls.server")).phoneSnapshot(supabaseAdmin, context.userId);
  });
export const phoneAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        command: z.enum([
          "start",
          "resolve",
          "answer",
          "connect",
          "end",
          "decline",
          "fail",
          "played",
          "interrupt",
          "delete_transcript",
          "callback",
          "preferences",
        ]),
        conversation: z.string().uuid().optional(),
        turn: z.string().uuid().optional(),
        preferences: z
          .object({ enabled: z.boolean(), incoming: z.boolean(), save_transcripts: z.boolean() })
          .optional(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const s = await import("./phone-calls.server");
    if (!(await s.phoneAvailable(db))) throw new Error("Calls setup is incomplete");
    if (data.command === "start") {
      if (!data.conversation) throw new Error("Choose a contact");
      return s.startCall(db, context.userId, data.id, data.conversation);
    }
    if (data.command === "preferences") {
      if (!data.preferences) throw new Error("Choose call preferences");
      return s.phoneCommand(db, context.userId, data.id, data.command, data.preferences);
    }
    const c = await s.ownedCall(db, context.userId, data.id);
    if (
      ["connect", "answer"].includes(data.command) &&
      !(await import("./voice-provider.server")).voiceConfiguration().ready
    )
      throw new Error("Voice calling is not configured");
    if (
      data.command === "answer" &&
      (await import("./phone-calls")).callAvailability(c.character_key as never, new Date()).outcome !==
        "answer"
    )
      return s.phoneCommand(db, context.userId, data.id, "fail");
    if (
      data.command === "resolve" &&
      c.state === "calling" &&
      (await import("./phone-calls")).callAvailability(c.character_key as never, new Date()).outcome !==
        "answer" &&
      c.outcome === "answer"
    ) {
      await db
        .from("phone_calls")
        .update({ outcome: "unavailable", reason: "availability_changed" })
        .eq("user_id", context.userId)
        .eq("id", c.id);
    }
    const r = await s.phoneCommand(db, context.userId, data.id, data.command, {
      ...(data.turn ? { turn: data.turn } : {}),
      max_seconds: (await import("./voice-provider.server")).voiceConfiguration().maxSeconds,
    });
    if (data.command === "played")
      await (
        await import("./interactive-world.server")
      ).syncCalendar(db, context.userId, new Date());
    return r;
  });
export const phoneSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        turn: z.string().uuid(),
        audio: z.string().max(426728).nullable(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await import("./phone-calls.server")).processVoiceTurn(
      supabaseAdmin,
      context.userId,
      data.id,
      data.turn,
      data.audio,
    );
  });
/** Read-only account access check; it does not generate audio or validate speech endpoint compatibility. */
export const checkVoiceModelAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId))
      throw new Error("Developer diagnostics unavailable");
    const cfg = (await import("./voice-provider.server")).voiceConfiguration();
    const key = process.env["OPENAI_API_KEY"];
    if (!key) return { transcription: "not_configured", speech: "not_configured" };
    const check = async (model: string) => {
      if (!model) return "not_configured";
      try {
        const r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
        return r.ok
          ? "model_visible_endpoint_untested"
          : r.status === 401 || r.status === 403
            ? "access_denied"
            : r.status === 404
              ? "model_not_found"
              : "check_failed";
      } catch {
        return "check_failed";
      }
    };
    return { transcription: await check(cfg.transcription), speech: await check(cfg.speech) };
  });

/** Read-only call readiness check; does not initiate calls or use an AI provider. */
export const diagnoseIncomingCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer diagnostics unavailable");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const server = await import("./phone-calls.server");
    const cfg = (await import("./voice-provider.server")).voiceConfiguration();
    const installed = await server.phoneAvailable(db);
    const snap = installed ? await server.phoneSnapshot(db, context.userId) : null;
    const enabled = process.env["ENABLE_INCOMING_VOICE_CALLS"] === "true";
    const now = new Date();
    const { inQuietHours, parseQuietHours } = await import("./world.server");
    const { data: quiet, error: quietError } = await db.from("user_profile")
      .select("value").eq("user_id", context.userId).eq("key", "quiet_hours").maybeSingle();
    const q = parseQuietHours(quiet?.value);
    const quietNow = inQuietHours(now, q.start, q.end);
    const { data: conversations, error: conversationError } = await db.from("conversations")
      .select("id,muted,real_time_mode,character:characters(key)")
      .eq("user_id", context.userId);
    const { CHARACTERS } = await import("./characters");
    const { currentActivity } = await import("./world-continuity");
    const slot = Math.floor(now.getTime() / 3_600_000);
    const contacts = [];
    for (const conversation of conversations ?? []) {
      const key = (conversation.character as { key?: string } | null)?.key as keyof typeof CHARACTERS | undefined;
      if (!key || !CHARACTERS[key]) continue;
      const activity = currentActivity(CHARACTERS[key], now);
      const { data: presence, error: presenceError } = await db.from("social_presence")
        .select("character_key").eq("user_id", context.userId).eq("character_key", key)
        .gt("until_at", now.toISOString()).maybeSingle();
      const cooldown = !!snap?.calls.some(c => c.character_key === key &&
        now.getTime() - Date.parse(c.offered_at) < 6 * 3_600_000);
      let h = 2166136261;
      for (const ch of `${context.userId}:${key}:${slot}`)
        h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      const draw = (h >>> 0) / 4294967296;
      const threshold = Math.min(1, Math.max(0, 0.12 * CHARACTERS[key].initiation.scoreMultiplier));
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
        selectedThisHour: draw <= threshold,
        chanceThisHour: threshold,
      });
    }
    const blocked = [
      ...(!installed ? ["Database calling migration missing"] : []),
      ...(!cfg.ready ? ["Voice provider not ready"] : []),
      ...(!enabled ? ["Server incoming-call switch disabled"] : []),
      ...(!snap?.preferences.enabled ? ["User outgoing/calling permission disabled"] : []),
      ...(!snap?.preferences.incoming ? ["User incoming-call permission disabled"] : []),
      ...(!snap?.preferences.save_transcripts ? ["Transcript consent missing"] : []),
      ...(snap?.calls.some(c => (["calling", "ringing", "connected"] as string[]).includes(c.state)) ? ["Another call active"] : []),
      ...(quietError ? ["Quiet-hours lookup failed"] : quietNow ? ["Quiet hours active"] : []),
      ...(conversationError ? ["Conversation lookup failed"] : []),
    ];
    return { checkedAt: now.toISOString(), globalBlocks: blocked, quietHours: q,
      characters: contacts, note: "Read-only snapshot. Random selection is stable per hour; it is not a guarantee that a worker ran. No call was placed." };
  });

/** Developer-only in-app test ring, no voice request unless the user explicitly answers. */
export const testIncomingRing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ conversationId: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer diagnostics unavailable");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const server = await import("./phone-calls.server");
    const readiness = (await import("./voice-provider.server")).voiceConfiguration();
    if (!readiness.ready || !(await server.phoneAvailable(db)))
      throw new Error("Voice service or call database is not ready");
    const snap = await server.phoneSnapshot(db, context.userId);
    if (!snap.preferences.enabled || !snap.preferences.incoming || !snap.preferences.save_transcripts)
      throw new Error("Enable outgoing, incoming and transcript preferences first");
    if (snap.calls.some(c => (["calling", "ringing", "connected"] as string[]).includes(c.state)))
      throw new Error("Another call is in progress");
    const { data: conv, error } = await db.from("conversations")
      .select("id,muted,real_time_mode,character:characters(key)")
      .eq("user_id", context.userId).eq("id", data.conversationId).maybeSingle();
    if (error || !conv || conv.muted || !conv.real_time_mode)
      throw new Error("Choose an unmuted Real-Time conversation");
    const id = crypto.randomUUID();
    await server.phoneCommand(db, context.userId, id, "start", {
      conversation: conv.id, direction: "incoming", outcome: "answer",
      reason: "Developer-triggered test ring (not character-initiated)",
      ring: 25,
    });
    return { id, note: "Test ring created. Decline or let it expire to avoid provider charges; answering may start a paid voice session." };
  });
