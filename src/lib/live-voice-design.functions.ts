import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VOICE_DESIGNS } from "./live-voice-design";
import {
  AUDITION_LEASE_MS,
  AUDITION_LIMIT_MS,
  AUDITION_RESERVED_SECONDS,
  AUDITION_SCRIPT,
  AUDITION_SPEAK_PROMPT,
  AUDITION_SERVER_SAFEGUARDS_READY,
  assertAuditionAllowed,
  auditionLimits,
  reservationError,
} from "./voice-studio-audition";

/**
 * Developer-only, explicit voice creation. Never invoked by ordinary call setup,
 * page load or background jobs. Each request creates a persistent project voice.
 */
export const createCharacterVoiceCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        character: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
        variant: z.enum(["natural", "refined", "playful"]),
        confirmation: z.literal("CREATE CUSTOM VOICE"),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    if (process.env["ENABLE_VOICE_DESIGN"] !== "true") throw new Error("Voice design is disabled");
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("OpenAI voice creation is not configured");
    const base = VOICE_DESIGNS[data.character];
    const direction = {
      natural:
        "Favor effortless everyday conversational delivery, including pauses and ordinary relaxed expression.",
      refined:
        "Favor elegant articulation and a lightly melodic, delicately expressive cadence without a formal accent.",
      playful:
        "Favor quick spontaneous reactions and subtle amused inflections, without caricature or exaggerated cheer.",
    }[data.variant];
    const { classifyVoiceCreationFailure } = await import("./voice-creation-errors");
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/audio/voices", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "prompt",
          name: `${base.name} (${data.variant})`,
          prompt: `${base.description} ${direction}`,
          model: "auto",
          script_hint: AUDITION_SCRIPT,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      const f = classifyVoiceCreationFailure(null, null, e as { name?: string });
      console.error("voice creation network failure", f.kind);
      throw new Error(f.message);
    }
    if (!res.ok) {
      let body: { error?: { message?: string; code?: string | null } } | null = null;
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* non-JSON error body */
      }
      const f = classifyVoiceCreationFailure(res.status, body);
      console.error("voice creation failed", res.status, f.kind, (body as { error?: { code?: string | null } } | null)?.error?.code ?? "");
      throw new Error(f.message);
    }
    const json = (await res.json()) as { id?: string; voice_id?: string };
    const id = json.id ?? json.voice_id;
    if (!id || !/^voice_[a-zA-Z0-9_-]{3,120}$/.test(id))
      throw new Error("Unrecognized voice creation response");
    // No automatic approval. Audition the generated voice first, then set the
    // approved GPT_LIVE_VOICE_* server setting manually.
    return { id, character: data.character, variant: data.variant, approved: false };
  });

/** Developer-only read-only setup status; no keys, prompts or paid requests exposed. */
export const voiceStudioStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    return {
      creationEnabled: process.env["ENABLE_VOICE_DESIGN"] === "true",
      apiConfigured: !!process.env["OPENAI_API_KEY"],
      liveEnabled: process.env["ENABLE_GPT_LIVE_CALLS"] === "true",
      auditionsEnabled:
        process.env["ENABLE_VOICE_STUDIO_AUDITIONS"] === "true" && AUDITION_SERVER_SAFEGUARDS_READY,
      auditionBlocker: AUDITION_SERVER_SAFEGUARDS_READY
        ? null
        : "Paid auditions need server-side duration, concurrency and spending safeguards before activation.",
      approved: Object.fromEntries(
        Object.keys(VOICE_DESIGNS).map((key) => [
          key,
          !!process.env[`GPT_LIVE_VOICE_${key.toUpperCase()}`],
        ]),
      ),
    };
  });

/**
 * Paid, short-lived GPT-Live studio audition; no character memory or call
 * ledger. Reserves a durable lease (one active per developer, daily and
 * 30-day spend caps) before any paid request and never retries.
 */
