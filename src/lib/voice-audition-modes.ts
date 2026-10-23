import { z } from "zod";
import { VOICE_DESIGNS, type VoiceDesignKey } from "./live-voice-design";

export type AuditionMode = "scripted" | "conversational";

export const TESS_CONVERSATIONAL_DIRECTION =
  "Tess is a naturally feminine woman in her mid-thirties who grew up in England and has lived in Pennsylvania for ten years. Her voice is warm, clear, relatively light, and approachable. Her English accent has softened considerably and sounds contemporary and everyday, not upper-class or aristocratic.\n\n" +
  "Speak like a real person having a private conversation, not an actor giving a rehearsed performance. Use naturally connected words, fluid pacing, spontaneous intonation, subtle amusement, and understated sarcasm. Keep the pitch comfortably light without sounding squeaky or artificially high. Allow emotions to shift naturally. Avoid overly crisp articulation, theatrical emphasis, formal Received Pronunciation, robotic pauses, and narration-style delivery.";

export const CONVERSATIONAL_CUE = "How was your day? I could use a little company and your honest take on it.";
export const CONVERSATIONAL_SPEAK_PROMPT =
  `Speak now in English with one short, naturally worded conversational response (two or three sentences) to this fictional sample cue: "${CONVERSATIONAL_CUE}". Choose your own words; do not recite the cue or performance instructions. Allow a small hesitation, subtle amusement and warmth without forcing them. This is an isolated fictional sample, not a real conversation or a claim about actual events. Finish this single response, then remain silent. Never repeat, backchannel or delegate tasks.`;

export const auditionRequestSchema = z.object({
  character: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
  voiceId: z.string().regex(/^voice_[a-zA-Z0-9_-]{3,120}$/),
  sdp: z.string().min(10).max(200000),
  mode: z.enum(["scripted", "conversational"]).default("scripted"),
  confirmation: z.literal("START PAID VOICE AUDITION"),
}).strict().refine((v) => v.mode !== "conversational" || v.character === "tess", {
  message: "Conversational auditions are available for Tess only.",
  path: ["mode"],
});

export function auditionSessionConfig(
  character: VoiceDesignKey,
  voiceId: string,
  mode: AuditionMode,
  scriptedPrompt: string,
) {
  if (mode === "conversational" && character !== "tess")
    throw new Error("Conversational auditions are available for Tess only.");
  const prompt = mode === "conversational" ? CONVERSATIONAL_SPEAK_PROMPT : scriptedPrompt;
  const direction = mode === "conversational" ? TESS_CONVERSATIONAL_DIRECTION : VOICE_DESIGNS[character].description;
  return {
    model: "gpt-live-1",
    delegation: { type: "client" },
    instructions: `This is an isolated synthetic voice audition for a fictional adult, not an AI Town conversation. ${direction} ${prompt}`,
    input: [{ type: "message", role: "developer", content: [{ type: "input_text", text: prompt }] }],
    audio: { output: { voice: { id: voiceId } } },
  };
}