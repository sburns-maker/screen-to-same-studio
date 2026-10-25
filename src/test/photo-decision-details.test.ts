import { describe, expect, it } from "vitest";
import { photoDecisionDetails } from "@/lib/photo-decision-details";
describe("photo decision details", () => {
  it("legacy selected decision shows as offered with no invented trigger", () => {
    const d = photoDecisionDetails({
      kind: "photo_decision",
      summary: "contextual photo opportunity",
      payload: { eligible: true, selected: true },
    });
    expect(d.status).toBe("offered");
    expect(d.trigger).toBeNull();
    expect(d.legacy).toBe(true);
    expect(d.generationRequested).toBe("not recorded");
  });
  it("ineligible decision is blocked with its recorded reason", () => {
    const d = photoDecisionDetails({
      kind: "photo_decision",
      summary: "Unavailable right now",
      payload: { eligible: false, selected: false },
    });
    expect(d.status).toBe("blocked");
    expect(d.failure).toBe("Unavailable right now");
  });
  it("structured outcome not_sent is deferred and keeps trigger", () => {
    const d = photoDecisionDetails({
      kind: "photo_decision",
      summary: "contextual photo opportunity",
      payload: {
        eligible: true,
        selected: true,
        trigger: "walking Mabel",
        outcome: "not_sent",
        outcomeReason: "character declined",
      },
    });
    expect(d.status).toBe("deferred");
    expect(d.trigger).toBe("walking Mabel");
    expect(d.reason).toContain("character declined");
  });
  it("legacy generation failure does not invent whether a provider was called", () => {
    const d = photoDecisionDetails({
      kind: "photo_generation_failure",
      summary: "Photo withheld: x",
      payload: { reason: "Image attempt budget exhausted", source: "conversation" },
    });
    expect(d.status).toBe("failed");
    expect(d.generationRequested).toBe("not recorded");
    expect(d.failure).toBe("Image attempt budget exhausted");
  });
  it("shows a local location block separately from a paid provider attempt", () => {
    const d = photoDecisionDetails({
      kind: "photo_generation_failure",
      summary: "Photo withheld",
      payload: {
        reason: "photo scene contradicts current location",
        imageRequested: false,
        photoValidation: {
          canonicalLocation: "home",
          inferredRequestedScene: "clinic",
          failedRule: "photo.location_matches_current_scene",
        },
      },
    });
    expect(d).toMatchObject({
      status: "blocked",
      generationRequested: "no",
      canonicalLocation: "home",
      requestedScene: "clinic",
      failedRule: "photo.location_matches_current_scene",
    });
  });
});
