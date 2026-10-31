import { describe, expect, it } from "vitest";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { FICTIONAL_MARRIAGE_SHOW, weddingShowContext, weddingShowEligible } from "@/lib/fictional-marriage-show";
import { weddingReflectionGuidance } from "@/lib/shared-wedding-reflection";

const femaleContacts: CharacterKey[] = ["tess", "maya", "claire", "jordan", "riley", "sienna", "kendra"];
const at = new Date("2026-10-31T22:00:00Z");
const listing = "I show you the Wildcard Wedding casting listing on my phone. It's a million-dollar television wedding show.";
const saved = [
  { source: "user", body: listing },
  { source: "character", body: "Well, that is an unexpected proposition." },
  { source: "user", body: "I'm curious what you think." },
  { source: "character", body: "The show is entertaining, but I'm thinking about us, too." },
  { source: "user", body: "We enjoy dinner together." },
  { source: "character", body: "Let's enjoy tonight and see." },
  { source: "user", body: "What a lovely evening." },
] as const;
const state = { perceived_pressure: 0, irritation: 0 };

describe("shared Wildcard Wedding listing", () => {
  it("makes the same public fictional listing available to each adult female contact", () => {
    expect(FICTIONAL_MARRIAGE_SHOW.prizeUsd).toBe(1_000_000);
    for (const key of femaleContacts) {
      expect(CHARACTERS[key].age).toBeGreaterThanOrEqual(18);
      expect(CHARACTERS[key].romanticCapable).toBe(true);
      expect(weddingShowEligible(key)).toBe(true);
      const prompt = weddingShowContext(key, [{ sender: "user", body: listing }], at);
      expect(prompt).toContain("Wildcard Wedding");
      expect(prompt).toContain("million");
      expect(prompt).not.toContain("already married");
    }
    expect(weddingShowEligible("ben")).toBe(false);
    expect(weddingShowContext("ben", [{ sender: "user", body: listing }], at)).toBe("");
  });

  it("does not inject the show into an unrelated conversation or a family wedding", () => {
    for (const key of femaleContacts) {
      expect(weddingShowContext(key, [{ sender: "user", body: "How was work?" }], at)).toBe("");
    }
    expect(weddingShowContext("tess", [{ sender: "user", body: "How is Evan's wedding planning going?" }], at)).toBe("");
    expect(weddingShowContext("riley", [{ sender: "user", body: "Is your hospital shift busy?" }], at)).toBe("");
  });

  it("describes an open listing, not selection, money credited, or an actual wedding", () => {
    const prompt = weddingShowContext("kendra", [{ sender: "user", body: listing }], at);
    expect(prompt).toContain("public");
    expect(prompt).toContain("not an actual television program");
    expect(prompt).toContain("do not claim you applied");
    expect(prompt).toContain("actual wedding remains a separate milestone");
  });
});

describe("independent relationship reflection for each woman", () => {
  it("only considers a listing the player has actually shown in this contact's own outing", () => {
    for (const key of femaleContacts) {
      expect(weddingReflectionGuidance({ character: key, moments: saved.slice(1), state })).toBe("");
    }
    expect(weddingReflectionGuidance({ character: "ben", moments: saved, state })).toBe("");
    expect(weddingReflectionGuidance({ character: "maya", moments: saved.slice(0, 4), state })).toBe("");
  });

  it("gives distinct reactions and never a guaranteed yes or automatic milestone", () => {
    for (const key of ["tess", "maya", "claire", "jordan", "riley", "kendra"] as const) {
      const prompt = weddingReflectionGuidance({ character: key, moments: saved, state });
      expect(prompt).toContain(CHARACTERS[key].preferredName.toUpperCase());
      expect(prompt).toContain("ONE honest");
      expect(prompt).toContain("make anyone engaged or married automatically");
      expect(prompt.toLowerCase()).toContain("actual commitments");
    }
    expect(weddingReflectionGuidance({ character: "claire", moments: saved, state })).toContain("friendship");
    expect(weddingReflectionGuidance({ character: "riley", moments: saved, state })).toContain("already partners");
    expect(weddingReflectionGuidance({ character: "jordan", moments: saved, state })).toContain("guarded and skeptical");
  });

  it("avoids rerunning a question; considers her own real answer independently", () => {
    const question = { source: "character", body: "I've been thinking about the wedding show. What if the cameras disappeared, would you still choose a life with me?" };
    const answer = { source: "user", body: "Yes, the real Tuesday mornings and shared adventures matter more than any money." };
    expect(weddingReflectionGuidance({ character: "kendra", moments: [...saved, question], state })).toBe("");
    const prompt = weddingReflectionGuidance({ character: "kendra", moments: [...saved, question, answer], state });
    expect(prompt).toContain("YOU chose");
    expect(prompt).toContain("His answer is not a password");
    expect(weddingReflectionGuidance({ character: "kendra", moments: [...saved, question, answer, { source: "character", body: "That's sweet." }], state })).toBe("");
  });

  it("honors pressure, a direct proposal, and a definite no", () => {
    expect(weddingReflectionGuidance({ character: "maya", moments: saved, state: { perceived_pressure: 16, irritation: 0 } })).toBe("");
    expect(weddingReflectionGuidance({ character: "maya", moments: [...saved, { source: "user", body: "Will you marry me?" }], state })).toBe("");
    expect(weddingReflectionGuidance({ character: "maya", moments: [...saved, { source: "character", body: "Marriage is off the table for me." }], state })).toBe("");
  });
});
