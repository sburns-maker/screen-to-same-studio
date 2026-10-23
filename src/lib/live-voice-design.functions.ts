import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VOICE_DESIGNS } from "./live-voice-design";

/**
 * Developer-only, explicit voice creation. Never invoked by ordinary call setup,
 * page load or background jobs. Each request creates a persistent project voice.
 */
export const createCharacterVoiceCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    character: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
    variant: z.enum(["natural", "refined", "playful"]),
    confirmation: z.literal("CREATE CUSTOM VOICE"),
  }).strict().parse(v))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer access required");
    if (process.env["ENABLE_VOICE_DESIGN"] !== "true") throw new Error("Voice design is disabled");
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("OpenAI voice creation is not configured");
    const base = VOICE_DESIGNS[data.character];
    const direction = {
      natural: "Favor effortless everyday conversational delivery, including pauses and ordinary relaxed expression.",
      refined: "Favor elegant articulation and a lightly melodic, delicately expressive cadence without a formal accent.",
      playful: "Favor quick spontaneous reactions and subtle amused inflections, without caricature or exaggerated cheer.",
    }[data.variant];
    const res = await fetch("https://api.openai.com/v1/audio/voices", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "prompt",
        name: `${base.name} (${data.variant})`,
        prompt: `${base.description} ${direction}`,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(res.status === 403 ? "Custom voice access denied" : "Custom voice creation failed");
    const json = await res.json() as { id?: string; voice_id?: string };
    const id = json.id ?? json.voice_id;
    if (!id || !/^voice_[a-zA-Z0-9_-]{3,120}$/.test(id)) throw new Error("Unrecognized voice creation response");
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
      approved: Object.fromEntries(
        Object.keys(VOICE_DESIGNS).map((key) => [key, !!process.env[`GPT_LIVE_VOICE_${key.toUpperCase()}`]]),
      ),
    };
  });
