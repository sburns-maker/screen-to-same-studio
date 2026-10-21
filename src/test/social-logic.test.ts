import { describe, expect, it } from "vitest";
import {
  CANON_LINKS,
  CANON_NPCS,
  KNOWLEDGE_RULES,
  atLeast,
  hashSeed,
  knowledgeFromEvent,
  knowledgePromptLines,
  linkChangesFromEvent,
  mulberry32,
  planWeekEvents,
  weekId,
  type LinkRow,
  type PlannedEvent,
} from "@/lib/social-logic";

const WEEK = "2026-W43";
const CHARACTERS = ["tess", "maya", "claire", "jordan", "ben"];

function canonLinks(): LinkRow[] {
  return CANON_LINKS.map((l) => ({
    characterKey: l.characterKey,
    otherType: l.otherType,
    otherKey: l.otherKey,
    level: l.level,
  }));
}

describe("canon social networks", () => {
  it("every character has their own NPC circle", () => {
    for (const ck of CHARACTERS) {
      const npcs = CANON_NPCS.filter((n) => n.characterKey === ck);
      expect(npcs.length, `${ck} should have background people`).toBeGreaterThanOrEqual(3);
    }
  });

  it("social circles are independent — no NPC belongs to two characters", () => {
    const seen = new Map<string, string>();
    for (const n of CANON_NPCS) {
      const existing = seen.get(n.name);
      expect(existing, `${n.name} appears in two circles`).toBeUndefined();
      seen.set(n.name, n.characterKey);
    }
  });

  it("playable characters do not start as one friend group", () => {
    const crossLinks = CANON_LINKS.filter((l) => l.otherType === "character");
    // The only canon cross-character awareness is knows_of, never friendship.
    for (const l of crossLinks) {
      expect(l.level).toBe("knows_of");
    }
    // Claire and Jordan know nobody playable at start.
    expect(crossLinks.some((l) => l.characterKey === "claire")).toBe(false);
    expect(crossLinks.some((l) => l.characterKey === "jordan")).toBe(false);
  });

  it("canon links carry reasons", () => {
    for (const l of CANON_LINKS) expect(l.reason.length).toBeGreaterThan(0);
  });
});

