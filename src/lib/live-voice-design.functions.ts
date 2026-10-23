import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VOICE_DESIGNS } from "./live-voice-design";
import {
  AUDITION_SCRIPT,
  AUDITION_SERVER_SAFEGUARDS_READY,
  assertAuditionAllowed,
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
    const res = await fetch("https://api.openai.com/v1/audio/voices", {
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
    if (!res.ok)
      throw new Error(
        res.status === 403 ? "Custom voice access denied" : "Custom voice creation failed",
      );
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

/** Paid, short-lived GPT-Live studio audition; no character memory or call ledger. */
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
    const res = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transport: { type: "webrtc", sdp: data.sdp },
        session: {
          model: "gpt-live-1",
          delegation: { type: "client" },
          instructions: `This is an isolated synthetic voice audition for a fictional adult, not an AI Town conversation. ${VOICE_DESIGNS[data.character].description} Wait for the supplied commentary, then speak this exact sample once and remain quiet: ${AUDITION_SCRIPT} Do not ask questions, start a dialogue, or delegate tasks.`,
          audio: { output: { voice: { id: data.voiceId } } },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok)
      throw new Error(
        res.status === 403
          ? "GPT-Live voice access denied"
          : `Studio audition failed (HTTP ${res.status})`,
      );
    const j = (await res.json()) as { transport?: { sdp?: string }; session?: { id?: string } };
    if (!j.transport?.sdp || !j.session?.id) throw new Error("Invalid GPT-Live SDP response");
    return { sdp: j.transport.sdp, sessionId: j.session.id };
  });
