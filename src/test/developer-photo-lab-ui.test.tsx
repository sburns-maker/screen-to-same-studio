import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PHOTO_LAB_TYPES, PHOTO_LAB_PRESETS, type PhotoLabResult } from "@/lib/developer-photo-lab";
const mocks = vi.hoisted(() => ({ command: vi.fn(), results: [] as PhotoLabResult[] }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/developer-photo-lab.functions", () => ({ developerPhotoLab: mocks.command }));
import { DeveloperPhotoLab } from "@/components/DeveloperPhotoLab";
beforeEach(() => {
  mocks.results = [];
  mocks.command.mockReset().mockImplementation(async ({ data }) => {
    if (data.action === "generate") {
      const result: PhotoLabResult = {
        id: "job",
        requestId: data.requestId,
        category: data.category,
        status: "ready",
        startedAt: new Date().toISOString(),
        recoverable: false,
        url: "https://private.test/test.png",
        reason: null,
        diagnostics: null,
      };
      mocks.results = [result];
      return { result, snapshot: null };
    }
    return {
      result: null,
      snapshot: {
        character: "Riley",
        types: PHOTO_LAB_TYPES.map((type) => ({
          type,
          label: PHOTO_LAB_PRESETS[type].label,
          supported: true,
        })),
        results: mocks.results,
      },
    };
  });
});
afterEach(cleanup);
it("has a separate button for each exact category and does not generate on opening", async () => {
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  const button = await screen.findByRole("button", {
    name: "Generate Mature romantic (non-explicit) test",
  });
  expect(screen.getAllByRole("button", { name: /^Generate/ })).toHaveLength(6);
  expect(mocks.command).toHaveBeenCalledTimes(1);
  fireEvent.click(button);
  await screen.findByAltText("Riley Mature romantic (non-explicit) developer test");
  expect(mocks.command).toHaveBeenCalledWith({
    data: expect.objectContaining({
      action: "generate",
      category: "mature_romantic",
      confirmation: "GENERATE DEVELOPER PHOTO TEST",
    }),
  });
});
it("keeps a network-uncertain request ID for explicit retry", async () => {
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  const button = await screen.findByRole("button", { name: "Generate Casual selfie test" });
  mocks.command.mockRejectedValueOnce(new Error("connection lost"));
  fireEvent.click(button);
  await screen.findByRole("alert");
  const first = mocks.command.mock.calls.find((c) => c[0].data.action === "generate")![0].data
    .requestId;
  fireEvent.click(screen.getByRole("button", { name: "Check test status / refresh preview" }));
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  await screen.findByAltText("Riley Casual selfie developer test");
  const requests = mocks.command.mock.calls.filter((c) => c[0].data.action === "generate");
  expect(requests[1]![0].data.requestId).toBe(first);
});