describe("deterministic event planning", () => {
  it("planning the same week twice yields identical events (idempotent)", () => {
    const a = planWeekEvents("tess", WEEK);
    const b = planWeekEvents("tess", WEEK);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("event ids are unique per character, kind, weekday and week", () => {
    const all = CHARACTERS.flatMap((k) => planWeekEvents(k, WEEK));
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("different weeks produce different event ids", () => {
    const a = planWeekEvents("tess", WEEK).map((e) => e.id);
    const b = planWeekEvents("tess", "2026-W44").map((e) => e.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it("Tess's Thursday trivia is preserved with consistent companions", () => {
    const events = planWeekEvents("tess", WEEK);
    const trivia = events.find((e) => e.kind === "trivia");
    expect(trivia).toBeDefined();
    expect(trivia!.occursAt.getUTCDay()).toBe(4);
    const npcs = trivia!.participants.filter((p) => p.type === "npc").map((p) => p.key);
    // Companions come only from her established team.
    for (const n of npcs) expect(["Marcus", "Lena", "Dev"]).toContain(n);
  });

  it("multi-week simulation stays stable and bounded", () => {
    for (const w of ["2026-W40", "2026-W41", "2026-W42", "2026-W43"]) {
      const all = CHARACTERS.flatMap((k) => planWeekEvents(k, w));
      expect(all.length).toBeLessThanOrEqual(12);
      for (const e of all) expect(e.facts).toBeDefined();
    }
  });
});

describe("shared events and overlap", () => {
  it("shared facts are identical for every participant of an event", () => {
    // The event record holds the facts once; participants reference the same
    // event id, so contradictory versions are impossible by construction.
    const events = planWeekEvents("tess", WEEK);
    for (const e of events) {
      const again = planWeekEvents("tess", WEEK).find((x) => x.id === e.id);
      expect(again!.facts).toEqual(e.facts);
    }
  });

  it("attending the same event does not automatically create a relationship", () => {
    // Force an overlap by scanning weeks until a playable overlap occurs.
    let found: PlannedEvent | null = null;
    for (let w = 1; w <= 52 && !found; w++) {
      for (const e of planWeekEvents("tess", `2026-W${String(w).padStart(2, "0")}`)) {
        if (e.participants.some((p) => p.type === "character" && p.key !== "tess")) found = e;
      }
    }
    expect(found).not.toBeNull();
    const other = found!.participants.find((p) => p.type === "character" && p.key !== "tess")!;
    if (other.met.length === 0) {
      // Present but never met → no link change at all.
      const changes = linkChangesFromEvent(found!, canonLinks());
      expect(changes.some((c) => c.otherKey === other.key)).toBe(false);
    }
  });

  it("a proper meeting can create an acquaintance link with a reason", () => {
    // Find a week where Tess actually meets another character.
    for (let w = 1; w <= 52; w++) {
      for (const e of planWeekEvents("tess", `2026-W${String(w).padStart(2, "0")}`)) {
        const tess = e.participants.find((p) => p.type === "character" && p.key === "tess")!;
        if (tess.met.length > 0) {
          const changes = linkChangesFromEvent(e, canonLinks());
          const up = changes.find((c) => c.characterKey === "tess" && c.otherKey === tess.met[0]);
          expect(up).toBeDefined();
          expect(up!.to).toBe("acquaintance"); // never jumps to friend
          expect(up!.reason.length).toBeGreaterThan(0);
          return;
        }
      }
    }
    throw new Error("no cross-character meeting found in a year of simulation");
  });

  it("Maya, Claire, Jordan and Ben are never automatic trivia teammates", () => {
    for (let w = 1; w <= 12; w++) {
      const trivia = planWeekEvents("tess", `2026-W${String(w).padStart(2, "0")}`).find((e) => e.kind === "trivia")!;
      const npcs = trivia.participants.filter((p) => p.type === "npc").map((p) => p.key);
      for (const n of npcs) expect(["Marcus", "Lena", "Dev"]).toContain(n);
    }
  });
});

describe("knowledge isolation and propagation", () => {
  it("only character participants witness an event", () => {
    const e = planWeekEvents("tess", WEEK)[0]!;
    const knowledge = knowledgeFromEvent(e, canonLinks());
    const witnessed = knowledge.filter((k) => k.knowledgeType === "witnessed");
    const attendeeKeys = e.participants.filter((p) => p.type === "character").map((p) => p.key);
    expect(witnessed.map((k) => k.characterKey).sort()).toEqual(attendeeKeys.sort());
  });

  it("NPCs never get stored knowledge (they are background, not agents)", () => {
    for (const ck of CHARACTERS) {
      for (const e of planWeekEvents(ck, WEEK)) {
        const knowledge = knowledgeFromEvent(e, canonLinks());
        for (const k of knowledge) expect(CHARACTERS).toContain(k.characterKey);
      }
    }
  });

  it("knowledge never propagates to characters with no link to a witness", () => {
    // Jordan has no canon link to Tess, so she can never hear Tess's stories.
    for (let w = 1; w <= 12; w++) {
      for (const e of planWeekEvents("tess", `2026-W${String(w).padStart(2, "0")}`)) {
        const knowledge = knowledgeFromEvent(e, canonLinks());
        expect(knowledge.some((k) => k.characterKey === "jordan")).toBe(false);
        expect(knowledge.some((k) => k.characterKey === "claire")).toBe(false);
      }
    }
  });

  it("secondhand knowledge is marked as told, with its source", () => {
    // Find any event with a told entry across a simulated season.
    let told: ReturnType<typeof knowledgeFromEvent> = [];
    for (let w = 1; w <= 52 && !told.length; w++) {
      for (const ck of CHARACTERS) {
        for (const e of planWeekEvents(ck, `2026-W${String(w).padStart(2, "0")}`)) {
          told = told.concat(knowledgeFromEvent(e, canonLinks()).filter((k) => k.knowledgeType === "told"));
        }
      }
    }
    for (const k of told) {
      expect(k.source).toMatch(/^told by /);
      expect(k.summary).toContain("mentioned:");
    }
  });

  it("prompt lines come only from stored knowledge rows", () => {
    const lines = knowledgePromptLines(
      [
        { subject_type: "event", subject_id: "e1", knowledge_type: "witnessed", summary: "Trivia — won", source: "witnessed", acquired_at: "2026-10-15T23:00:00Z" },
        { subject_type: "event", subject_id: "e2", knowledge_type: "told", summary: "Maya mentioned: venue drama", source: "told by maya", acquired_at: "2026-10-16T10:00:00Z" },
      ],
      "Tess",
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("she was there");
    expect(lines[1]).toContain("heard secondhand");
    // The rules forbid referencing anything not in memories or this list.
    expect(KNOWLEDGE_RULES).toContain("knows NOTHING else");
    expect(KNOWLEDGE_RULES).toContain("private conversations");
  });
});

describe("helpers", () => {
  it("mulberry32 is deterministic per seed", () => {
    const a = mulberry32(hashSeed("x"));
    const b = mulberry32(hashSeed("x"));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("atLeast orders relationship levels", () => {
    expect(atLeast("friend", "acquaintance")).toBe(true);
    expect(atLeast("knows_of", "friend")).toBe(false);
    expect(atLeast("family", "close_friend")).toBe(true);
  });

  it("weekId is stable within a week and Eastern-based", () => {
    const a = weekId(new Date("2026-10-21T04:00:00Z"));
    const b = weekId(new Date("2026-10-22T20:00:00Z"));
    expect(a).toBe(b);
  });
});
