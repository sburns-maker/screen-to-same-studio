// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { generateTessImage, PhotoGenerationFailure } from "@/lib/tess-image.server";
import { buildSpicyRequest, SPICY_MODELS } from "@/lib/spicy-image.server";
import { characterFor } from "@/lib/characters";
const checks = vi.hoisted(() => ({ screen: vi.fn() }));
vi.mock("@/lib/photo-identity-qc.server", () => ({ requireVisualScreen: () => {}, screenPhotoVisuals: checks.screen }));
vi.mock("@/lib/photo-text-qc.server", () => ({ textVerificationAvailable: () => true, checkPhotoText: async () => ({ status: "not_checked" }) }));
afterEach(() => vi.clearAllMocks());
const canonical = { blob: new Blob(["original private bytes"], { type: "image/jpeg" }), asset: "src/assets/avatars/brooke-canon.jpg", sha256: "unchanged", width: 1086, height: 1448 };

it.each(["brooke", "carly"] as const)("shared %s mature generation reaches SpicyAPI preflight once, retaining original bytes", async (key) => {
  const ch = characterFor(key);
  const generate = vi.fn(async (prompt: string, references: Blob[]) => {
    expect(references).toEqual([canonical.blob]);
    buildSpicyRequest(SPICY_MODELS[0], prompt, ["https://refs.example.com/canon"]);
    return { bytes: new Uint8Array([1]), mime: "image/png", provider: "spicyapi", model: SPICY_MODELS[0] };
  });
  const result = await generateTessImage({
    provider: { name: "spicyapi", model: SPICY_MODELS[0], referenceConditioning: true, allowIdentityRetry: false, generate },
    canonical, type: "mature_romantic", scene: `${ch.preferredName} in her bedroom. ` + "Still at home; no travel. ".repeat(30),
    expression: "playful smile", identity: { key, name: ch.fullName, age: ch.age, pronouns: ch.pronouns, appearance: ch.appearance },
  });
  expect(generate).toHaveBeenCalledOnce();
  expect(checks.screen).toHaveBeenCalledOnce();
  expect(result.diagnostics).toMatchObject({ provider: "spicyapi", referenceConditioning: true, promptBudget: { compression: "compressed", valid: true } });
  expect(result.diagnostics.promptBudget?.finalLength).toBeLessThanOrEqual(5000);
});
it("unsqueezable essential facts fail once before any provider call with content-free diagnostics", async () => {
  const ch = characterFor("brooke");
  const generate = vi.fn();
  const scene = Array.from({ length: 200 }, (_, i) => `Unique necessary scene fact ${i}.`).join(" ");
  const error = await generateTessImage({ provider: { name: "spicyapi", model: SPICY_MODELS[0], referenceConditioning: true, generate },
    canonical, type: "mature_romantic", scene, expression: null,
    identity: { key: "brooke", name: ch.fullName, age: ch.age, pronouns: ch.pronouns, appearance: ch.appearance },
  }).catch(e => e);
  expect(error).toBeInstanceOf(PhotoGenerationFailure);
  expect(error.diagnostics).toMatchObject({ failureReason: "spicy_prompt_too_long", failureStage: "preflight", retryEligible: false,
    promptBudget: { compression: "failed", valid: false } });
  expect(generate).not.toHaveBeenCalled();
  expect(JSON.stringify(error.diagnostics)).not.toContain("Unique necessary scene fact");
});
