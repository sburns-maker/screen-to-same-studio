import { describe, it, expect, vi, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({ sign: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: mocks.from } } }));
import { resolveMedia } from "@/lib/media-url";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("private original URL renewal", () => {
  it("signs the original owner path again rather than reusing an expired URL", async () => {
    mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://new-private-link" }, error: null });
    expect(
      await resolveMedia({
        id: "x",
        kind: "image",
        bucket: "tess-photos",
        path: "owner/original.png",
      }),
    ).toBe("https://new-private-link");
    expect(mocks.from).toHaveBeenCalledWith("tess-photos");
    expect(mocks.sign).toHaveBeenCalledWith("owner/original.png", 600);
  });
  it("renews profile links only on the configured backend", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://backend.test");
    mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://fresh-profile" }, error: null });
    expect(
      await resolveMedia({
        id: "profile",
        kind: "image",
        src: "https://backend.test/storage/v1/object/sign/tess-photos/owner/profile/tess/a.jpg?token=expired",
      }),
    ).toBe("https://fresh-profile");
    expect(mocks.sign).toHaveBeenCalledWith("owner/profile/tess/a.jpg", 600);
    mocks.sign.mockClear();
    expect(
      await resolveMedia({
        id: "external",
        kind: "image",
        src: "https://other.test/storage/v1/object/sign/tess-photos/owner/a.jpg",
      }),
    ).toContain("other.test");
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("reports missing or unauthorized storage instead of making it public", async () => {
    mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
    mocks.sign.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(
      resolveMedia({
        id: "x",
        kind: "video",
        bucket: "user-videos",
        path: "someone-else/clip.mp4",
      }),
    ).rejects.toThrow("unavailable");
  });
});
