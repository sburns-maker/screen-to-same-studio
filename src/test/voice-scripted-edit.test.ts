import { describe, expect, it } from "vitest";
import { auditionRequestSchema, auditionSessionConfig, scriptedSpeakPrompt, SCRIPT_MAX, TESS_REFERENCE_VOICE_PROMPT } from "@/lib/voice-audition-modes";
import { validateVoiceRequest } from "@/lib/live-voice-design";

const base = { character: "tess", voiceId: "voice_abc123", sdp: "v=0 xxxxxxxx", mode: "scripted", confirmation: "START PAID VOICE AUDITION" };

describe("editable scripted audition", () => {
  it("sends the edited script word for word", () => {
    const cfg = auditionSessionConfig("tess", "voice_abc123", "scripted", scriptedSpeakPrompt("Hello there, you."));
    expect(cfg.input[0]?.content[0]?.text).toContain('"Hello there, you."');
  });
  it("rejects empty and over-long scripts", () => {
    expect(auditionRequestSchema.safeParse({ ...base, script: "  " }).success).toBe(false);
    expect(auditionRequestSchema.safeParse({ ...base, script: "x".repeat(SCRIPT_MAX + 1) }).success).toBe(false);
    expect(auditionRequestSchema.safeParse({ ...base, script: "Hi." }).success).toBe(true);
  });
  it("Tess voice preset is a valid creation prompt", () => {
    expect(validateVoiceRequest(TESS_REFERENCE_VOICE_PROMPT, "Tess — Reference Tuned")).toBeNull();
  });
});

import { CHARACTER_VOICE_PRESETS } from "@/lib/voice-audition-modes";
describe("character voice presets", () => {
  it("every contact has a valid preset", () => {
    for (const k of ["tess", "maya", "claire", "jordan", "ben"]) {
      const p = CHARACTER_VOICE_PRESETS[k];
      expect(validateVoiceRequest(p.prompt, p.name)).toBeNull();
    }
  });
});
