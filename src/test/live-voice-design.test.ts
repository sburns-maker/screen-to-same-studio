import { describe, expect, it } from "vitest";
import { VOICE_DESIGNS, customVoiceId, gptLiveSessionConfig } from "@/lib/live-voice-design";

describe("GPT-Live character voice identities", () => {
  it("has distinct non-impersonating designs for all primary contacts", () => {
    expect(Object.keys(VOICE_DESIGNS)).toEqual(["tess", "maya", "claire", "jordan", "ben"]);
    expect(VOICE_DESIGNS.tess.description).toContain("never");
    expect(VOICE_DESIGNS.tess.description).toContain("never husky");
    expect(new Set(Object.values(VOICE_DESIGNS).map((x) => x.description)).size).toBe(5);
  });
  it("refuses missing and arbitrary stock voice names", () => {
    expect(customVoiceId("tess", {})).toBeNull();
    expect(customVoiceId("tess", { GPT_LIVE_VOICE_TESS: "coral" })).toBeNull();
    expect(() => gptLiveSessionConfig("tess", {})).toThrow("approved GPT-Live voice");
  });
  it("cannot enable a voice session without an explicit feature flag", () => {
    expect(() => gptLiveSessionConfig("tess", { GPT_LIVE_VOICE_TESS: "voice_tessabc123" })).toThrow("not enabled");
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
