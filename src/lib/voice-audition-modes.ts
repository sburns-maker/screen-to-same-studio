import { z } from "zod";
import { VOICE_DESIGNS, type VoiceDesignKey } from "./live-voice-design";

export type AuditionMode = "scripted" | "conversational";

export const TESS_CONVERSATIONAL_DIRECTION =
  "Tess is a naturally feminine woman in her mid-thirties who grew up in England and has lived in Pennsylvania for ten years. Her voice is warm, clear, relatively light, and approachable. Her English accent has softened considerably and sounds contemporary and everyday, not upper-class or aristocratic.\n\n" +
  "Speak like a real person having a private conversation, not an actor giving a rehearsed performance. Use naturally connected words, fluid pacing, spontaneous intonation, subtle amusement, and understated sarcasm. Keep the pitch comfortably light without sounding squeaky or artificially high. Allow emotions to shift naturally. Avoid overly crisp articulation, theatrical emphasis, formal Received Pronunciation, robotic pauses, and narration-style delivery.";

export const CONVERSATIONAL_CUE = "How was your day? I could use a little company and your honest take on it.";
export const PERFORMANCE_MAX = 4000;
export const CUE_MAX = 2000;
export const CONVERSATIONAL_DRAFT_STORE = "voice-studio-conversational-draft-v1";
export const conversationalOptionsSchema = z.object({
  performanceInstructions: z.string().max(PERFORMANCE_MAX).refine((v) => v.trim().length > 0, "Enter performance instructions.").default(TESS_CONVERSATIONAL_DIRECTION),
  conversationalCue: z.string().max(CUE_MAX).refine((v) => v.trim().length > 0, "Enter a conversational cue.").default(CONVERSATIONAL_CUE),
}).strict();
export type ConversationalOptions = z.infer<typeof conversationalOptionsSchema>;
export const DEFAULT_CONVERSATIONAL_OPTIONS: ConversationalOptions = {
  performanceInstructions: TESS_CONVERSATIONAL_DIRECTION,
  conversationalCue: CONVERSATIONAL_CUE,
};

export function restoreConversationalDraft(raw: string | null): ConversationalOptions {
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    // Preserve unfinished local edits, but never trust storage as request validation.
    if (value && typeof value === "object" && "performanceInstructions" in value && "conversationalCue" in value &&
      typeof value.performanceInstructions === "string" && typeof value.conversationalCue === "string" &&
      value.performanceInstructions.length <= PERFORMANCE_MAX && value.conversationalCue.length <= CUE_MAX) {
      return { performanceInstructions: value.performanceInstructions, conversationalCue: value.conversationalCue };
    }
  } catch { /* damaged local draft */ }
  return { ...DEFAULT_CONVERSATIONAL_OPTIONS };
}

export function conversationalSpeakPrompt(options: ConversationalOptions = DEFAULT_CONVERSATIONAL_OPTIONS) {
  return `Speak now in English with one short, naturally worded conversational response (two or three sentences) to this fictional sample cue: ${JSON.stringify(options.conversationalCue)}. Choose your own words; do not recite the cue or performance instructions. Allow a small hesitation, subtle amusement and warmth without forcing them. This is an isolated fictional sample, not a real conversation or a claim about actual events. Finish this single response, then remain silent. Never repeat, backchannel or delegate tasks.`;
}
export const CONVERSATIONAL_SPEAK_PROMPT = conversationalSpeakPrompt();
export function auditionReinforcement(mode: AuditionMode, scriptedPrompt: string, options: ConversationalOptions = DEFAULT_CONVERSATIONAL_OPTIONS) {
  const prompt = mode === "conversational"
    ? `${options.performanceInstructions}\n\n${conversationalSpeakPrompt(options)}`
    : scriptedPrompt;
  return `${prompt} If you have already begun the response, finish it without starting another. If you have finished, remain silent.`;
}

export const auditionRequestSchema = z.object({
  character: z.enum(["tess", "maya", "claire", "jordan", "ben"]),
  voiceId: z.string().regex(/^voice_[a-zA-Z0-9_-]{3,120}$/),
  sdp: z.string().min(10).max(200000),
  mode: z.enum(["scripted", "conversational"]).default("scripted"),
  performanceInstructions: conversationalOptionsSchema.shape.performanceInstructions,
  conversationalCue: conversationalOptionsSchema.shape.conversationalCue,
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
  options: ConversationalOptions = DEFAULT_CONVERSATIONAL_OPTIONS,
) {
  if (mode === "conversational" && character !== "tess")
    throw new Error("Conversational auditions are available for Tess only.");
  const validated = conversationalOptionsSchema.parse(options);
  const prompt = mode === "conversational" ? conversationalSpeakPrompt(validated) : scriptedPrompt;
  const direction = mode === "conversational" ? validated.performanceInstructions : VOICE_DESIGNS[character].description;
  return {
    model: "gpt-live-1",
    delegation: { type: "client" },
    instructions: `This is an isolated synthetic voice audition for a fictional adult, not an AI Town conversation. ${direction} ${prompt}`,
    input: [{ type: "message", role: "developer", content: [{ type: "input_text", text: prompt }] }],
    audio: { output: { voice: { id: voiceId } } },
  };
}