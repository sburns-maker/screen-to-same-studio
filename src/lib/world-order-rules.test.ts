import { describe, expect, it } from "vitest";
import { nextGameDay, memoriesForContact, appendCharacterMemories, type WorldMemory } from "./world-order-rules";

describe("World Order game clock", () => {
  it("keeps direct messages within the same game day", () => expect(nextGameDay(189, "dm")).toBe(189));
  it("advances a day for each public post", () => expect(nextGameDay(189, "post")).toBe(190));
  it("advances a day for completed activities", () => expect(nextGameDay(189, "activity")).toBe(190));
  it("rejects invalid game days", () => expect(() => nextGameDay(-2, "post")).toThrow());
});

describe("World Order character memory", () => {
  const memories: WorldMemory[] = [
    { key: "world:rescue", summary: "The concert rescue was public.", visibility: "shared" },
    { key: "sabrina:promise", summary: "A private promise to Sabrina.", visibility: "private" },
    { key: "elena:plan", summary: "A secret agreement with Elena.", visibility: "private" },
    { key: "maya:article", summary: "Maya is writing a story.", visibility: "private" },
    { key: "sabrina:public", summary: "A private character fact mislabeled shared.", visibility: "shared" },
  ];
  it("reveals the public world and only selected contact's memories", () => {
    const got = memoriesForContact(memories, "Elena").map(m => m.key);
    expect(got).toEqual(["world:rescue", "elena:plan"]);
  });
  it("does not leak other character facts even if labeled shared", () => {
    expect(memoriesForContact(memories, "Sabrina").map(m=>m.key)).not.toContain("elena:plan");
  });
  it("does not rewrite established anchors", () => {
    const updated = appendCharacterMemories(memories, [
      { key: "sabrina:promise", summary: "A contradictory new version.", visibility: "shared" },
      { key: "sabrina:new", summary: "A newly established fact.", visibility: "shared" },
    ], "Sabrina");
    expect(updated.find(m=>m.key === "sabrina:promise")?.summary).toBe("A private promise to Sabrina.");
    expect(updated.find(m=>m.key === "sabrina:new")?.visibility).toBe("private");
  });
  it("rejects cross-character memory injection", () => {
    const got = appendCharacterMemories([], [{ key: "elena:secret", summary: "Leak attempt", visibility: "shared" }], "Sabrina");
    expect(got).toEqual([]);
  });
});
