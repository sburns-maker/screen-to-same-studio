// @vitest-environment node
import { describe, expect, it } from "vitest";
import { spicyDeliveryBoundaryAllows } from "@/lib/spicy-delivery-boundary";

const casual = { type: "ordinary", photoType: "casual_selfie" };
const romantic = { type: "mature_romantic" };
const suggestive = { type: "suggestive" };
const settings = (photo_boundary: string, mature_photography: boolean | null) =>
  ({ photo_boundary, mature_photography });

describe("SpicyAPI category-specific delivery boundaries", () => {
  it("delivers Brooke/Carly ordinary couch selfies with mature mode off", () => {
    expect(spicyDeliveryBoundaryAllows(casual, settings("mature", false))).toBe(true);
    expect(spicyDeliveryBoundaryAllows(casual, settings("none", false))).toBe(true);
  });
  it("honors selfie and all-photo blocks for ordinary portraits", () => {
    expect(spicyDeliveryBoundaryAllows(casual, settings("selfies", true))).toBe(false);
    expect(spicyDeliveryBoundaryAllows(casual, settings("all_photos", true))).toBe(false);
    expect(spicyDeliveryBoundaryAllows({ type: "ordinary", photoType: "object" }, settings("selfies", false))).toBe(true);
  });
  it("requires mature consent and a boundary permitting romantic/suggestive photos", () => {
    for (const type of [romantic, suggestive]) {
      expect(spicyDeliveryBoundaryAllows(type, settings("none", true))).toBe(true);
      expect(spicyDeliveryBoundaryAllows(type, settings("none", false))).toBe(false);
      expect(spicyDeliveryBoundaryAllows(type, settings("mature", true))).toBe(false);
      expect(spicyDeliveryBoundaryAllows(type, settings("all_photos", true))).toBe(false);
    }
  });
  it("fails closed for absent conversations, unknown values, and unrecognized photo categories", () => {
    expect(spicyDeliveryBoundaryAllows(casual, null)).toBe(false);
    expect(spicyDeliveryBoundaryAllows(casual, settings("unknown", true))).toBe(false);
    expect(spicyDeliveryBoundaryAllows({ type: "ordinary", photoType: "unknown" }, settings("none", true))).toBe(false);
    expect(spicyDeliveryBoundaryAllows({}, settings("none", true))).toBe(false);
  });
});
