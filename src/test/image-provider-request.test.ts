import { afterEach, describe, expect, it, vi } from "vitest";
import { lovableGatewayProvider } from "@/lib/tess-image.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("image provider request compatibility", () => {
  it("uses OpenAI's image[] form for multiple ordered identity references", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-openai");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ b64_json: btoa("png") }] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = lovableGatewayProvider("");
    const result = await provider.generate("preserve both canonical identities", [
      new Blob(["person"]),
      new Blob(["dog"]),
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(init.body.getAll("image[]")).toHaveLength(2);
    expect(init.body.getAll("image[]")[0].name).toBe("tess-reference.jpg");
    expect(init.body.getAll("image[]")[1].name).toBe("mabel-reference-1.jpg");
    expect(init.signal).toBeDefined();
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-image-1-mini");
  });
  it("retains the existing gateway fallback and records the provider accurately", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ b64_json: btoa("png") }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await lovableGatewayProvider("test-only-gateway").generate(
      "an ordinary object",
      [],
    );
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://ai.gateway.lovable.dev/v1/images/generations",
    );
    expect(result.provider).toBe("lovable-ai-gateway");
  });
});
