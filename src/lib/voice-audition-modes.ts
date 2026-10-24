import { z } from "zod";
import { VOICE_DESIGNS, type VoiceDesignKey } from "./live-voice-design";

export type AuditionMode = "scripted" | "conversational";

export const TESS_CONVERSATIONAL_DIRECTION =
  "Tess is a naturally feminine woman in her mid-thirties who grew up in England and has lived in Pennsylvania for ten years. Her voice is warm, clear, relatively light, and approachable. Her English accent has softened considerably and sounds contemporary and everyday, not upper-class or aristocratic.\n\n" +
  "Speak like a real person having a private conversation, not an actor giving a rehearsed performance. Use naturally connected words, fluid pacing, spontaneous intonation, subtle amusement, and understated sarcasm. Keep the pitch comfortably light without sounding squeaky or artificially high. Allow emotions to shift naturally. Avoid overly crisp articulation, theatrical emphasis, formal Received Pronunciation, robotic pauses, and narration-style delivery.\n\n" +
  "Speak with an unhurried, measured pace around 100 words per minute. Pitch is centred at a natural, moderately light register near 230 Hz — neither deep nor squeaky. The tone is dry, self-assured, subtly teasing and intimate, with relaxed pauses between thoughts and understated amusement rather than energetic or theatrical enthusiasm.";

export const CONVERSATIONAL_CUE = "I saw your potion explode. It was impressive, even for you. Details, details. You know, you could just admit you enjoy talking to me.";
export const PERFORMANCE_MAX = 4000;
export const CUE_MAX = 2000;
export const SCRIPT_MAX = 600;
export const CONVERSATIONAL_DRAFT_STORE = "voice-studio-conversational-draft-v1";
export const SCRIPT_DRAFT_STORE = "voice-studio-script-draft-v1";

/** Word-for-word scripted prompt for an editable script. */
export function scriptedSpeakPrompt(script: string) {
  return `Speak now, in English, the following sample exactly once, word for word, then stay completely silent until the session ends: ${JSON.stringify(script.trim())}`;
}

/** One-tap Tess voice-creation prompt tuned to the user's reference clip (light ~235 Hz, ~100 wpm, dry tease). */
export const TESS_REFERENCE_VOICE_PROMPT =
  "An adult woman in her mid-thirties who grew up in England and has lived in Pennsylvania for ten years. Light, clearly feminine voice in a moderately high register, centred around 230–240 Hz; never deep, heavy, chesty, husky or low. " +
  "Her accent is a softened, contemporary southern-English lilt blended with relaxed everyday American vowels; natural and consistent, never posh, Received Pronunciation or theatrical. " +
  "Unhurried, measured pace of about 100 words per minute with relaxed pauses between thoughts. Dry, self-assured, subtly teasing and intimate, with understated amusement and quiet warmth underneath. " +
  "Speaks like a real person in a private conversation: connected words, gentle melodic rises, small hesitations, never announcer-like, robotic, perky or breathy.";
export const TESS_REFERENCE_VOICE_NAME = "Tess — Reference Tuned";
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
  script: z.string().max(SCRIPT_MAX).refine((v) => v.trim().length > 0, "Enter a script.").optional(),
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
  const validated = conversationalOptionsSchema.parse({
    performanceInstructions: options.performanceInstructions,
    conversationalCue: options.conversationalCue,
  });
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