// @vitest-environment node
import { expect, it } from "vitest";
import { buildSpicyPrompt, buildSpicyRequest, SPICY_MODELS } from "@/lib/spicy-image.server";
import { composeSpicyPrompt, spicyPromptLimit } from "@/lib/spicy-prompt-budget";
import { photoPersonalityPrompt, photographyProfile, type PhotographyPlan } from "@/lib/photo-personality";
import { configuredProviderFor } from "@/lib/photo-provider-policy";

const LONG_CATEGORY = "CATEGORY GUIDANCE: " + "Optional, descriptive romantic styling detail. ".repeat(30);
const plan = (character: string): PhotographyPlan => ({
  version: 1, character, scenario: "at_home", candidates: ["at_home"], location: "home", availability: "free",
  continuity: { hairstyle: "hair clipped up", clothing: "opaque burgundy satin slip", objects: ["moving boxes"], weather: null },
  continuitySource: "recent_delivered_photo", continuityReason: "same evening", outfitEpisode: "same_day",
});
const longScene = (name: string) =>
  `${name} in her bedroom at home wearing her established opaque burgundy satin slip, hair clipped up, beside moving boxes. ` +
  "She is still in her bedroom with warm lamp light and no travel occurred. ".repeat(18) +
  "Earlier conversation: they talked about dinner, music, moving day and a funny roommate story.";

function compose(key: "brooke" | "carly", type: "ordinary" | "mature_romantic" | "suggestive", scene = longScene(key)) {
  const name = key === "brooke" ? "Brooke Halloway" : "Carly Reed";
  const style = { clothing_category: "opaque burgundy satin slip", pose_type: "relaxed upright pose", selfie_type: "selfie", expression: "playful smile" };
  const p = plan(key);
  const profile = photographyProfile(key);
  return composeSpicyPrompt({
    model: SPICY_MODELS[0], base: buildSpicyPrompt(name, key === "brooke" ? 26 : 28, scene, style, type),
    personality: photoPersonalityPrompt(p, style), category: type === "ordinary" ? "" : LONG_CATEGORY, type, style,
    compact: { character: key, location: p.location, scenario: p.scenario, continuity: p.continuity, styles: profile.styles, expressions: profile.expressions },
  });
}

it("uses a 5000-character limit for both supported SpicyAPI models", () => {
  expect(SPICY_MODELS.map(spicyPromptLimit)).toEqual([5000, 5000]);
});

it.each([
  ["brooke", "ordinary"], ["brooke", "mature_romantic"], ["brooke", "suggestive"],
  ["carly", "ordinary"], ["carly", "mature_romantic"], ["carly", "suggestive"],
] as const)("%s %s long reference-edit prompt compresses once and passes preflight", (key, type) => {
  const { prompt, budget } = compose(key, type);
  expect(budget.originalLength).toBeGreaterThan(5000);
  expect(budget).toMatchObject({ compression: "compressed", valid: true, limit: 5000 });
  if (!prompt) throw new Error("Expected a valid prompt");
  expect(prompt.length).toBe(budget.finalLength);
  expect(prompt.length).toBeLessThanOrEqual(5000);
  expect(() => buildSpicyRequest(SPICY_MODELS[0], prompt, ["https://refs.example.com/canon"])).not.toThrow();
  // Identity, continuity, personality and safety survive verbatim.
  expect(prompt).toContain(key === "brooke" ? "Brooke Halloway, a fictional adult age 26" : "Carly Reed, a fictional adult age 28");
  expect(prompt).toContain("opaque burgundy satin slip");
  expect(prompt).toContain("beside moving boxes");
  expect(prompt).toContain("hair clipped up");
  expect(prompt).toContain(`PHOTO PERSONALITY (${key}`);
  expect(prompt).toContain(photographyProfile(key).styles[0]);
  expect(prompt).toContain("No nudity");
  expect(prompt).toContain("must NEVER appear in the image");
  if (type === "mature_romantic") expect(prompt).toContain("Private romantic non-explicit adult portrait");
  if (type === "suggestive") expect(prompt).toContain("Strongly flirtatious adult portrait");
  if (type === "ordinary") expect(prompt).toContain("Ordinary everyday personal smartphone photo");
  // Repeated scene sentences are collapsed rather than cut mid-instruction.
  expect(prompt.match(/no travel occurred/g)).toHaveLength(1);
});

it("compresses even a short mature prompt, which previously always overflowed", () => {
  const { prompt, budget } = compose("brooke", "mature_romantic", "Brooke at home on her couch.");
  expect(budget.originalLength).toBeGreaterThan(5000);
  expect(budget.compression).toBe("compressed");
  expect(prompt).toContain("Brooke at home on her couch.");
});
it("leaves prompts within the limit untouched", () => {
  const r = composeSpicyPrompt({ model: SPICY_MODELS[0], base: "IDENTITY", personality: "P", category: "C", type: "suggestive", style: {},
    compact: { character: "brooke", location: null, scenario: null, continuity: {}, styles: [], expressions: [] } });
  expect(r).toEqual({ prompt: "IDENTITY\nP\nC", budget: { limit: 5000, originalLength: 12, finalLength: 12, compression: "none", valid: true } });
});

it("fails safely instead of truncating essential scene facts", () => {
  const unique = Array.from({ length: 160 }, (_, i) => `Established fact ${i} remains true.`).join(" ");
  const { prompt, budget } = compose("brooke", "mature_romantic", unique);
  expect(prompt).toBeNull();
  expect(budget).toMatchObject({ compression: "failed", valid: false });
  expect(budget.finalLength).toBeGreaterThan(5000);
});

it("keeps configured providers unchanged", () => {
  expect(configuredProviderFor("brooke", "mature_romantic")).toBe("spicyapi");
  expect(configuredProviderFor("carly", "personal_selfie")).toBe("spicyapi");
  expect(configuredProviderFor("tess", "casual_selfie")).toBe("ordinary");
});
