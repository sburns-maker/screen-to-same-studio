/**
 * Voice designs for AI Town's fictional adult cast.
 * Descriptions guide GPT-Live prompt-to-voice creation; they do not clone or
 * impersonate anyone and are not themselves generated audio.
 */
export const VOICE_DESIGNS = {
  sienna: {
    name: "Sienna — Bold",
    description: "An adult American woman, 29, from western Pennsylvania. Natural warm feminine conversational voice, confident direct delivery, quick situational wit and affectionate teasing. Expressive without constant performance; thoughtful pauses and sincere vulnerability when appropriate. No real-person imitation, exaggerated breathiness, caricature or announcer delivery.",
  },
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
  riley: {
    name: "Riley — Night Shift",
    description: "An adult American woman, 28, a hospital laboratory technician in Altoona, Pennsylvania. A clearly feminine, warm, clear mid-to-light register with a relaxed General American accent. Funny, observant and quietly witty, comfortable with pauses, with understated dry timing, small amused reactions and occasional reflective warmth. A little tired after an overnight shift without sounding flat or whispery. Natural connected speech, gentle pitch movement and conversational imperfections; never robotic, theatrical, announcer-like, exaggeratedly husky or artificially bubbly.",
  },
} as const;
export type VoiceDesignKey = keyof typeof VOICE_DESIGNS;
/** Shared cast allowlist for creation, auditions and phone-voice assignment. */
export const VOICE_DESIGN_KEYS = ["tess", "maya", "claire", "jordan", "ben", "riley", "sienna"] as const satisfies readonly VoiceDesignKey[];

/**
 * Longer script hint used only for custom voice creation (OpenAI rejects short
 * hints). Live auditions keep the short AUDITION_SCRIPT.
 */
export const VOICE_CREATION_SCRIPT_HINT =
  "Oh, hi. Sorry, I was halfway through a sandwich when you called, so that's going well. How are you? Actually, how are you really, not the polite version? " +
  "Work was... fine. Mostly fine. Someone brought in a dog with a sock stuck somewhere a sock shouldn't be, and honestly, I respect the ambition. " +
  "Mabel, on the other hand, has spent the entire afternoon staring at the radiator like it owes her money. I don't know what it did. I've decided not to ask. " +
  "Anyway, I was thinking about what you said the other day. About feeling like you're always the one holding everything together. I just... I wanted to say I noticed. That's all. You don't have to do it on your own all the time, you know? " +
  "Right, that got a bit serious. Let me ruin it properly. Did you actually eat dinner, or did you have crisps over the sink again? Chips. Whatever. I've been here ten years and my mouth still can't decide. " +
  "Hmm. Tomorrow, then? Coffee, maybe around eight? I'll bring the good kind, not the stuff from the machine at the clinic that tastes faintly of regret. " +
  "Okay. Go on, get some sleep. And text me when you're home, yeah? I'll pretend I wasn't waiting up.";

/** Shared delivery guidance for Tess's creation variants: human, not polished. */
export const TESS_VARIANT_DIRECTIONS = {
  natural:
    "Prioritize authentic, unpolished human conversation: relaxed everyday timing, small hesitations and filler, thoughts that change direction mid-sentence, quiet half-laughs and believable understated humor. Imperfect, lived-in, never announcer-like or robotic.",
  refined:
    "Prioritize authentic conversation over polished diction: clear but relaxed articulation, a lightly melodic cadence, understated timing, subtle emotional shifts from dry amusement to sincere warmth, and natural small imperfections. Never formal, recited, announcer-like or robotic.",
  playful:
    "Prioritize authentic spontaneous conversation: quick amused reactions, understated teasing, believable timing for dry jokes, small hesitations and warm softening afterward. Never caricatured, overly cheerful, polished, announcer-like or robotic.",
} as const;

const GENERIC_VARIANT_DIRECTIONS = {
  natural:
    "Favor effortless everyday conversational delivery, including pauses and ordinary relaxed expression.",
  refined:
    "Favor elegant articulation and a lightly melodic, delicately expressive cadence without a formal accent.",
  playful:
    "Favor quick spontaneous reactions and subtle amused inflections, without caricature or exaggerated cheer.",
} as const;

export type VoicePreset = keyof typeof GENERIC_VARIANT_DIRECTIONS;
export type VoiceVariant = VoicePreset | "custom";
export const VOICE_PRESETS: VoicePreset[] = ["natural", "refined", "playful"];
export const VOICE_PROMPT_MIN = 40;
export const VOICE_PROMPT_MAX = 1500;
export const VOICE_NAME_MAX = 60;

/** The exact original preset prompt (base description + variant direction). */
export function presetVoicePrompt(key: VoiceDesignKey, preset: VoicePreset): string {
  const direction = key === "tess" ? TESS_VARIANT_DIRECTIONS[preset] : GENERIC_VARIANT_DIRECTIONS[preset];
  return `${VOICE_DESIGNS[key].description} ${direction}`;
}

export function defaultVoiceName(key: VoiceDesignKey, variant: VoiceVariant): string {
  return `${VOICE_DESIGNS[key].name} (${variant})`;
}

/** Returns an error message, or null when the prompt/name are acceptable. */
export function validateVoiceRequest(prompt: string, name: string): string | null {
  const p = prompt.trim();
  if (p.length < VOICE_PROMPT_MIN) return `Description must be at least ${VOICE_PROMPT_MIN} characters.`;
  if (p.length > VOICE_PROMPT_MAX) return `Description must be at most ${VOICE_PROMPT_MAX} characters.`;
  const n = name.trim();
  if (!n) return "Candidate name is required.";
  if (n.length > VOICE_NAME_MAX) return `Candidate name must be at most ${VOICE_NAME_MAX} characters.`;
  return null;
}

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