export const startVoiceStudioAudition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        character: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
        voiceId: z.string().regex(/^voice_[a-zA-Z0-9_-]{3,120}$/),
        sdp: z.string().min(10).max(200000),
        confirmation: z.literal("START PAID VOICE AUDITION"),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    assertAuditionAllowed(developerPhotosAllowed(context.userId), process.env);
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("OpenAI is not configured");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const limits = auditionLimits(process.env);
    const r = await db.rpc("reserve_voice_audition", {
      p_user: context.userId,
      p_character: data.character,
      p_voice: data.voiceId,
      p_now: new Date().toISOString(),
      p_limit_ms: AUDITION_LIMIT_MS,
      p_lease_ms: AUDITION_LEASE_MS,
      p_reserved_seconds: AUDITION_RESERVED_SECONDS,
      p_daily_count: limits.daily,
      p_monthly_seconds: limits.monthlySeconds,
    });
    if (r.error) throw new Error("Audition safeguards unavailable");
    const lease = r.data as { ok: boolean; reason?: string; id?: string; deadline_at?: string };
    if (!lease.ok || !lease.id || !lease.deadline_at) throw new Error(reservationError(lease.reason));
    const fail = (reason: string) =>
      db
        .from("voice_studio_auditions")
        .update({ state: "failed", close_reason: reason, ended_at: new Date().toISOString() })
        .eq("id", lease.id!);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/live/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          transport: { type: "webrtc", sdp: data.sdp },
          session: {
            model: "gpt-live-1",
            delegation: { type: "client" },
            instructions: `This is an isolated synthetic voice audition for a fictional adult, not an AI Town conversation. ${VOICE_DESIGNS[data.character].description} As soon as the session starts, speak this exact sample aloud once, word for word, then remain silent: ${AUDITION_SCRIPT} Never repeat it. Do not ask questions, start a dialogue, backchannel, or delegate tasks.`,
            // Documented speak-first pattern: developer message available from frame one.
            input: [
              {
                type: "message",
                role: "developer",
                content: [{ type: "input_text", text: AUDITION_SPEAK_PROMPT }],
              },
            ],
            audio: { output: { voice: { id: data.voiceId } } },
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      await fail("provider_unreachable");
      throw new Error("OpenAI did not respond. No automatic retry was made.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("voice audition provider error", res.status, detail.slice(0, 500));
      await fail(`http_${res.status}`);
      throw new Error(
        res.status === 403
          ? "OpenAI denied GPT-Live or custom-voice access for this API key."
          : res.status === 400
            ? "OpenAI rejected the audition request (check the voice ID belongs to this OpenAI project)."
            : res.status === 429
              ? "OpenAI rate or quota limit reached. Try later."
              : `Studio audition failed (HTTP ${res.status}). No automatic retry was made.`,
      );
    }
    const j = (await res.json()) as { transport?: { sdp?: string }; session?: { id?: string } };
    if (!j.transport?.sdp || !j.session?.id) {
      await fail("invalid_response");
      throw new Error("Invalid GPT-Live SDP response");
    }
    await db
      .from("voice_studio_auditions")
      .update({ state: "active", session_id: j.session.id })
      .eq("id", lease.id);
    const { superviseAudition } = await import("./voice-studio-audition.server");
    superviseAudition(
      db,
      { id: lease.id, sessionId: j.session.id, deadline: Date.parse(lease.deadline_at) },
      key,
    );
    return {
      sdp: j.transport.sdp,
      sessionId: j.session.id,
      auditionId: lease.id,
      deadlineAt: lease.deadline_at,
    };
  });

/** Explicit Stop or browser cleanup; closes server-side and releases the lease. */
export const stopVoiceStudioAudition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ auditionId: z.string().uuid() }).strict().parse(v))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    const key = process.env["OPENAI_API_KEY"];
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const row = await db
      .from("voice_studio_auditions")
      .select("id, session_id, state")
      .eq("id", data.auditionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (row.error || !row.data) throw new Error("Audition not found");
    if (!["reserved", "active"].includes(row.data.state)) return { closed: true };
    const { closeAuditionSession } = await import("./voice-studio-audition.server");
    await closeAuditionSession(db, row.data.id, row.data.session_id, key ?? "");
    return { closed: true };
  });

/** Developer usage summary: current lease and remaining allowance. */
export const voiceStudioUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const r = await db
      .from("voice_studio_auditions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gt("created_at", since);
    return { usedToday: r.count ?? 0, dailyLimit: auditionLimits(process.env).daily };
  });
