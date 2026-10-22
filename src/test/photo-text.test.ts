// @vitest-environment node
// Paid visual-screen boundary is mocked here; dedicated identity tests exercise its HTTP contract.
vi.mock("@/lib/photo-identity-qc.server", () => ({ requireVisualScreen: () => {}, screenPhotoVisuals: async () => ({ status: "screen_passed", method: "fictional_visual_design", reason: "features_consistent" }) }));
import { afterEach, describe, expect, it, vi } from "vitest";
import { imageCapabilities, photoTextPrompt, validatePhotoText } from "@/lib/photo-text";
import { acceptsPhotoText, checkPhotoText } from "@/lib/photo-text-qc.server";
import { generateTessImage, lovableGatewayProvider } from "@/lib/tess-image.server";
const text = { exact: "Happy Birthday, Claire!", surface: "a small paper sign on the table" };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("photo lettering composition", () => {
  it("keeps books, signs, clothing and packaging free of incidental pseudo-writing", () => {
    const prompt = photoTextPrompt(null);
    for (const phrase of [
      "page edges",
      "spines turned away",
      "plain unbranded clothing",
      "signs, menus, badges",
      "Natural optical softness",
    ])
      expect(prompt).toContain(phrase);
  });
  it("specifies exact sign spelling and physical integration without a flat overlay", () => {
    const prompt = photoTextPrompt(text);
    expect(prompt).toContain(JSON.stringify(text.exact));
    expect(prompt).toContain("perspective, curvature, texture, shadows");
    expect(prompt).toContain("No floating captions");
  });
  it.each(["Autumn Reads", "Return by Friday", "Soup £5"])(
    "supports short labels and signs: %s",
    (exact) => {
      expect(validatePhotoText({ ...text, exact })?.exact).toBe(exact);
    },
  );
  it("rejects long, multiline and hidden-control text before generation", () => {
    for (const exact of ["x".repeat(81), "line\nbreak", "hidden\u202eletters"])
      expect(() => validatePhotoText({ ...text, exact })).toThrow();
  });
  it("does not assume an unknown gateway supports masked edits or high quality", () => {
    expect(imageCapabilities("openai", "gpt-image-1-mini")).toMatchObject({
      highQuality: true,
      imageEditing: "supported",
      exactTextGuarantee: false,
    });
    expect(imageCapabilities("lovable-ai-gateway", "openai/gpt-image-2.5-sunburst")).toMatchObject({
      highQuality: false,
      maskedInpainting: "unverified",
      targetedRegeneration: false,
    });
  });
});
describe("bounded probabilistic lettering screening", () => {
  it("requires exact transcription and rejects uncertainty or prominent garbling", () => {
    const verdict = { legible: true, transcription: text.exact, prominent_garbled_text: false };
    expect(acceptsPhotoText(verdict, text)).toBe(true);
    for (const changed of [
      { legible: false },
      { transcription: "Happy Birthdav, Claire!" },
      { prominent_garbled_text: true },
    ])
      expect(acceptsPhotoText({ ...verdict, ...changed }, text)).toBe(false);
    expect(
      acceptsPhotoText({ legible: false, transcription: "", prominent_garbled_text: false }, null),
    ).toBe(true);
    expect(acceptsPhotoText({}, text)).toBe(false);
  });
  it("does not bill vision for ordinary no-text photos by default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("IMAGE_TEXT_QC_ALL", "");
    expect(await checkPhotoText(new Uint8Array(), "image/png", null)).toEqual({
      status: "not_checked",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed for required lettering without a verifier", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(checkPhotoText(new Uint8Array(), "image/png", text)).rejects.toThrow(
      "unavailable",
    );
  });
  it("rejects an unreadable result after one vision call and never regenerates", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("IMAGE_TEXT_QC", "true");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  legible: false,
                  transcription: "garbled",
                  prominent_garbled_text: true,
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const generate = vi
      .fn()
      .mockResolvedValue({
        bytes: new Uint8Array([1]),
        mime: "image/png",
        provider: "test",
        model: "test",
      });
    await expect(
      generateTessImage({
        provider: { name: "test", model: "test", referenceConditioning: true, generate },
          type: "object",
        scene: "a birthday sign",
        expression: null,
        text,
      }),
    ).rejects.toThrow("Photo generation or visual screening failed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetch.mock.calls[0]![1])).not.toContain(text.exact); // Independent transcription, no answer supplied.
  });
  it("can screen all photos for prominent garbling when explicitly enabled", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("IMAGE_TEXT_QC_ALL", "true");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    legible: false,
                    transcription: "",
                    prominent_garbled_text: true,
                  }),
                },
              },
            ],
          }),
        ),
    );
    await expect(checkPhotoText(new Uint8Array([1]), "image/png", null)).rejects.toThrow(
      "screening",
    );
  });
  it("preserves Claire's identity reference and natural library composition", async () => {
    vi.stubEnv("IMAGE_TEXT_QC_ALL", "");
    vi.stubEnv("IMAGE_TEXT_QC", "false");
    const { canonicalProfile } = await import("@/lib/canonical-profile.server");
    const reference = (await canonicalProfile("claire")).blob;
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
      type: "casual_selfie",
      scene: "Claire with her autumn book display in the school library",
      expression: "quietly pleased",
      identity: {
        key: "claire",
        name: "Claire",
        age: 38,
        pronouns: "she/her",
        appearance: "established canonical appearance",
      },
    });
    expect(generate.mock.calls[0]![0]).toContain("same recognizable fictional woman");
    expect(generate.mock.calls[0]![0]).toContain("spines turned away");
    expect(new Uint8Array(await generate.mock.calls[0]![1][0].arrayBuffer())).toEqual(new Uint8Array(await reference.arrayBuffer()));
    expect(result.identityReferenceUsed).toBe("claire");
    expect(result.textQuality.status).toBe("not_checked");
  });
  it("enables high quality only for a supported direct provider on request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ data: [{ b64_json: btoa("test") }] }));
    vi.stubGlobal("fetch", fetch);
    await lovableGatewayProvider("").generate("a sign", [], { highQuality: true });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).quality).toBe("high");
    vi.stubEnv("OPENAI_API_KEY", "");
    await lovableGatewayProvider("test-gateway").generate("a sign", [], { highQuality: true });
    expect(JSON.parse(fetch.mock.calls[1]![1].body).quality).toBe("medium");
  });
  it("checks library compositions automatically with at most one vision request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("IMAGE_TEXT_QC", "true");
    vi.stubEnv("IMAGE_TEXT_QC_ALL", "");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  legible: false,
                  transcription: "",
                  prominent_garbled_text: false,
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      await checkPhotoText(
        new Uint8Array([1]),
        "image/png",
        null,
        "Claire's autumn book display in the library",
      ),
    ).toEqual({ status: "screen_passed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects unavailable required-text verification before buying an image", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const generate = vi.fn();
    await expect(
      generateTessImage({
        provider: { name: "test", model: "test", referenceConditioning: true, generate },
          type: "object",
        scene: "a sign",
        expression: null,
        text,
      }),
    ).rejects.toThrow("Photo generation or visual screening failed");
    expect(generate).not.toHaveBeenCalled();
  });
  it("handles malformed and unavailable quality responses without retries", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("IMAGE_TEXT_QC", "true");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ choices: [] }))
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(checkPhotoText(new Uint8Array([1]), "image/png", text)).rejects.toThrow(
      "screening",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(checkPhotoText(new Uint8Array([1]), "image/png", text)).rejects.toThrow(
      "unavailable",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
