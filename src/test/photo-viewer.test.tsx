vi.mock("@/lib/profile-media.functions", () => ({ saveProfileImage: vi.fn() }));
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MediaContext } from "@/lib/media-context";
import { PhotoViewer } from "@/components/PhotoViewer";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("mobile photo viewer", () => {
  it("opens the full image and returns to the same conversation without changing attachments", async () => {
    render(
      <PhotoViewer src="/existing.jpg" alt="Photo from Tess">
        <img src="/existing.jpg" alt="Thumbnail" />
      </PhotoViewer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Photo from Tess" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Photo from Tess" })).toHaveAttribute(
        "src",
        "/existing.jpg",
      ),
    );
    expect(screen.getByRole("button", { name: "Share media" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close photo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("img", { name: "Thumbnail" })).toBeInTheDocument();
  });
  it("uses native file sharing when the phone supports it, without passing a private signed URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["test"], { type: "image/jpeg" }),
      }),
    );
    render(
      <PhotoViewer src="https://storage.test/private?token=short" alt="Shared photo">
        <img src="/thumb" alt="Thumbnail" />
      </PhotoViewer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Shared photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Share media" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0]![0].files[0]).toBeInstanceOf(File);
    expect(share.mock.calls[0]![0].url).toBeUndefined();
  });
  it("navigates only the supplied conversation media and Android Back closes without replacing history", async () => {
    const items = [
      { id: "a", kind: "image" as const, src: "/original-a.png" },
      { id: "b", kind: "image" as const, src: "/original-b.png" },
    ];
    render(
      <MediaContext.Provider value={{ items }}>
        <PhotoViewer src="/thumb-a.png" mediaId="a" alt="Conversation media">
          <span>Thumbnail</span>
        </PhotoViewer>
      </MediaContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Conversation media" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Conversation media" })).toHaveAttribute(
        "src",
        "/original-a.png",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next media" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Conversation media" })).toHaveAttribute(
        "src",
        "/original-b.png",
      ),
    );
    expect(screen.getByRole("button", { name: "Next media" })).toBeDisabled();
    fireEvent.popState(window);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("opens videos with native playback controls", async () => {
    render(
      <PhotoViewer src="/original.mp4" kind="video" alt="Shared video">
        <span>Video thumbnail</span>
      </PhotoViewer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Shared video" }));
    await waitFor(() =>
      expect(document.querySelector("video")).toHaveAttribute("src", "/original.mp4"),
    );
    expect(document.querySelector("video")).toHaveAttribute("controls");
  });
  it("zooms on double tap and swipes only while unzoomed", async () => {
    // JSDOM lacks PointerEvent; use mouse coordinates for these synthetic pointer events.
    vi.stubGlobal("PointerEvent", MouseEvent);
    const items = [
      { id: "a", kind: "image" as const, src: "/a.png" },
      { id: "b", kind: "image" as const, src: "/b.png" },
    ];
    render(
      <MediaContext.Provider value={{ items }}>
        <PhotoViewer src="/a.png" mediaId="a" alt="Zoomable photo">
          <span>Thumbnail</span>
        </PhotoViewer>
      </MediaContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Zoomable photo" }));
    const img = await screen.findByRole("img", { name: "Zoomable photo" }),
      area = screen.getByLabelText("Media gesture area");
    for (let n = 0; n < 2; n++) {
      fireEvent.pointerDown(area, { clientX: 100, clientY: 100 });
      fireEvent.pointerUp(area, { clientX: 100, clientY: 100 });
    }
    expect(img.style.transform).toContain("scale(2.5)");
    fireEvent.pointerDown(area, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(area, { clientX: 50, clientY: 100 });
    fireEvent.pointerUp(area, { clientX: 50, clientY: 100 });
    expect(img).toHaveAttribute("src", "/a.png");
  });
  it("supports two-pointer pinch zoom without navigating to another photo", async () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    render(
      <PhotoViewer src="/pinch-original.png" alt="Pinch photo">
        <span>Thumbnail</span>
      </PhotoViewer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Pinch photo" }));
    const img = await screen.findByRole("img", { name: "Pinch photo" }),
      area = screen.getByLabelText("Media gesture area");
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(area, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 300, clientY: 100 });
    expect(img.style.transform).toContain("scale(2)");
    fireEvent.pointerUp(area, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(area, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(img).toHaveAttribute("src", "/pinch-original.png");
  });
});
