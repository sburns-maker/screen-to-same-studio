import { describe, expect, it } from "vitest";
import { nextGiftStatus, giftReceiptConfirmed } from "@/lib/gift-handoff-state";
describe("persistent item handoffs", () => {
  it("allows waiting and taking the item back without fabricating receipt", () => {
    expect(nextGiftStatus("attempted", "wait")).toBe("waiting");
    expect(nextGiftStatus("waiting", "take_back")).toBe("returned");
    expect(giftReceiptConfirmed("waiting")).toBe(false);
  });
  it("does not let a returned item become waiting again", () => {
    expect(nextGiftStatus("returned", "wait")).toBe("returned");
    expect(giftReceiptConfirmed("returned")).toBe(false);
  });
});
