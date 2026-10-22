import { describe, it, expect, vi, afterEach } from "vitest";
import { conversationMedia, mediaFilename, mediaFile, downloadMedia } from "@/lib/media";
afterEach(() => vi.unstubAllGlobals());
const at = "2026-10-22T16:00:00Z";
const m = (id: string, metadata: unknown) => ({
  id,
  metadata,
  visible_at: at,
  created_at: at,
  sender: "tess",
});
describe("original conversation media", () => {
  it("includes received and sent originals and videos while hiding future attachments", () => {
    const rows = [
      m("generated", { generated_path: "owner/full.png" }),
      { ...m("sent", { user_photo: "owner/user/full.jpg" }), sender: "user" },
      m("video", {
        user_video: {
          path: "10000000-0000-4000-a000-000000000001/20000000-0000-4000-a000-000000000001.mp4",
          mime: "video/mp4",
          bytes: 4000,
          duration_seconds: 10,
        },
      }),
      {
        ...m("future", { generated_path: "owner/pending.png" }),
        visible_at: "2030-01-01T00:00:00Z",
      },
    ];
    expect(conversationMedia(rows, Date.parse(at))).toMatchObject([
      { id: "generated", path: "owner/full.png" },
      { id: "sent", path: "owner/user/full.jpg" },
      { id: "video", kind: "video", mime: "video/mp4" },
    ]);
  });
  it("uses original MIME and a safe filename, never private query strings", () => {
    expect(mediaFilename({ id: "../../image?token=secret", kind: "image" }, "image/png")).toBe(
      "shared-imagetokensecret.png",
    );
    expect(mediaFilename({ id: "clip", kind: "video" }, "video/mp4")).toBe("shared-clip.mp4");
    expect(() => mediaFilename({ id: "x", kind: "image" }, "text/html")).toThrow();
  });
  it("renews the owner-authorized original URL before each file action", async () => {
    const resolve = vi.fn().mockResolvedValue("https://private.test/original?short-lived");
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["original pixels"], { type: "image/png" }),
    });
    vi.stubGlobal("fetch", fetch);
    const file = await mediaFile({ id: "photo", kind: "image" }, resolve);
    expect(resolve).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toContain("/original");
    expect(file.name).toBe("shared-photo.png");
    expect(file.size).toBe(15);
  });
  it("does not save error pages as photos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(mediaFile({ id: "x", kind: "image" }, async () => "/expired")).rejects.toThrow(
      "unavailable",
    );
  });
  it("starts a standard download without granting public media access", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const create = vi.fn().mockReturnValue("blob:private");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    expect(await downloadMedia(new File(["bytes"], "photo.jpg", { type: "image/jpeg" }))).toContain(
      "Download started",
    );
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });
});
