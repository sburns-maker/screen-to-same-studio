import { describe, expect, it } from "vitest";
import { fairWorldConversationGroups } from "@/lib/world-conversation-queue";

const first = new Date("2026-10-30T16:00:00.000Z");
const interval = 30 * 60_000;
const eightCharacters = ["tess", "maya", "claire", "jordan", "ben", "riley", "sienna", "kendra"]
  .map((id) => ({ user_id: "player", id }));

describe("fair world-tick conversation ordering", () => {
  it("never drops Riley or later characters when a user has eight conversations", () => {
    const grouped = fairWorldConversationGroups(eightCharacters, first);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]![1]).toHaveLength(8);
    expect(grouped[0]![1].map((r) => r.id).sort()).toEqual(eightCharacters.map((r) => r.id).sort());
    expect(grouped[0]![1].some((r) => r.id === "riley")).toBe(true);
  });

  it("rotates priority every 30-minute window, with deterministic same-window order", () => {
    const current = fairWorldConversationGroups(eightCharacters, first)[0]![1];
    const repeat = fairWorldConversationGroups(eightCharacters, new Date(first.getTime() + 60_000))[0]![1];
    const later = fairWorldConversationGroups(eightCharacters, new Date(first.getTime() + interval))[0]![1];
    expect(repeat).toEqual(current);
    expect(later).not.toEqual(current);
    // When only four AI calls are available, rotating ensures Riley is not
    // permanently excluded from the first four conversations.
    const firstFour = new Set<string>();
    for (let i = 0; i < eightCharacters.length; i++) {
      const turn = fairWorldConversationGroups(eightCharacters, new Date(first.getTime() + i * interval))[0]![1];
      for (const contact of turn.slice(0, 4)) firstFour.add(contact.id);
    }
    expect(firstFour).toEqual(new Set(eightCharacters.map((c) => c.id)));
  });

  it("rotates different accounts as well as characters while retaining every row", () => {
    const page = [
      ...eightCharacters,
      { user_id: "other", id: "other-tess" },
      { user_id: "other", id: "other-maya" },
    ];
    const a = fairWorldConversationGroups(page, first);
    const b = fairWorldConversationGroups(page, new Date(first.getTime() + interval));
    expect(a.flatMap(([, rows]) => rows)).toHaveLength(page.length);
    expect(b.flatMap(([, rows]) => rows)).toHaveLength(page.length);
    expect(a.map(([user]) => user)).not.toEqual(b.map(([user]) => user));
  });
  it("handles an empty page and single-character account without mutation", () => {
    expect(fairWorldConversationGroups([], first)).toEqual([]);
    const row = [{ user_id: "one", id: "riley" }];
    expect(fairWorldConversationGroups(row, first)).toEqual([["one", row]]);
    expect(row).toEqual([{ user_id: "one", id: "riley" }]);
  });
});
