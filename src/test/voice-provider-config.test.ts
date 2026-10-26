import { afterEach, describe, expect, it, vi } from "vitest";
import { voiceConfiguration } from "@/lib/voice-provider.server";

const keys = ["tess","maya","claire","jordan","ben","riley"] as const;
function valid() {
  vi.stubEnv("ENABLE_VOICE_CALLS", "true");
  vi.stubEnv("VOICE_PROVIDER_VALIDATED", "true");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe");
  vi.stubEnv("OPENAI_SPEECH_MODEL", "gpt-4o-mini-tts");
  keys.forEach((key, i) => vi.stubEnv(`VOICE_${key.toUpperCase()}`, ["alloy","echo","fable","onyx","nova","shimmer"][i]!));
  vi.stubEnv("VOICE_DAILY_BUDGET_CENTS", "100");
  vi.stubEnv("VOICE_MONTHLY_BUDGET_CENTS", "1000");
  vi.stubEnv("VOICE_TURN_RESERVATION_CENTS", "5");
}
afterEach(() => vi.unstubAllEnvs());
describe("OpenAI voice chain configuration", () => {
  it("recognizes all six fictional characters without a paid API request", () => {
    valid();
    const cfg = voiceConfiguration();
    expect(cfg.ready).toBe(true);
    expect(cfg.blockers).toEqual([]);
    expect(Object.keys(cfg.voices)).toEqual([...keys]);
    expect(cfg.voices["riley"]).toBe("shimmer");
  });
  it("identifies missing Riley voice without revealing API credentials", () => {
    valid();
    vi.stubEnv("VOICE_RILEY", "");
    const cfg = voiceConfiguration();
    expect(cfg.ready).toBe(false);
    expect(cfg.blockers).toContain("voice_riley_missing_or_invalid");
    expect(JSON.stringify(cfg.blockers)).not.toContain("test-key");
  });
  it("reports missing models separately from character voices", () => {
    valid();
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "");
    vi.stubEnv("OPENAI_SPEECH_MODEL", "");
    const cfg = voiceConfiguration();
    expect(cfg.transcription).toBe("gpt-4o-mini-transcribe");
    expect(cfg.speech).toBe("gpt-4o-mini-tts");
  });
  it("keeps provider validation and budgets mandatory", () => {
    valid();
    vi.stubEnv("VOICE_PROVIDER_VALIDATED", "false");
    vi.stubEnv("VOICE_TURN_RESERVATION_CENTS", "0");
    expect(voiceConfiguration().blockers).toEqual(expect.arrayContaining(["provider_not_validated", "turn_budget_missing"]));
  });
});
