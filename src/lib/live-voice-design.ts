/**
 * Voice designs for AI Town's fictional adult cast.
 * Descriptions guide GPT-Live prompt-to-voice creation; they do not clone or
 * impersonate anyone and are not themselves generated audio.
 */
export const VOICE_DESIGNS = {
  tess: {
    name: "Tess — Refined",
    description: "An adult woman who grew up in England and has lived in Pennsylvania for around ten years. Her English is now predominantly American, but her vowels occasionally retain a soft southern-English roundness and her speech keeps a subtle measured English cadence; the hybrid accent sounds natural and consistent, never performative. Warm, softly feminine, clear, quietly confident, intelligent and genuinely conversational, with graceful articulation, unhurried pacing and understated dry wit. Gentle melodic movement, reflective pauses and sincere tenderness. Not strongly British or posh, and never husky, raspy, breathy, perky, bubbly, theatrical, announcer-like or robotic.",
  },
  maya: {
    name: "Maya — Warm",
    description: "An adult American woman with a warmly expressive, bright and natural conversational voice. Friendly and easygoing, with nuanced emotional variation, quick playful reactions and genuine tiredness when appropriate. Relaxed ordinary American pronunciation and unforced laughter. Avoid cartoonish cheerfulness or scripted customer-service delivery.",
  },
  claire: {
    name: "Claire — Thoughtful",
    description: "An adult American woman with a clear, softly expressive, thoughtful voice and a gentle conversational cadence. Deliberate but not slow, articulate, with natural warmth and small moments of curiosity or enthusiasm. Avoid whispering, affected refinement or monotone audiobook narration.",
  },
  jordan: {
    name: "Jordan — Wry",
    description: "An adult American woman with a natural grounded conversational voice, composed and lightly expressive. Understated wit, slight dry inflection and sincere warmth when warranted. No exaggerated huskiness, harshness, exaggerated sass or flat robotic monotone.",
  },
  ben: {
    name: "Ben — Relaxed",
    description: "An adult American man with a relaxed, friendly and conversational voice. Everyday natural pronunciation, approachable and quietly amused, with subtle changes of pace and emphasis. No radio-announcer performance, strained depth or artificial enthusiasm.",
  },
} as const;
export type VoiceDesignKey = keyof typeof VOICE_DESIGNS;

export function customVoiceId(key: VoiceDesignKey, env: Record<string, string | undefined> = process.env): string | null {
  const id = env[`GPT_LIVE_VOICE_${key.toUpperCase()}`]?.trim();
  // Project-owned prompt-created voice ID, not a stock voice name.
  return id && /^voice_[a-zA-Z0-9_-]{3,120}$/.test(id) ? id : null;
}
export function gptLiveSessionConfig(key: VoiceDesignKey, env: Record<string, string | undefined> = process.env) {
  const id = customVoiceId(key, env);
  if (!id) throw new Error("This character has no approved GPT-Live voice");
  if (env["ENABLE_GPT_LIVE_CALLS"] !== "true") throw new Error("GPT-Live is not enabled");
  return {
    model: "gpt-live-1",
    instructions: `Speak as the fictional adult contact ${key}. Voice direction: ${VOICE_DESIGNS[key].description} The live conversation must delegate canonical character reasoning, memory, plans, and relationship changes to the existing authenticated AI Town server. Do not invent commitments, locations or backstory; do not commit partial or unheard responses.`,
    audio: { output: { voice: { id } } },
  };
}
