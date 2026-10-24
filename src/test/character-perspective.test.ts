import { describe,it,expect } from "vitest";
import { replySchema, CHARACTER_PERSPECTIVE_RULES } from "@/lib/tess.server";
describe("character reflection schema",()=>{
 it("offers a fictional reflection with limits",()=>{
  expect(CHARACTER_PERSPECTIVE_RULES).toContain("fictional");
  const shape=replySchema.shape.character_perspective;
  expect(shape.safeParse("I liked the teasing, but coffee comes first.").success).toBe(true);
  expect(shape.safeParse(null).success).toBe(true);
  expect(shape.safeParse("x".repeat(701)).success).toBe(false);
 });
});
