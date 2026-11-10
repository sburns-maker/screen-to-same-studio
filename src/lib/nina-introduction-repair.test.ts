import { describe, expect, it } from "vitest";
import { NINA_LEGACY_OPENER, ninaLegacyRepairIds } from "./nina-introduction-repair";

const first = { id: "opening", sender: "tess", body: NINA_LEGACY_OPENER, metadata: {} };
const followup = { id: "autonomous", sender: "tess", body: "Unreplied follow-up", metadata: {
  initiated: true, photo_decision: { generationAttempted: false, selectedAction: "text_only" },
} };

describe("Nina legacy introduction repair", () => {
  it("repairs the legacy opener despite two autonomous follow-ups", () => {
    expect(ninaLegacyRepairIds([first, followup, { ...followup, id: "second" }])).toEqual(["opening", "autonomous", "second"]);
  });
  it("never rewrites a thread with a player reply anywhere", () => {
    expect(ninaLegacyRepairIds([first, followup, { ...followup, sender: "user" }])).toBeNull();
  });
  it("preserves photo attachments and uncertain paid attempts", () => {
    expect(ninaLegacyRepairIds([first, { ...followup, metadata: { ...followup.metadata, generated_path: "owned/photo.jpg" } }])).toBeNull();
    expect(ninaLegacyRepairIds([first, { ...followup, metadata: { initiated: true } }])).toBeNull();
    expect(ninaLegacyRepairIds([first, { ...followup, metadata: { initiated: true, photo_decision: { generationAttempted: true, selectedAction: "text_only" } } }])).toBeNull();
  });
  it("leaves authored introductions and non-autonomous dialogue unchanged", () => {
    expect(ninaLegacyRepairIds([{ ...first, body: "Already introduced" }])).toBeNull();
    expect(ninaLegacyRepairIds([first, { ...followup, metadata: {} }])).toBeNull();
    expect(ninaLegacyRepairIds([])).toBeNull();
  });
});