import { describe, expect, it } from "vitest";
import { debriefSchema, replySchema } from "@/lib/tess.server";
import { STATE_KEYS } from "@/lib/tess-logic";

describe("debrief schema", () => {
  it("covers the expanded analysis dimensions", () => {
    const keys = Object.keys(debriefSchema.shape);
    for (const k of [
      "initiation",
      "reciprocity",
      "question_balance",
      "branches",
      "exits",
      "tone_read",
      "baseline_change",
      "friendly_vs_flirty",
      "interest_direction",
      "momentum",
      "who_carried",
      "tess_invested",
      "missed_openings",
      "pressure",
    ]) {
      expect(keys, `missing ${k}`).toContain(k);
    }
  });
});

describe("reply schema memory layers", () => {
  it("accepts relationship, personal and fact memory types", () => {
    const base = {
      continuity: null,
      messages: ["hi"],
      send_delay_seconds: 10,
      state_delta: Object.fromEntries(
        STATE_KEYS.map((k) => [k, 0]),
      ),
      photo: null,
      tone: "neutral",
      event_tags: [],
      photo_boundary_decision: "unchanged",
    };
    for (const memory_type of ["relationship", "personal", "fact"]) {
      const r = replySchema.safeParse({ ...base, memory_candidates: [{ memory_type, summary: "x", importance: 3 }] });
      expect(r.success).toBe(true);
    }
  });
});
