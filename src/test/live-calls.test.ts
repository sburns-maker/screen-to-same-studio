import { validIncomingLiveOffer } from "@/lib/live-calls";
import { describe, expect, it } from "vitest";
import {
  buildCallInstructions,
  hasUserSpeech,
  liveCallLimits,
  liveCallsEnabled,
  LIVE_CALL_CHARACTERS,
  transcriptText,
} from "@/lib/live-calls";

describe("live character call rules", () => {
  it("allows Riley to use the same phone-voice assignment and calling paths as the cast", () => {
    expect(LIVE_CALL_CHARACTERS).toContain("riley");
    expect(LIVE_CALL_CHARACTERS).toContain("sienna");
    expect(LIVE_CALL_CHARACTERS).toHaveLength(7);
  });
  it("defaults to 5-minute calls, 20 a day and 2 hours a month", () => {
    expect(liveCallLimits({})).toEqual({ seconds: 300, leaseSeconds: 450, daily: 20, monthlySeconds: 7200 });
  });
  it("clamps configured call length to at most 15 minutes", () => {
    expect(liveCallLimits({ LIVE_CALL_MAX_SECONDS: "5000" }).seconds).toBe(900);
    expect(liveCallLimits({ LIVE_CALL_MAX_SECONDS: "10" }).seconds).toBe(300);
  });
  it("is off unless the flag and key are both set", () => {
    expect(liveCallsEnabled({ ENABLE_LIVE_CHARACTER_CALLS: "true" })).toBe(false);
    expect(liveCallsEnabled({ ENABLE_LIVE_CHARACTER_CALLS: "true", OPENAI_API_KEY: "k" })).toBe(true);
  });
  it("only saves a memory when the caller actually spoke", () => {
    expect(hasUserSpeech([{ role: "character", text: "Hey you." }])).toBe(false);
    expect(hasUserSpeech([{ role: "user", text: "hi there" }])).toBe(true);
  });
  it("keeps the newest part of a long transcript", () => {
    const t = transcriptText([{ role: "user", text: "a".repeat(50) }, { role: "character", text: "end" }], "Tess", 20);
    expect(t.endsWith("Tess: end")).toBe(true);
    expect(t.length).toBe(20);
  });
  it("puts the most important memories in the call and stays under the cap", () => {
    const text = buildCallInstructions({
      fullName: "Tess Morgan", preferredName: "Tess", age: 34, pronouns: "she/her", bible: "x".repeat(10_000),
      stage: "dating", availability: { availability: "free", detail: "free" }, localTime: "Friday 10 PM",
      memories: [{ summary: "minor", importance: 1 }, { summary: "brought her coffee at the clinic", importance: 5 }],
      recent: [],
    });
    expect(text.length).toBeLessThanOrEqual(9000);
    expect(text.indexOf("brought her coffee")).toBeLessThan(text.indexOf("minor") === -1 ? Infinity : text.indexOf("minor"));
  });
});

describe("incoming GPT-Live ring authorization", () => {
  const now = Date.parse("2026-10-26T13:00:00Z");
  const good = {
    conversation_id: "20000000-0000-4000-a000-000000000001",
    character_key: "riley",
    direction: "incoming",
    state: "ringing",
    ring_until: "2026-10-26T13:00:20Z",
  };
  const target = { conversationId: good.conversation_id, character: good.character_key };
  it("accepts only the right unexpired incoming ring", () => {
    expect(validIncomingLiveOffer(good, target, now)).toBe(true);
    expect(validIncomingLiveOffer({ ...good, direction: "outgoing" }, target, now)).toBe(false);
    expect(validIncomingLiveOffer({ ...good, conversation_id: "other" }, target, now)).toBe(false);
    expect(validIncomingLiveOffer({ ...good, character_key: "tess" }, target, now)).toBe(false);
    expect(validIncomingLiveOffer({ ...good, state: "connecting" }, target, now)).toBe(false);
    expect(validIncomingLiveOffer({ ...good, ring_until: "2026-10-26T13:00:00Z" }, target, now)).toBe(false);
    expect(validIncomingLiveOffer({ ...good, ring_until: "malformed" }, target, now)).toBe(false);
  });
});
