import { describe, expect, it } from "vitest";
import { nextGiftStatus, giftReceiptConfirmed, explicitReceiptEvidence } from "@/lib/gift-handoff-state";
describe("persistent item handoffs", () => {
  it("allows waiting and taking the item back without fabricating receipt", () => {
    expect(nextGiftStatus("attempted", "wait")).toBe("waiting");
    expect(nextGiftStatus("waiting", "take_back")).toBe("returned");
    expect(giftReceiptConfirmed("waiting")).toBe(false);
  });
  it("confirms only a clear recipient acknowledgment containing the actual item", () => {
    expect(explicitReceiptEvidence("I got the steak, thank you!", "steak and tea")).toBe(true);
    expect(explicitReceiptEvidence("I haven't received the steak yet.", "steak and tea")).toBe(false);
    expect(explicitReceiptEvidence("Thanks for thinking of me!", "steak and tea")).toBe(false);
    expect(explicitReceiptEvidence("I might get the steak later.", "steak and tea")).toBe(false);
  });
  it("keeps received gifts terminal", () => {
    expect(nextGiftStatus("received", "take_back")).toBe("received");
  });
  it("does not let a returned item become waiting again", () => {
    expect(nextGiftStatus("returned", "wait")).toBe("returned");
    expect(giftReceiptConfirmed("returned")).toBe(false);
  });
});
