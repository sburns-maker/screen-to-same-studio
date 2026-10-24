import { describe, expect, it } from "vitest";
import { activeCommitment, photoContextConflicts, physicalStoryAllowed, type CommitmentPlan } from "@/lib/calendar-commitment";
import { beginStories, storyMayAdvance, type StoryState } from "@/lib/storyline-logic";
import { locationCategory } from "@/lib/world-continuity";
import { photoOpportunity } from "@/lib/photo-opportunities";
import { SEED_STATE } from "@/lib/tess-logic";

// Saturday Oct 24 2026, noon lunch at Fanelli's (16:00–17:00 UTC).
const lunch: CommitmentPlan = { id: "lunch", title: "Lunch", organizer: "tess", status: "in_progress", starts_at: "2026-10-24T16:00:00Z", ends_at: "2026-10-24T17:00:00Z", place_key: "fanelli:local" };
const at = (iso: string) => new Date(iso);

describe("calendar commitments", () => {
  it("an accepted outing overrides the baseline schedule", () => {
    const c = activeCommitment("tess", [{ ...lunch, status: "accepted" }], [], at("2026-10-24T16:20:00Z"));
    expect(c?.phase).toBe("attending");
    expect(c?.detail).toContain("fanelli");
    expect(locationCategory(c!)).not.toBe("work");
  });
  it("does not apply another character's plan", () => {
    expect(activeCommitment("maya", [lunch], [], at("2026-10-24T16:20:00Z"))).toBeNull();
  });
  it("keeps the character at the outing when its finish is not yet recorded", () => {
    const c = activeCommitment("tess", [lunch], [{ plan_id: "lunch", state: "in_progress", synced_at: null, updated_at: "2026-10-24T16:50:00Z" }], at("2026-10-24T17:00:00Z"));
    expect(c?.phase).toBe("pending_completion");
  });
  it("uses the recorded completion time for a delayed finish, then a short after-outing state", () => {
    const ex = [{ plan_id: "lunch", state: "completed", synced_at: "2026-10-24T17:40:00Z", updated_at: "2026-10-24T17:40:00Z" }];
    const plan = { ...lunch, status: "completed" };
    expect(activeCommitment("tess", [plan], ex, at("2026-10-24T17:20:00Z"))?.phase).toBe("attending");
    expect(activeCommitment("tess", [plan], ex, at("2026-10-24T18:00:00Z"))?.phase).toBe("after");
    expect(activeCommitment("tess", [plan], ex, at("2026-10-24T19:30:00Z"))).toBeNull();
  });
  it("ignores missed and cancelled plans", () => {
    expect(activeCommitment("tess", [{ ...lunch, status: "cancelled" }], [], at("2026-10-24T16:20:00Z"))).toBeNull();
  });
});

describe("workplace storylines", () => {
  const sat = at("2026-10-24T17:00:00Z"), mon = at("2026-10-26T17:00:00Z");
  it("time off blocks physical workplace milestones", () => {
    expect(physicalStoryAllowed("the veterinary practice", "Tess and Sam are reviewing uneven clinic shift coverage", sat, false)).toBe(false);
    expect(physicalStoryAllowed("the veterinary practice", "", mon, false)).toBe(true);
    expect(physicalStoryAllowed("home", "Evan wedding plans", sat, false)).toBe(true);
  });
  it("an outing blocks workplace milestones even on a workday", () => {
    expect(physicalStoryAllowed("the veterinary practice", "", mon, true)).toBe(false);
  });
  it("a world tick during an outing never starts the clinic rota storyline", () => {
    for (let i = 0; i < 40; i++) {
      const started = beginStories(`user-${i}`, mon, [], [], new Set(["tess"]));
      expect(started.some((s) => s.state.template === "clinic_rota")).toBe(false);
    }
  });
  it("overlapping ticks postpone, not advance, a due workplace milestone", () => {
    const s = { version: 1, template: "clinic_rota", owner: "tess", characters: ["tess"], npc: "Sam", stage: "beginning", step: 0, startedAt: "2026-10-20T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z", nextAt: "2026-10-24T12:00:00Z", summary: "x", mood: "neutral", availability: "normal" } as StoryState;
    expect(storyMayAdvance(s, sat, new Set())).toBe(false);
    expect(storyMayAdvance(s, mon, new Set(["tess"]))).toBe(false);
    expect(storyMayAdvance(s, mon, new Set())).toBe(true);
  });
});

describe("photos during an outing", () => {
  const c = activeCommitment("tess", [lunch], [], at("2026-10-24T16:20:00Z"))!;
  it("rejects clinic context while on an outing", () => {
    expect(photoContextConflicts(c, "a handwritten rota beside a coffee at the clinic")).toBe(true);
    expect(photoContextConflicts(c, "pasta at Fanelli's")).toBe(false);
  });
  it("autonomous photo opportunity refuses the conflicting background storyline", () => {
    const r = photoOpportunity({ character: "tess", conversationId: "c", now: at("2026-10-24T16:20:00Z"), schedule: c, state: { ...SEED_STATE, curiosity: 80, comfort: 80, trust: 80 }, frequency: "frequent", eligibleTypes: ["object"], lastPhotoAt: null, ownSinceLastPhoto: 99, gapHours: 3, context: "clinic shift coverage rota", preview: true });
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("conflicts");
  });
});
