/** Pure rules shared by UI, server and tests. Never expose API credentials here. */
export type WorldMemory = { key: string; summary: string; visibility: "shared" | "private" };
export type WorldContact = "Sabrina" | "Maya" | "Elena";
export const WORLD_CONTACTS: readonly WorldContact[] = ["Sabrina", "Maya", "Elena"] as const;

/** Ordinary chat never advances the game day; posts and completed activities advance exactly once. */
export function nextGameDay(currentDay: number, action: "dm" | "post" | "activity"): number {
  if (!Number.isSafeInteger(currentDay) || currentDay < 1) throw new Error("Invalid world day");
  return action === "dm" ? currentDay : currentDay + 1;
}

/** Characters never see another character's private facts. */
export function memoriesForContact(rows: WorldMemory[], contact: WorldContact): WorldMemory[] {
  const namespace = contact.toLowerCase() + ":";
  return rows.filter(row => row.key.startsWith("world:") && row.visibility === "shared" ||
    row.key.toLowerCase().startsWith(namespace)).slice(-60);
}

/** New model-suggested memories cannot change existing canon or claim cross-character authority. */
export function appendCharacterMemories(
  existing: WorldMemory[], suggested: WorldMemory[], contact: WorldContact, limit = 60,
): WorldMemory[] {
  const known = new Map(existing.map(m => [m.key, m]));
  const namespace = contact.toLowerCase() + ":";
  for (const m of suggested) {
    if (known.size >= limit) break;
    if (!m.key.toLowerCase().startsWith(namespace) || known.has(m.key)) continue;
    known.set(m.key, { ...m, visibility: "private" });
  }
  return [...known.values()];
}
