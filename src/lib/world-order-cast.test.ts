import { describe, expect, it } from "vitest";
import { canAddWorldCharacter, scheduledActiveCharacters, WORLD_ORDER_CAST_RULES } from "./world-order-cast";

describe("World Order population cap", () => {
  it("allows new characters until 200 per world", () => {
    expect(canAddWorldCharacter(0)).toBe(true);
    expect(canAddWorldCharacter(199)).toBe(true);
    expect(canAddWorldCharacter(200)).toBe(false);
    expect(canAddWorldCharacter(201)).toBe(false);
    expect(canAddWorldCharacter(-1)).toBe(false);
  });
  it("limits active AI cast independently of world population", () => {
    expect(WORLD_ORDER_CAST_RULES.perWorldCharacterCap).toBe(200);
    expect(scheduledActiveCharacters(16)).toBe(16);
    expect(scheduledActiveCharacters(200)).toBe(20);
    expect(scheduledActiveCharacters(-1)).toBe(0);
  });
});
