// Pure, AI-free memory recall: blends topic association, recency and importance,
// with per-category slots so one kind of memory never crowds out the others.
export type MemoryRow = { summary: string; memory_type: string; importance: number | null; created_at: string };

const STOP = new Set("the a an and or but to of in on at for with is was are were be been it its this that i you me my your we our he she her him his they them just so not no yes do did have has had about from what when how like really very can will would could".split(" "));

export function keywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/)
      .map((w) => w.replace(/'s$/, ""))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function scoreMemory(m: MemoryRow, topic: Set<string>, now: Date): number {
  const importance = Math.max(1, Math.min(5, m.importance ?? 3));
  const ageDays = Math.max(0, (now.getTime() - new Date(m.created_at).getTime()) / 86_400_000);
  const recency = Math.exp(-ageDays / 10); // fresh things are on the mind; fades over weeks
  let hits = 0;
  for (const w of keywords(m.summary)) if (topic.has(w)) hits++;
  const association = Math.min(3, hits);
  // Core anchors (importance 5) never fade below their weight.
  return importance * 1.0 + recency * 3 + association * 4;
}

const SLOTS: Record<string, number> = { relationship: 6, personal: 6, fact: 4 };

export function recallMemories(rows: MemoryRow[], recentText: string, now: Date, limit = 18): MemoryRow[] {
  const topic = keywords(recentText);
  const ranked = rows
    .map((m) => ({ m, s: scoreMemory(m, topic, now) }))
    .sort((a, b) => b.s - a.s || b.m.created_at.localeCompare(a.m.created_at));
  const picked: MemoryRow[] = [];
  const used = new Map<string, number>();
  for (const { m } of ranked) {
    if (picked.length >= limit) break;
    const cap = SLOTS[m.memory_type] ?? 3;
    const n = used.get(m.memory_type) ?? 0;
    if (n >= cap) continue;
    used.set(m.memory_type, n + 1);
    picked.push(m);
  }
  // Fill leftover room with best remaining regardless of category.
  for (const { m } of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked;
}
