import { createOpenAI } from "@ai-sdk/openai";
import { transcribe, generateSpeech } from "ai";
import type { CharacterKey } from "./characters";
function bounded(name: string, min: number, max: number, fallback: number) {
  const v = Number(process.env[name] ?? fallback);
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}
export function voiceConfiguration() {
  const env = process.env;
  const voices = Object.fromEntries(
    ["tess", "maya", "claire", "jordan", "ben"].map((k) => [
      k,
      env[`VOICE_${k.toUpperCase()}`] ?? "",
    ]),
  );
  const ready =
    env["ENABLE_VOICE_CALLS"] === "true" &&
    env["VOICE_PROVIDER_VALIDATED"] === "true" &&
    !!env["OPENAI_API_KEY"] &&
    !!env["OPENAI_TRANSCRIPTION_MODEL"] &&
    !!env["OPENAI_SPEECH_MODEL"] &&
    Object.values(voices).every((v) => /^[a-zA-Z0-9_-]{1,50}$/.test(v)) &&
    new Set(Object.values(voices)).size === 5 &&
    bounded("VOICE_DAILY_BUDGET_CENTS", 1, 100000, 0) > 0 &&
    bounded("VOICE_MONTHLY_BUDGET_CENTS", 1, 1000000, 0) > 0 &&
    bounded("VOICE_TURN_RESERVATION_CENTS", 1, 10000, 0) > 0;
  return {
    ready,
    voices,
    transcription: env["OPENAI_TRANSCRIPTION_MODEL"] ?? "",
    speech: env["OPENAI_SPEECH_MODEL"] ?? "",
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
