import { describe, expect, it } from "vitest";
import {
  evidenceContinuity,
  currentActivity,
  nextActivityAt,
  intentionDue,
  locationCategory,
} from "@/lib/world-continuity";
import { previewWorld } from "@/lib/world-runtime.server";
import { characterFor } from "@/lib/characters";
import { topicGuidance } from "@/lib/tess-topics";
const now = new Date("2026-10-22T16:00:00Z");
const quote = "I'll send you a picture after work.";
const promise = {
  kind: "photo",
  summary: "Workday photo",
  due_at: "2026-10-22T22:00:00Z",
  source_quote: quote,
};
const continuity = { fulfilled: null, intentions: [promise], facts: [] };

describe("evidence-backed continuity", () => {
  it("accepts an explicit future promise from delivered text, never an invented quote", () => {
    expect(evidenceContinuity(continuity, "", quote, now).intentions).toHaveLength(1);
    expect(
      evidenceContinuity(continuity, quote, "Maybe another time.", now).intentions,
    ).toHaveLength(0);
  });
  it("rejects expired, ungrounded and distant intention times", () => {
    for (const due_at of ["yesterday", "2026-10-22T15:00:00Z", "2027-01-01T12:00:00Z"])
      expect(
        evidenceContinuity({ ...continuity, intentions: [{ ...promise, due_at }] }, "", quote, now)
          .intentions,
      ).toHaveLength(0);
  });
  it("does not promote jokes or assistant claims into confirmed canon", () => {
    const source_quote = "Becca helped with setup.";
    const facts = [
      { kind: "npc", key: "Becca", value: source_quote, status: "confirmed", source_quote },
      {
        kind: "possession",
        key: "magic button",
        value: "controls time",
        status: "joke",
        source_quote,
      },
    ];
    expect(
      evidenceContinuity({ ...continuity, facts }, "", `${quote} ${source_quote}`, now).facts,
    ).toEqual([expect.objectContaining({ key: "npc:becca", status: "tentative" })]);
    expect(
      evidenceContinuity({ ...continuity, facts }, source_quote, quote, now).facts[0]?.status,
    ).toBe("confirmed");
  });
  it("does not complete an intention from a refusal or another future promise", () => {
    for (const source_quote of ["I'll send it tomorrow.", "I can't take a photo now."])
      expect(
        evidenceContinuity(
          { ...continuity, fulfilled: { id: "record", source_quote } },
          "",
          source_quote,
          now,
        ).fulfilled,
      ).toBeNull();
  });
  it("honors expiry and backoff for pending intentions", () => {
    const record = {
      status: "pending",
      due_at: "2026-10-22T15:00:00Z",
      expires_at: "2026-10-24T15:00:00Z",
      retry_at: null,
    };
    expect(intentionDue(record, now)).toBe(true);
    expect(intentionDue({ ...record, status: "fulfilled" }, now)).toBe(false);
    expect(intentionDue({ ...record, retry_at: "2026-10-22T17:00:00Z" }, now)).toBe(false);
    expect(intentionDue({ ...record, expires_at: "2026-10-22T15:30:00Z" }, now)).toBe(false);
  });
});

describe("shared schedule and practice preview", () => {
  it.each(["tess", "maya", "claire", "jordan", "ben"])(
    "%s has causal deterministic transitions without advancing real time or relationships",
    (key) => {
      const def = characterFor(key);
      const first = previewWorld(def, now, 24);
      expect(previewWorld(def, now, 24)).toEqual(first);
      expect(first.length).toBeGreaterThan(1);
      expect(Date.parse(nextActivityAt(def, now))).toBeGreaterThan(now.getTime());
      expect(first.every((s, i) => i === 0 || s.at > first[i - 1]!.at)).toBe(true);
      expect(now.toISOString()).toBe("2026-10-22T16:00:00.000Z");
    },
  );
  it("marks Tess clinic activity as work and never treats sleeping as a photo opportunity", () => {
    expect(locationCategory(currentActivity(characterFor("tess"), now))).toBe("work");
    expect(
      currentActivity(characterFor("tess"), new Date("2026-10-22T07:00:00Z")).availability,
    ).toBe("asleep");
  });
});

describe("personality-preserving topic closure", () => {
  it.each([
    ["tess", "Lasagna again", "Lasagna", "lasagna"],
    ["maya", "Saturday soon", "Our Saturday date", "already-discussed date"],
    ["claire", "French fries", "More fries", "French-fry"],
    ["jordan", "Prove it", "Earn it", "guarded challenges"],
  ])("%s notices saturated motifs", (key, a, b, expected) => {
    expect(topicGuidance([a, b], "How was your day?", key)).toContain(expected);
  });
  it("permits a natural ending and Jordan accepting sincerity without a new test", () => {
    expect(topicGuidance([], "Good night, talk later.", "tess")).toContain("sign-off");
    expect(topicGuidance([], "I appreciate you.", "jordan")).toContain(
      "accept a sincere compliment",
    );
  });
});
