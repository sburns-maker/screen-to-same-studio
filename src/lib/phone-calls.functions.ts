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
      (await import("./phone-calls")).callAvailability(c.character_key, new Date()).outcome !==
        "answer"
    )
      return s.phoneCommand(db, context.userId, data.id, "fail");
    if (
      data.command === "resolve" &&
      c.state === "calling" &&
      (await import("./phone-calls")).callAvailability(c.character_key, new Date()).outcome !==
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
