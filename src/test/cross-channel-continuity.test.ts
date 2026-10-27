import { describe, expect, it } from "vitest";
import { recentSpokenMoments } from "@/lib/cross-channel-continuity";

describe("shared text and phone history", () => {
  const now = "2026-10-26T19:30:00.000Z";
  it("provides recorded call topics for a later text", () => {
    const lines = recentSpokenMoments([
      { sender: "tess", body: "I'll tell you about the vet clinic tomorrow.", created_at: now, metadata: { channel: "voice", call_id: "call-1" } },
      { sender: "user", body: "Sounds good.", created_at: now, metadata: { channel: "voice", call_id: "call-1" } },
    ], "Tess");
    expect(lines.join(" ")).toContain("vet clinic tomorrow");
    expect(lines.join(" ")).toContain("Player: Sounds good.");
  });
  it("does not manufacture topics from texts, empty dialogue or call status", () => {
    expect(recentSpokenMoments([
      { sender: "tess", body: "Nice call", created_at: now, metadata: { channel: "text" } },
      { sender: "tess", body: "", created_at: now, metadata: { channel: "voice" } },
    ], "Tess")).toEqual([]);
  });
  it("bounds size and leaves the original history unchanged", () => {
    const turns = Array.from({ length: 12 }, (_, i) => ({
      sender: "tess", body: "x".repeat(350) + i, created_at: now,
      metadata: { channel: "voice" },
    }));
    const lines = recentSpokenMoments(turns, "Tess");
    expect(lines).toHaveLength(8);
    expect(lines.every(line => line.length < 390)).toBe(true);
    expect(turns).toHaveLength(12);
  });
});
