// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { screenPhotoVisuals, visualScreenAccepted } from "@/lib/photo-identity-qc.server";
import { generateTessImage, fictionalGroupScene, mentionsOtherEstablishedCharacter, lovableGatewayProvider } from "@/lib/tess-image.server";
import { characterFor } from "@/lib/characters";
import { PROFILE_PORTRAITS } from "@/lib/character-portraits";
vi.mock("@/lib/photo-text-qc.server", () => ({
  textVerificationAvailable: () => true,
  checkPhotoText: async () => ({ status: "not_checked" }),
}));
const good = {
  reference_usable: true,
  visual_design: "consistent",
  scene_consistent: true,
  unexpected_people: false,
  reason: "features_consistent",
};
function vision(value: unknown = good) {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const fetch = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const candidate = new Blob(["test image"], { type: "image/png" });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("bounded visual-design and scene screening", () => {
  it("supplies actual reference and candidate pixels without names or biometric scores", async () => {
    const fetch = vision();
    expect(
      await screenPhotoVisuals(
        new Blob(["reference"], { type: "image/jpeg" }),
        candidate,
        "venue selfie",
      ),
    ).toMatchObject({ status: "screen_passed" });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(
      body.messages[1].content.filter((c: { type: string }) => c.type === "image_url"),
    ).toHaveLength(2);
    expect(JSON.stringify(body)).toContain(btoa("reference"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body.max_tokens).toBe(250);
  });
  it.each([
    { visual_design: "mismatch", reason: "face_structure_drift" },
    { visual_design: "uncertain", reason: "uncertain" },
    { reference_usable: false, reason: "reference_obscured" },
    { visual_design: "uncertain", reason: "face_not_visible" },
  ])("withholds failed/uncertain designs without retry: %j", async (change) => {
    const fetch = vision({ ...good, ...change });
    await expect(
      screenPhotoVisuals(new Blob(["reference"]), candidate, "clinic selfie"),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("never withholds a photo for a scene mismatch alone", async () => {
    vision({ ...good, scene_consistent: false, reason: "scene_mismatch" });
    await expect(
      screenPhotoVisuals(new Blob(["reference"]), candidate, "clinic selfie"),
    ).resolves.toMatchObject({ status: "screen_passed" });
  });
  it("checks object scenes rather than requiring a face", async () => {
    const fetch = vision({ ...good, visual_design: "not_applicable" });
    await expect(screenPhotoVisuals(null, candidate, "a puppy playing")).resolves.toMatchObject({
      reason: "scene_consistent",
    });
    expect(
      JSON.parse(fetch.mock.calls[0]![1].body).messages[1].content.filter(
        (c: { type: string }) => c.type === "image_url",
      ),
    ).toHaveLength(1);
    expect(
      visualScreenAccepted(
        { ...good, visual_design: "not_applicable", unexpected_people: true },
        false,
      ),
    ).toBe(false);
  });
  it("sanitizes upstream failures and never logs provider response text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private upstream details", { status: 403 })),
    );
    await expect(screenPhotoVisuals(null, candidate, "garden")).rejects.toThrow(
      "visual_screen_unavailable",
    );
  });
});
describe("image model selection", () => {
  it("defaults OpenAI reference-conditioned images to Sunburst", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("OPENAI_IMAGE_MODEL", "");
    expect(lovableGatewayProvider("unused").model).toBe("gpt-image-2.5-sunburst");
    expect(lovableGatewayProvider("unused").referenceConditioning).toBe(true);
  });
  it("permits a deliberate model override without arbitrary model injection", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-2.5-flare");
    expect(lovableGatewayProvider("unused").model).toBe("gpt-image-2.5-flare");
    vi.stubEnv("OPENAI_IMAGE_MODEL", "unknown-model");
    expect(lovableGatewayProvider("unused").model).toBe("gpt-image-2.5-sunburst");
  });
});
describe("every shared generation path anchors original portraits", () => {
  it.each([
    ["maya", "casual_selfie", "Maya at her event venue"],
    ["maya", "casual_selfie", "Maya outdoors in a different jacket"],
    ["tess", "casual_selfie", "Tess on a quiet veterinary clinic break"],
    ["tess", "object", "a foster puppy, no person visible"],
    ["claire", "casual_selfie", "Claire beside a library display"],
    ["claire", "object", "a quiet garden, no person visible"],
    ["jordan", "casual_selfie", "Jordan's casual outdoor selfie"],
    ["ben", "casual_selfie", "Ben near his parked work truck"],
  ] as const)("%s %s: %s", async (key, type, scene) => {
    const fetch = vision({
      ...good,
      visual_design: type === "object" ? "not_applicable" : "consistent",
    });
    const generate = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
      provider: "test",
      model: "test-image",
    });
    const def = characterFor(key);
    const result = await generateTessImage({
      provider: { name: "test", model: "test-image", referenceConditioning: true, generate },
      type,
      scene,
      expression: null,
      identity: {
        key,
        name: def.fullName,
        age: def.age,
        pronouns: def.pronouns,
        appearance: "THIS DESCRIPTION MUST NOT REDEFINE THE FACE",
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    const references = generate.mock.calls[0]![1] as Blob[];
    if (type !== "object") {
      expect(new Uint8Array(await references[0]!.arrayBuffer())).toEqual(
        new Uint8Array(readFileSync(PROFILE_PORTRAITS[key].asset)),
      );
      expect(result.diagnostics.canonicalAsset).toBe(PROFILE_PORTRAITS[key].asset);
    } else expect(references).toHaveLength(0);
    expect(generate.mock.calls[0]![0]).not.toContain("THIS DESCRIPTION MUST NOT REDEFINE THE FACE");
    expect(result.diagnostics.validationStatus).toBe("screen_passed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses an explicitly approved replacement as actual provider and screening pixels", async () => {
    vision();
    const original = await (
      await import("@/lib/canonical-profile.server")
    ).canonicalProfile("maya");
    const approved = {
      ...original,
      blob: new Blob(["approved reference pixels"], { type: "image/jpeg" }),
      asset: "owner/profile/maya/approved.jpg",
      sha256: "approved-hash",
    };
    const generate = vi
      .fn()
      .mockResolvedValue({
        bytes: new Uint8Array([1]),
        mime: "image/png",
        provider: "test",
        model: "test",
      });
    const result = await generateTessImage({
      provider: { name: "test", model: "test", referenceConditioning: true, generate },
      canonical: approved,
      type: "casual_selfie",
      scene: "quiet venue",
      expression: null,
      identity: { key: "maya", name: "Maya", age: 29, pronouns: "she/her", appearance: "" },
    });
    expect(await (generate.mock.calls[0]![1][0] as Blob).text()).toBe("approved reference pixels");
    expect(result.diagnostics.canonicalSha256).toBe("approved-hash");
  });
  it("cannot turn a generated photograph or caller-supplied blob into the anchor", async () => {
    vision();
    const generate = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1]),
      mime: "image/png",
      provider: "test",
      model: "test",
    });
    for (let n = 0; n < 2; n++)
      await generateTessImage({
        provider: { name: "test", model: "test", referenceConditioning: true, generate },
        type: "casual_selfie",
        scene: `venue angle ${n}`,
        expression: null,
        identity: { key: "maya", name: "Maya", age: 31, pronouns: "she/her", appearance: "" },
        ...{ tessReference: new Blob(["wrong face"]) },
      });
    expect(new Uint8Array(await generate.mock.calls[0]![1][0].arrayBuffer())).toEqual(
      new Uint8Array(await generate.mock.calls[1]![1][0].arrayBuffer()),
    );
    expect(new Uint8Array(await generate.mock.calls[0]![1][0].arrayBuffer())).toEqual(
      new Uint8Array(readFileSync(PROFILE_PORTRAITS.maya.asset)),
    );
  });
  it("does not buy an image for an unknown character, unavailable screen or unverified conditioning provider", async () => {
    const generate = vi.fn();
    const identity = { key: "maya", name: "Maya", age: 31, pronouns: "she/her", appearance: "" };
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    await expect(
      generateTessImage({
        provider: { name: "unknown", model: "unknown", generate },
        type: "casual_selfie",
        scene: "venue",
        expression: null,
        identity,
      }),
    ).rejects.toMatchObject({
      diagnostics: { failureReason: "reference_conditioning_unverified" },
    });
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      generateTessImage({
        provider: { name: "test", model: "test", referenceConditioning: true, generate },
        type: "casual_selfie",
        scene: "venue",
        expression: null,
        identity,
      }),
    ).rejects.toMatchObject({ diagnostics: { failureReason: "visual_screen_unavailable" } });
    expect(generate).not.toHaveBeenCalled();
    expect(lovableGatewayProvider("gateway").referenceConditioning).toBe(false);
  });
  it("withholds a repeatedly mismatched generation after one identity-aware retry", async () => {
    vision({ ...good, visual_design: "mismatch", reason: "face_structure_drift" });
    const generate = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1]),
      mime: "image/png",
      provider: "test",
      model: "test",
    });
    await expect(
      generateTessImage({
        provider: { name: "test", model: "test", referenceConditioning: true, generate },
        type: "casual_selfie",
        scene: "venue",
        expression: null,
        identity: { key: "maya", name: "Maya", age: 31, pronouns: "she/her", appearance: "" },
      }),
    ).rejects.toMatchObject({
      diagnostics: {
        validationStatus: "failed",
        failureReason: "face_structure_drift",
        retryCount: 1,
        retryReasons: ["face_structure_drift", "face_structure_drift"],
        canonicalAsset: PROFILE_PORTRAITS.maya.asset,
      },
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("recovers an appearance-drift selfie once using the same original anchor", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const verdicts = [
      { ...good, visual_design: "mismatch", reason: "appearance_drift" },
      good,
    ];
    let index = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      Response.json({ choices: [{ message: { content: JSON.stringify(verdicts[index++] ?? good) } }] })));
    const generate = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]), mime: "image/png", provider: "test", model: "test",
    });
    const result = await generateTessImage({
      provider: { name: "test", model: "test", referenceConditioning: true, generate },
      type: "casual_selfie", scene: "deadpan selfie with messy bun", expression: "deadpan",
      identity: { key: "tess", name: "Tess", age: 34, pronouns: "she/her", appearance: "" },
    });
    expect(result.diagnostics.retryCount).toBe(1);
    expect(result.diagnostics.retryReasons).toEqual(["appearance_drift"]);
    expect(result.diagnostics.validationStatus).toBe("screen_passed");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0]).toContain("IDENTITY CONTINUITY CORRECTION");
    expect(await (generate.mock.calls[0]![1][0] as Blob).arrayBuffer())
      .toEqual(await (generate.mock.calls[1]![1][0] as Blob).arrayBuffer());
  });
  it("accepts a trivia-team photo with anchored Tess and incidental fictional adults", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: JSON.stringify({ ...good, unexpected_people: true }) } }],
    })));
    const generate = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), mime: "image/png", provider: "test", model: "test" });
    const scene = "Group photo of Tess with her trivia team at the bar after a round";
    expect(fictionalGroupScene(scene)).toBe(true);
    expect(mentionsOtherEstablishedCharacter(scene, "tess")).toBe(false);
    const result = await generateTessImage({
      provider: { name: "test", model: "test", referenceConditioning: true, generate },
      type: "casual_selfie", scene, expression: "amused",
      identity: { key: "tess", name: "Tess", age: 34, pronouns: "she/her", appearance: "" },
    });
    expect(result.diagnostics.validationStatus).toBe("screen_passed");
    expect(generate.mock.calls[0]![0]).toContain("FICTIONAL GROUP MOMENT");
  });
  it("rejects unsupported shared-event group portraits before buying an image", async () => {
    vision();
    const generate = vi.fn();
    await expect(
      generateTessImage({
        provider: { name: "test", model: "test", referenceConditioning: true, generate },
        type: "casual_selfie",
        scene: "a group selfie of Ben and Claire at the gathering",
        expression: null,
        identity: { key: "ben", name: "Ben", age: 36, pronouns: "he/him", appearance: "" },
      }),
    ).rejects.toMatchObject({ diagnostics: { failureReason: "unsupported_group_photo" } });
    expect(generate).not.toHaveBeenCalled();
  });
});

it("withholds SpicyAPI identity drift without buying an automatic second image",async()=>{
 vision({...good,visual_design:"mismatch",reason:"face_structure_drift"});
 const generate=vi.fn().mockResolvedValue({bytes:new Uint8Array([1]),mime:"image/png",provider:"spicyapi",model:"bytedance/seedream-5.0-flash/edit"});
 await expect(generateTessImage({provider:{name:"spicyapi",model:"bytedance/seedream-5.0-flash/edit",referenceConditioning:true,allowIdentityRetry:false,generate},type:"mature_romantic",scene:"At home in opaque non-nude evening clothing",expression:null,identity:{key:"maya",name:"Maya",age:31,pronouns:"she/her",appearance:""}})).rejects.toMatchObject({diagnostics:{failureReason:"face_structure_drift",retryCount:0}});
 expect(generate).toHaveBeenCalledTimes(1);expect(generate.mock.calls[0]![0].length).toBeLessThanOrEqual(12000);
});
