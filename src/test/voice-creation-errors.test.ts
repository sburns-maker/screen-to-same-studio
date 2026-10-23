import { describe, expect, it } from "vitest";
import { classifyVoiceCreationFailure as c } from "@/lib/voice-creation-errors";

describe("voice creation error classification", () => {
  it("429 rate limit", () => expect(c(429, { error: { code: "rate_limit_exceeded" } }).kind).toBe("rate_limited"));
  it("429 insufficient_quota is billing", () => expect(c(429, { error: { code: "insufficient_quota" } }).kind).toBe("billing"));
  it("402 billing", () => expect(c(402).kind).toBe("billing"));
  it("403 access", () => expect(c(403).kind).toBe("access"));
  it("400 validation", () => expect(c(400).kind).toBe("validation"));
  it("503 provider", () => expect(c(503).kind).toBe("provider"));
  it("timeout", () => expect(c(null, null, { name: "TimeoutError" }).kind).toBe("timeout"));
  it("network", () => expect(c(null, null, { name: "TypeError" }).kind).toBe("network"));
  it("redacts keys from provider text", () => {
    const m = c(400, { error: { message: "bad key sk-abcdefghijklmnop123" } }).message;
    expect(m).not.toContain("sk-abcdefghijklmnop123");
  });
});
