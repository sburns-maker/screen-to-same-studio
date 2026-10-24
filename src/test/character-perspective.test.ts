import { describe,it,expect } from "vitest";
import { z } from "zod";
import { replySchema, CHARACTER_PERSPECTIVE_RULES } from "@/lib/tess.server";
describe("character reflection schema",()=>{
 it("offers a fictional reflection that is nullable",()=>{
  expect(CHARACTER_PERSPECTIVE_RULES).toContain("fictional");
  const shape=replySchema.shape.character_perspective;
  expect(shape.safeParse("I liked the teasing, but coffee comes first.").success).toBe(true);
  expect(shape.safeParse(null).success).toBe(true);
 });
 it("keeps every reply field required for OpenAI strict structured output",()=>{
  const json=z.toJSONSchema(replySchema) as {properties:Record<string,unknown>;required?:string[]};
  expect(new Set(json.required)).toEqual(new Set(Object.keys(json.properties)));
 });
});
