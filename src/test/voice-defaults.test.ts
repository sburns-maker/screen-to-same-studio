import { describe, it, expect, vi, afterEach } from "vitest";
import { voiceConfiguration } from "@/lib/voice-provider.server";
afterEach(() => vi.unstubAllEnvs());
describe("speech-chain low-touch Lovable defaults", () => {
  it("provides six distinct built-in OpenAI voices and modest cost caps without extra secrets", () => {
    for (const key of ["VOICE_TESS","VOICE_MAYA","VOICE_CLAIRE","VOICE_JORDAN","VOICE_BEN","VOICE_RILEY",
      "OPENAI_TRANSCRIPTION_MODEL","OPENAI_SPEECH_MODEL","VOICE_DAILY_BUDGET_CENTS",
      "VOICE_MONTHLY_BUDGET_CENTS","VOICE_TURN_RESERVATION_CENTS"]) vi.stubEnv(key, "");
    const c = voiceConfiguration();
    expect(c.transcription).toBe("gpt-4o-mini-transcribe");
    expect(c.speech).toBe("gpt-4o-mini-tts");
    expect(Object.keys(c.voices)).toHaveLength(6);
    expect(new Set(Object.values(c.voices)).size).toBe(6);
    expect(c.dailyCents).toBe(100);
    expect(c.monthlyCents).toBe(1000);
    expect(c.turnCents).toBe(5);
  });
  it("remains off until explicit call enable and provider validation flags", () => {
    vi.stubEnv("ENABLE_VOICE_CALLS", "false");
    vi.stubEnv("VOICE_PROVIDER_VALIDATED", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const c = voiceConfiguration();
    expect(c.ready).toBe(false);
    expect(c.blockers).toContain("voice_calls_disabled");
    expect(c.blockers).toContain("provider_not_validated");
  });
  it("honors per-character overrides without changing the others", () => {
    vi.stubEnv("VOICE_RILEY", "marin");
    const c = voiceConfiguration();
    expect(c.voices["riley"]).toBe("marin");
    expect(c.voices["tess"]).toBe("coral");
  });
});
