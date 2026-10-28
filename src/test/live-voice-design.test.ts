import { describe, expect, it } from "vitest";
import {
  TESS_VARIANT_DIRECTIONS,
  VOICE_CREATION_SCRIPT_HINT,
  VOICE_DESIGNS,
  VOICE_DESIGN_KEYS,
  customVoiceId,
  gptLiveSessionConfig,
} from "@/lib/live-voice-design";
import { AUDITION_SCRIPT } from "@/lib/voice-studio-audition";

describe("GPT-Live character voice identities", () => {
  it("has distinct non-impersonating designs for all primary contacts", () => {
    expect(Object.keys(VOICE_DESIGNS)).toEqual(["tess", "maya", "claire", "jordan", "ben", "riley", "sienna"]);
    expect(VOICE_DESIGN_KEYS).toEqual(Object.keys(VOICE_DESIGNS));
    expect(VOICE_DESIGNS.tess.description).toContain("never");
    expect(VOICE_DESIGNS.tess.description).toContain("never husky");
    expect(new Set(Object.values(VOICE_DESIGNS).map((x) => x.description)).size).toBe(7);
  });
  it("refuses missing and arbitrary stock voice names", () => {
    expect(customVoiceId("tess", {})).toBeNull();
    expect(customVoiceId("tess", { GPT_LIVE_VOICE_TESS: "coral" })).toBeNull();
    expect(() => gptLiveSessionConfig("tess", {})).toThrow("approved GPT-Live voice");
  });
  it("cannot enable a voice session without an explicit feature flag", () => {
    expect(() => gptLiveSessionConfig("tess", { GPT_LIVE_VOICE_TESS: "voice_tessabc123" })).toThrow(
      "not enabled",
    );
  });
  it("binds a saved approved ID to Tess's own voice instructions", () => {
    const cfg = gptLiveSessionConfig("tess", {
      ENABLE_GPT_LIVE_CALLS: "true",
      GPT_LIVE_VOICE_TESS: "voice_tessabc123",
    });
    expect(cfg.audio.output.voice.id).toBe("voice_tessabc123");
    expect(cfg.instructions).toContain("Do not invent commitments");
  });
});

describe("voice creation script hint", () => {
  const words = VOICE_CREATION_SCRIPT_HINT.trim().split(/\s+/).length;
  it("is 180–250 words long", () => {
    expect(words).toBeGreaterThanOrEqual(180);
    expect(words).toBeLessThanOrEqual(250);
  });
  it("is separate from the short audition script", () => {
    expect(VOICE_CREATION_SCRIPT_HINT).not.toBe(AUDITION_SCRIPT);
    expect(VOICE_CREATION_SCRIPT_HINT).not.toContain(AUDITION_SCRIPT);
    expect(AUDITION_SCRIPT.split(/\s+/).length).toBeLessThan(40);
  });
  it("steers every Tess variant away from robotic delivery", () => {
    for (const d of Object.values(TESS_VARIANT_DIRECTIONS)) expect(d).toContain("robotic");
  });
});

import { presetVoicePrompt, validateVoiceRequest, VOICE_PROMPT_MAX, VOICE_NAME_MAX } from "@/lib/live-voice-design";
describe("editable voice descriptions", () => {
  it("preset prompt combines base description and Tess direction", () => {
    const p = presetVoicePrompt("tess", "refined");
    expect(p).toContain("grew up in England");
    expect(p).toContain("lightly melodic cadence");
  });
  it("rejects too short, too long and nameless requests", () => {
    expect(validateVoiceRequest("short", "Tess")).toMatch(/at least/);
    expect(validateVoiceRequest("x".repeat(VOICE_PROMPT_MAX + 1), "Tess")).toMatch(/at most/);
    expect(validateVoiceRequest(presetVoicePrompt("tess", "natural"), "  ")).toMatch(/name/);
    expect(validateVoiceRequest(presetVoicePrompt("tess", "natural"), "n".repeat(VOICE_NAME_MAX + 1))).toMatch(/name/);
  });
  it("accepts every preset as-is", () => {
    for (const v of ["natural", "refined", "playful"] as const)
      expect(validateVoiceRequest(presetVoicePrompt("tess", v), "Tess")).toBeNull();
  });
});
