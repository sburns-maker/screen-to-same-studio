import { describe, expect, it } from "vitest";
import {
  canFinalizeCommitment, commitmentEventSchema, commitmentLabel, resolveCommitmentStatus,
  type CommitmentEvent, canShareCommitmentWithCharacter, RELATIONSHIP_PILOT, commitmentContextForCharacter, RELATIONSHIP_CAST, supportsRelationshipCommitment, relationshipDiscussionDraft, readRelationshipDraft, relationshipDraftKey,
} from "@/lib/relationship-commitments";

const example: CommitmentEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  characterKey: "tess",
  kind: "exclusive",
  proposedBy: "character",
  status: "pending",
  userResponse: "pending",
  characterResponse: "accepted",
  occurredAt: "2026-10-26T20:00:00-04:00",
  sourceId: "message:1",
  sourceType: "message",
  note: null,
};
describe("durable relationship commitment rules", () => {
  it("requires both independent acceptances", () => {
    expect(resolveCommitmentStatus([example])).toBe("none");
    expect(canFinalizeCommitment(example)).toBe(false);
    const accepted = { ...example, userResponse: "accepted" as const, status: "accepted" as const };
    expect(canFinalizeCommitment(accepted)).toBe(true);
    expect(resolveCommitmentStatus([accepted])).toBe("exclusive");
  });
  it("never promotes a declined or cancelled proposal", () => {
    for (const status of ["declined", "cancelled"] as const) {
      expect(resolveCommitmentStatus([{ ...example, status, userResponse: "accepted" }])).toBe("none");
      expect(canFinalizeCommitment({ ...example, status, userResponse: "accepted" })).toBe(false);
    }
  });
  it("derives changes from acknowledged events, not attraction points or housing", () => {
    const accepted = { ...example, userResponse: "accepted" as const, status: "accepted" as const };
    const engaged = { ...accepted, id: "00000000-0000-4000-8000-000000000003", kind: "engagement" as const, occurredAt: "2026-11-01T20:00:00-05:00" };
    expect(resolveCommitmentStatus([engaged, accepted])).toBe("engaged");
    expect(commitmentLabel("engaged")).toBe("Engaged");
  });
  it("rejects malformed provenance", () => {
    expect(commitmentEventSchema.safeParse({ ...example, sourceId: "" }).success).toBe(false);
  });
});

it("keeps Tess pilot commitment knowledge out of Riley and other contacts", () => {
  expect(RELATIONSHIP_PILOT.crossCharacterDisclosure).toBe(false);
  expect(RELATIONSHIP_PILOT.propagateCommitmentScores).toBe(false);
  expect(canShareCommitmentWithCharacter("tess", "tess")).toBe(true);
  for (const contact of ["riley", "maya", "claire", "jordan", "ben"])
    expect(canShareCommitmentWithCharacter("tess", contact)).toBe(false);
});

it("only provides Tess commitment facts to Tess across every conversation channel", () => {
  const event: CommitmentEvent = {
    ...example, status: "accepted", userResponse: "accepted", characterResponse: "accepted",
  };
  const own = commitmentContextForCharacter("tess", "tess", [event]);
  expect(own.join(" ")).toContain("Exclusive");
  for (const other of ["riley", "maya", "claire", "jordan", "ben"]) {
    expect(commitmentContextForCharacter("tess", other, [event])).toEqual([]);
  }
});
it("does not claim a pending commitment is accepted", () => {
  const context = commitmentContextForCharacter("tess", "tess", [example]);
  expect(context.join(" ")).toContain("pending");
  expect(context.join(" ")).toContain(example.id);
  expect(context.join(" ")).not.toContain("CANONICAL PRIVATE COMMITMENT WITH PLAYER: Exclusive");
});
it("does not import another contact's relationship events into Tess", () => {
  expect(commitmentContextForCharacter("tess", "tess", [
    { ...example, characterKey: "riley", status: "accepted", userResponse: "accepted" },
  ]).join(" ")).not.toContain("Exclusive");
});

it.each(RELATIONSHIP_CAST)("isolates proposals and editable drafts for %s", (character) => {
  const own = { ...example, characterKey: character };
  expect(supportsRelationshipCommitment(character)).toBe(true);
  for (const recipient of [...RELATIONSHIP_CAST, "ben"]) {
    if (recipient !== character) expect(commitmentContextForCharacter(character, recipient, [own])).toEqual([]);
    const raw = JSON.stringify({ character, kind: "partnership", eventId: example.id });
    expect(readRelationshipDraft(raw, recipient)).toBe(recipient === character ? relationshipDiscussionDraft("partnership") : null);
  }
  const mixed = RELATIONSHIP_CAST.map(key => ({ ...own, characterKey: key, id: crypto.randomUUID() }));
  const context = commitmentContextForCharacter(character, character, mixed).join(" ");
  for (const event of mixed.filter(e => e.characterKey !== character)) expect(context).not.toContain(event.id);
});
it("separates draft keys, validates them, and leaves Ben platonic", () => {
  expect(relationshipDraftKey("one")).not.toBe(relationshipDraftKey("two"));
  expect(supportsRelationshipCommitment("ben")).toBe(false);
  expect(readRelationshipDraft("invalid", "tess")).toBeNull();
  expect(readRelationshipDraft(JSON.stringify({character:"tess",kind:"partnership",eventId:"invalid"}), "tess")).toBeNull();
  expect(relationshipDiscussionDraft("exclusive")).toContain("exclusively");
});
