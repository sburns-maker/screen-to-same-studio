import { describe,it,expect } from "vitest";
import { replySchema, CHARACTER_PERSPECTIVE_RULES } from "@/lib/tess.server";
describe("character reflection schema",()=>{
 it("offers a fictional reflection that is nullable",()=>{
   expect(CHARACTER_PERSPECTIVE_RULES).toContain("fictional");
   expect(CHARACTER_PERSPECTIVE_RULES).toContain("REQUIRED for every conversational reply");
   expect(CHARACTER_PERSPECTIVE_RULES).not.toContain("Use null when nothing meaningful changed");
  const shape=replySchema.shape.character_perspective;
  expect(shape.safeParse("I liked the teasing, but coffee comes first.").success).toBe(true);
  expect(shape.safeParse(null).success).toBe(true);
 });
 it("keeps every reply field required for OpenAI strict structured output",()=>{
  const optional=Object.entries(replySchema.shape).filter(([,s])=>s.safeParse(undefined).success).map(([k])=>k);
  expect(optional).toEqual([]);
 });
});
