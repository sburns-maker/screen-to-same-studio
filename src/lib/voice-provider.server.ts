import { createOpenAI } from "@ai-sdk/openai";
import { transcribe, generateSpeech } from "ai";
import type { CharacterKey } from "./characters";
function bounded(name: string, min: number, max: number, fallback: number) {
  const v = Number(process.env[name] ?? fallback);
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}
export function voiceConfiguration() {
  const env = process.env;
  // Existing per-character voice assignments must be resolved from Voice Studio
  // before voice calling is enabled; never silently substitute a different voice.
  const voices = Object.fromEntries(
    ["tess", "maya", "claire", "jordan", "ben", "riley"].map((k) => [
      k, env[`VOICE_${k.toUpperCase()}`] ?? "",
    ]),
  );
  const blockers: string[] = [];
  if (env["ENABLE_VOICE_CALLS"] !== "true") blockers.push("voice_calls_disabled");
  if (env["VOICE_PROVIDER_VALIDATED"] !== "true") blockers.push("provider_not_validated");
  if (!env["OPENAI_API_KEY"]) blockers.push("openai_key_missing");
  const transcription = env["OPENAI_TRANSCRIPTION_MODEL"] || "gpt-4o-mini-transcribe";
  const speech = env["OPENAI_SPEECH_MODEL"] || "gpt-4o-mini-tts";
  for (const [key, voice] of Object.entries(voices)) {
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(voice)) blockers.push(`voice_${key}_missing_or_invalid`);
  }
  if (new Set(Object.values(voices)).size !== 6) blockers.push("voices_not_unique");
  if (bounded("VOICE_DAILY_BUDGET_CENTS", 1, 100000, 100) <= 0) blockers.push("daily_budget_missing");
  if (bounded("VOICE_MONTHLY_BUDGET_CENTS", 1, 1000000, 1000) <= 0) blockers.push("monthly_budget_missing");
  if (bounded("VOICE_TURN_RESERVATION_CENTS", 1, 10000, 5) <= 0) blockers.push("turn_budget_missing");
  const ready = blockers.length === 0;
  return {
    ready,
    blockers,
    voices,
    transcription,
    speech,
    maxSeconds: bounded("VOICE_MAX_SESSION_SECONDS", 30, 600, 300),
    dailyCents: bounded("VOICE_DAILY_BUDGET_CENTS", 1, 100000, 0),
    monthlyCents: bounded("VOICE_MONTHLY_BUDGET_CENTS", 1, 1000000, 0),
    turnCents: bounded("VOICE_TURN_RESERVATION_CENTS", 1, 10000, 0),
  };
}
export async function recognizeSpeech(audio: Uint8Array) {
  const c = voiceConfiguration();
  if (!c.ready) throw new Error("Voice service is not configured");
  const r = await transcribe({
    model: createOpenAI({
      apiKey: process.env["OPENAI_API_KEY"]!,
      baseURL: "https://api.openai.com/v1",
    }).transcription(c.transcription),
    audio,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(20000),
  });
  const text = r.text.trim();
  if (!text || text.length > 1000) throw new Error("Speech could not be understood");
  return text;
}
export async function synthesizeSpeech(text: string, key: CharacterKey) {
  const c = voiceConfiguration();
  if (!c.ready || !text.trim() || text.length > 1000)
    throw new Error("Voice service is not configured");
  const r = await generateSpeech({
    model: createOpenAI({
      apiKey: process.env["OPENAI_API_KEY"]!,
      baseURL: "https://api.openai.com/v1",
    }).speech(c.speech),
    text,
    voice: c.voices[key]!,
    outputFormat: "mp3",
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(20000),
  });
  return { base64: r.audio.base64, mime: r.audio.mediaType };
}
