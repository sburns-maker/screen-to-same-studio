import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVENT_TAG_RULES, normalizeEventTags } from "@/lib/event-tags";

const MAYA_REPLY = "Maybe I will be—if you play your cards right 😘 But don’t get too comfy thinking I’m just waiting around!";

describe("event tag rules", () => {
  it("defines flirt_rejected as genuine refusal only", () => {
    expect(EVENT_TAG_RULES).toMatch(/"flirt_rejected" ONLY for a genuine romantic\/sexual refusal/);
    expect(EVENT_TAG_RULES).not.toMatch(/deflect/i);
  });

  it("classifies conditional interest like Maya's reply as flirt/banter", () => {
    expect(EVENT_TAG_RULES).toContain("if you play your cards right");
    expect(EVENT_TAG_RULES).toMatch(/NEVER "flirt_rejected"/);
  });

  it("keeps boundary, correction and platonic distinctions", () => {
    expect(EVENT_TAG_RULES).toMatch(/is "boundary"/);
    expect(EVENT_TAG_RULES).toMatch(/is "correction"/);
    expect(EVENT_TAG_RULES).toMatch(/platonic friendship, never use "flirt"/);
    expect(EVENT_TAG_RULES).toMatch(/tags alone never raise romantic_intent/);
  });

  it("is injected into both Tess and contact reply paths", () => {
    const src = readFileSync("src/lib/tess.server.ts", "utf8");
    expect(src).toContain("${EVENT_TAG_RULES}");
    expect(src.match(/\$\{photoDecisionRules\(args\.photoBoundary\)\}/g)?.length).toBe(2);
    expect(src.match(/\$\{EVENT_TAGS_LINE\}/g)?.length).toBe(2);
    expect(src).not.toMatch(/event_tags: short tags for what happened this turn\.`/);
  });
});

describe("normalizeEventTags", () => {
  it("downgrades Maya's misclassified flirty reply", () => {
    void MAYA_REPLY;
    expect(normalizeEventTags(["flirt_rejected"], "flirty", true)).toEqual(["flirt"]);
  });
  it("keeps genuine rejections with a cold tone", () => {
    expect(normalizeEventTags(["flirt_rejected"], "guarded", true)).toEqual(["flirt_rejected"]);
    expect(normalizeEventTags(["flirt_rejected"], "annoyed", true)).toEqual(["flirt_rejected"]);
  });
  it("uses banter, never flirt, for platonic characters like Ben", () => {
    expect(normalizeEventTags(["flirt_rejected", "banter"], "playful", false)).toEqual(["banter"]);
  });
  it("leaves other tags untouched", () => {
    expect(normalizeEventTags(["correction"], "flirty")).toEqual(["correction"]);
  });
});
