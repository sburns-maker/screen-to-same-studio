import { describe, expect, it } from "vitest";
import { photoTestStatus } from "@/lib/photo-test-status";
import { photoOpportunity } from "@/lib/photo-opportunities";
import { SEED_STATE } from "@/lib/tess-logic";
import { scheduleFor } from "@/lib/tess-life";
import { applyDisruption } from "@/lib/daily-disruptions";

const ready = {
  opportunity: { eligible: true },
  providerConfigured: true,
  textProviderConfigured: true,
  deliveryMigrationReady: true,
};
describe("photo test feedback", () => {
  it("keeps delivery disabled until an eligible, fully configured preview", () => {
    expect(photoTestStatus(null, false).canDeliver).toBe(false);
    expect(photoTestStatus(ready, true).canDeliver).toBe(false);
    expect(photoTestStatus({ ...ready, deliveryMigrationReady: false }, false).canDeliver).toBe(
      false,
    );
    expect(photoTestStatus(ready, false).canDeliver).toBe(true);
  });
  it("explains an incompatible task before a generic category failure", () => {
    const opportunity = photoOpportunity({
      character: "tess",
      conversationId: "thread",
      now: new Date("2026-10-22T17:23:00Z"),
      schedule: {
        activity: "at work (chaotic day)",
        availability: "busy",
        detail: "emergency intake at the clinic",
      },
      state: SEED_STATE,
      frequency: "normal",
      eligibleTypes: [],
      lastPhotoAt: null,
      ownSinceLastPhoto: 99,
      gapHours: 3,
      preview: true,
      context: "an ordinary clinic desk moment",
    });
    const status = photoTestStatus({ opportunity }, false);
    expect(status.canDeliver).toBe(false);
    expect(status.message).toContain("current activity is incompatible with a photo");
    expect(status.message).not.toContain("relationship or boundary");
  });
  it("provides visible feedback for queued, replayed, declined and failed requests", () => {
    expect(photoTestStatus({ count: 1 }, false).showChat).toBe(true);
    expect(photoTestStatus({ replayed: true }, false).message).toContain("already processed");
    expect(
      photoTestStatus({ reason: "character declined the opportunity" }, false).message,
    ).toContain("declined");
    expect(photoTestStatus({ error: "request failed" }, false).message).toBe("request failed");
  });
});

describe("Tess clinic breaks", () => {
  it("permits ordinary lunch and desk breaks even on a chaotic day", () => {
    for (const iso of ["2026-10-22T16:23:00Z", "2026-10-22T17:23:00Z"]) {
      const schedule = scheduleFor(new Date(iso));
      expect(schedule.availability).toBe("limited");
      expect(schedule.activity).toContain("work");
      const opportunity = photoOpportunity({
        character: "tess",
        conversationId: "thread",
        now: new Date(iso),
        schedule,
        state: SEED_STATE,
        frequency: "normal",
        eligibleTypes: ["object"],
        lastPhotoAt: null,
        ownSinceLastPhoto: 99,
        gapHours: 3,
        preview: true,
        context: "an ordinary clinic desk moment",
      });
      expect(opportunity.eligible).toBe(true);
    }
  });
  it("keeps the rest of the chaotic shift busy and respects emergency interruptions", () => {
    expect(scheduleFor(new Date("2026-10-22T17:45:00Z")).availability).toBe("busy");
    const base = scheduleFor(new Date("2026-10-22T17:23:00Z"));
    expect(
      applyDisruption(base, {
        id: "emergency",
        detail: "emergency intake",
        availability: "busy",
        block: "work",
      }).availability,
    ).toBe("busy");
  });
});
