import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PhotoViewer } from "@/components/PhotoViewer";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("mobile photo viewer", () => {
  it("opens the full image and returns to the same conversation without changing attachments", () => {
    render(
      <PhotoViewer src="/existing.jpg" alt="Photo from Tess">
        <img src="/existing.jpg" alt="Thumbnail" />
      </PhotoViewer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Photo from Tess" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo from Tess" })).toHaveAttribute(
      "src",
      "/existing.jpg",
    );
    expect(screen.getByRole("button", { name: "Save / share photo" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save / share photo" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0]![0].files[0]).toBeInstanceOf(File);
    expect(share.mock.calls[0]![0].url).toBeUndefined();
  });
});
