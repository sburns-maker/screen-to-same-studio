import { describe, expect, it } from "vitest";
import { nextReceptionTurn, dropoffSummary, type ReceptionSession } from "@/lib/workplace-reception";
const session = (character: ReceptionSession["character"] = "riley"): ReceptionSession => ({
  character, item: "steak and tea", turns: [], outcome: "unresolved",
});
describe("public receptionist conversations", () => {
  it("allows several free-form turns at any workplace", () => {
    let s = nextReceptionTurn(session("tess"), "I brought coffee for Tess. Can I drop it off?");
    expect(s.turns).toHaveLength(2);
    s = nextReceptionTurn(s, "I'll wait here");
    expect(s.turns).toHaveLength(4);
    expect(s.outcome).toBe("waiting");
  });
  it("does not grant private access or claim an item was received", () => {
    const s = nextReceptionTurn(session(), "May I go into the laboratory?");
    expect(s.turns[1]?.body).toContain("staff-only");
    expect(dropoffSummary(s)).toContain("no delivery was confirmed");
  });
  it("can leave a message without inventing acceptance", () => {
    const s = nextReceptionTurn(session("ben"), "Can you leave a message for Ben?");
    expect(s.outcome).toBe("message_left");
    expect(dropoffSummary(s)).toContain("no item acceptance or receipt was confirmed");
  });
  it("lets a visitor take the item back", () => {
    const s = nextReceptionTurn(session("maya"), "Never mind, I'll take it back");
    expect(s.outcome).toBe("declined");
    expect(dropoffSummary(s)).toContain("no delivery occurred");
  });
});