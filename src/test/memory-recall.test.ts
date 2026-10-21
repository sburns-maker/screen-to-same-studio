import { describe, it, expect } from "vitest";
import { recallMemories, type MemoryRow } from "@/lib/memory-recall";

const now = new Date("2026-10-21T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

function filler(n: number): MemoryRow[] {
  return Array.from({ length: n }, (_, i) => ({ summary: `ordinary thing number ${i}`, memory_type: i % 2 ? "personal" : "relationship", importance: 4, created_at: daysAgo(20) }));
}

describe("memory recall", () => {
  it("surfaces a months-old low-importance memory when the topic comes up", () => {
    const old: MemoryRow = { summary: "Mabel ate a sock and needed the vet", memory_type: "personal", importance: 2, created_at: daysAgo(120) };
    const out = recallMemories([...filler(40), old], "how is mabel doing after the vet?", now);
    expect(out).toContain(old);
  });
  it("does not surface it when unrelated", () => {
    const old: MemoryRow = { summary: "Mabel ate a sock and needed the vet", memory_type: "personal", importance: 2, created_at: daysAgo(120) };
    expect(recallMemories([...filler(40), old], "what are you cooking tonight", now)).not.toContain(old);
  });
  it("keeps facts from being crowded out by other categories", () => {
    const fact: MemoryRow = { summary: "he works nights", memory_type: "fact", importance: 2, created_at: daysAgo(90) };
    expect(recallMemories([...filler(60), fact], "hey", now)).toContain(fact);
  });
  it("caps total recalled memories", () => {
    expect(recallMemories(filler(100), "hi", now).length).toBe(18);
  });
});
