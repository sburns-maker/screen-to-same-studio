vi.mock("@/lib/profile-media.functions", () => ({ saveProfileImage: vi.fn() }));
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ load: vi.fn(), choose: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/visual-profiles.functions", () => ({
  profilePhotoChoices: mocks.load,
  chooseProfilePhoto: mocks.choose,
}));
import { ProfilePhotoPanel } from "@/components/ProfilePhotoPanel";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("reviewed profile photo state", () => {
  it("loads the actual active choice and requires explicit approval without silently resetting to the original", async () => {
    const id = "10000000-0000-4000-a000-000000000001";
    mocks.load.mockResolvedValue({
      available: true,
      activeMessageId: id,
      activeReason: "A recent everyday portrait",
      canonical: { asset: "original", sha256: "hash" },
      choices: [{ id, url: "/candidate.jpg", at: "2026-10-22T16:00:00Z" }],
    });
    mocks.choose.mockResolvedValue({ updated: true });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProfilePhotoPanel character="tess" canonical="/original.jpg" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Current profile photo & identity" }));
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(2));
    expect(screen.getAllByRole("radio")[0]).not.toBeChecked();
    expect(screen.getAllByRole("radio")[1]).toBeChecked();
    expect(screen.getByRole("button", { name: "Approve current profile photo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Approve current profile photo" }));
    await waitFor(() =>
      expect(mocks.choose).toHaveBeenCalledWith({
        data: { key: "tess", messageId: id, reason: "A recent everyday portrait", approved: true },
      }),
    );
  });
});
