import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/profile-media.functions", () => ({ saveProfileImage: mocks.save }));
vi.mock("@/lib/visual-profiles.functions", () => ({ profilePhotoChoices: mocks.load }));
import { ProfileImageEditor } from "@/components/ProfileImageEditor";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("keeps canonical replacement opt-in and requires a second explicit identity approval", async () => {
  mocks.load.mockResolvedValue({ canonicalUrl: "/approved-identity.jpg" });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,/9j/2Q==",
  );
  mocks.save.mockResolvedValue({ updated: true });
  const close = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProfileImageEditor character="maya" source={async () => "/candidate.jpg"} onClose={close} />
    </QueryClientProvider>,
  );
  const preview = await screen.findByRole("img", { name: "Profile crop preview" });
  Object.defineProperty(preview, "naturalWidth", { configurable: true, value: 1200 });
  Object.defineProperty(preview, "naturalHeight", { configurable: true, value: 1600 });
  expect(screen.getByRole("button", { name: "Save display avatar only" })).toBeEnabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Also approve/ }));
  expect(
    screen.getByRole("button", { name: "Confirm avatar and canonical reference" }),
  ).toBeDisabled();
  expect(await screen.findByRole("img", { name: "Current approved reference" })).toHaveAttribute(
    "src",
    "/approved-identity.jpg",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /I visually compared/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm avatar and canonical reference" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      data: {
        key: "maya",
        avatar: "/9j/2Q==",
        reference: "/9j/2Q==",
        canonicalApproved: true,
        sourceMessageId: undefined,
      },
    }),
  );
});
