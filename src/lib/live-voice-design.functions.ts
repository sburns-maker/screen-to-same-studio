import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  VOICE_CREATION_SCRIPT_HINT,
  VOICE_DESIGNS,
  VOICE_NAME_MAX,
  VOICE_PROMPT_MAX,
  validateVoiceRequest,
} from "./live-voice-design";
import {
  AUDITION_LEASE_MS,
  AUDITION_LIMIT_MS,
  AUDITION_RESERVED_SECONDS,
  AUDITION_SPEAK_PROMPT,
  AUDITION_SERVER_SAFEGUARDS_READY,
  assertAuditionAllowed,
  auditionLimits,
  reservationError,
} from "./voice-studio-audition";
import { auditionRequestSchema, auditionSessionConfig } from "./voice-audition-modes";

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
        variant: z.enum(["natural", "refined", "playful", "custom"]),
        prompt: z.string().max(VOICE_PROMPT_MAX + 100),
        name: z.string().max(VOICE_NAME_MAX + 20),
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
    const invalid = validateVoiceRequest(data.prompt, data.name);
    if (invalid) throw new Error(invalid);
    const { classifyVoiceCreationFailure } = await import("./voice-creation-errors");
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/audio/voices", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "prompt",
          name: data.name.trim(),
          prompt: data.prompt.trim(),
          model: "auto",
          script_hint: VOICE_CREATION_SCRIPT_HINT,
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

/**
 * Developer-only reference listening: transcribes a short WAV clip and asks an
 * audio-capable model to describe its delivery. The clip is not stored and no
 * voice is created; nothing touches character state.
 */
export const analyzeVoiceReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ wavBase64: z.string().min(100).max(4_200_000) }).strict().parse(v),
  )
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("OpenAI is not configured");
    const bytes = Uint8Array.from(atob(data.wavBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "reference.wav");
    let transcript = "";
    try {
      const t = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      if (!t.ok) throw new Error(`Transcription failed (HTTP ${t.status}).`);
      transcript = ((await t.json()) as { text?: string }).text?.trim() ?? "";
    } catch (e) {
      throw new Error(e instanceof Error && e.message.startsWith("Transcription") ? e.message : "OpenAI could not be reached for transcription.");
    }
    let notes = "";
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-audio-preview",
          modalities: ["text"],
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Listen to this fictional adult voice reference. Write 4-6 short imperative performance directions (one per line, no names, no transcript) a voice actor could follow to reproduce its delivery: accent and how strong it is, tone and attitude, pitch movement, rhythm and pausing, breathiness or texture, articulation, emotional colour. Be specific and concrete.",
                },
                { type: "input_audio", input_audio: { data: data.wavBase64, format: "wav" } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        notes = (j.choices?.[0]?.message?.content ?? "").trim().slice(0, 1500);
      } else {
        console.warn("voice reference listening failed", r.status);
      }
    } catch {
      console.warn("voice reference listening unreachable");
    }
    return { transcript, notes };
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
  .inputValidator((v: unknown) => auditionRequestSchema.parse(v))
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
    const leaseId = lease.id;
    const fail = (reason: string) =>
      db
        .from("voice_studio_auditions")
        .update({ state: "failed", close_reason: reason, ended_at: new Date().toISOString() })
        .eq("id", leaseId);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/live/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          transport: { type: "webrtc", sdp: data.sdp },
          session: auditionSessionConfig(data.character, data.voiceId, data.mode, AUDITION_SPEAK_PROMPT, data),
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
