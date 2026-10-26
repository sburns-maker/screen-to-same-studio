import { describe, it, expect, vi, afterEach } from "vitest";
import { voiceConfiguration } from "@/lib/voice-provider.server";
import { incomingLiveMode } from "@/lib/phone-calls.server";
afterEach(() => vi.unstubAllEnvs());
describe("speech-chain low-touch Lovable defaults", () => {
  it("provides model and cost defaults without overwriting Voice Studio voices", () => {
    for (const key of ["VOICE_TESS","VOICE_MAYA","VOICE_CLAIRE","VOICE_JORDAN","VOICE_BEN","VOICE_RILEY",
      "OPENAI_TRANSCRIPTION_MODEL","OPENAI_SPEECH_MODEL","VOICE_DAILY_BUDGET_CENTS",
      "VOICE_MONTHLY_BUDGET_CENTS","VOICE_TURN_RESERVATION_CENTS"]) vi.stubEnv(key, "");
    const c = voiceConfiguration();
    expect(c.transcription).toBe("gpt-4o-mini-transcribe");
    expect(c.speech).toBe("gpt-4o-mini-tts");
    expect(Object.keys(c.voices)).toHaveLength(6);
    expect(c.blockers).toContain("voice_riley_missing_or_invalid");
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
    expect(c.voices["tess"]).not.toBe("coral");
  });
});

describe("opt-in GPT-Live incoming transport", () => {
  it("stays off until all independent server switches and OpenAI credential are set", () => {
    vi.stubEnv("ENABLE_INCOMING_GPT_LIVE_CALLS", "true");
    vi.stubEnv("ENABLE_LIVE_CHARACTER_CALLS", "false");
    vi.stubEnv("ENABLE_LIVE_CHARACTER_CALLS", "false");
    vi.stubEnv("OPENAI_API_KEY", "fake-test");
    expect(incomingLiveMode()).toBe(false);
    vi.stubEnv("ENABLE_LIVE_CHARACTER_CALLS", "true");
    expect(incomingLiveMode()).toBe(true);
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(incomingLiveMode()).toBe(false);
  });
  it("does not depend on legacy TTS model and five/six environment voices", () => {
    vi.stubEnv("ENABLE_INCOMING_GPT_LIVE_CALLS", "true");
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    vi.stubEnv("ENABLE_LIVE_CHARACTER_CALLS", "true");
    vi.stubEnv("OPENAI_API_KEY", "fake-test");
    vi.stubEnv("VOICE_TESS", "");
    expect(incomingLiveMode()).toBe(true);
    expect(voiceConfiguration().ready).toBe(false);
  });
});
