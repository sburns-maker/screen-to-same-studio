import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PHOTO_LAB_TYPES, PHOTO_LAB_PRESETS, type PhotoLabResult } from "@/lib/developer-photo-lab";
const mocks = vi.hoisted(() => ({ command: vi.fn(), connectivity: vi.fn(), batch: vi.fn(), results: [] as PhotoLabResult[] }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/photo-decision-batch.functions", () => ({ evaluatePhotoDecisionBatch: mocks.batch }));
vi.mock("@/lib/developer-photo-lab.functions", () => ({
  developerPhotoLab: mocks.command,
  checkDeveloperSpicyConnection: mocks.connectivity,
}));
import { DeveloperPhotoLab } from "@/components/DeveloperPhotoLab";
beforeEach(() => {
  mocks.results = [];
  mocks.batch.mockReset().mockResolvedValue({character:"riley",at:"2026-10-31T00:00:00Z",mode:"text_model_only_no_generation_no_delivery",repetitionsPerCategory:2,scenarios:[],limitations:"No images created."});
  mocks.connectivity.mockReset().mockResolvedValue({
    status: "transport_error", httpStatus: null, transportCode: "dns_retry",
  });
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
it("offers a free SpicyAPI connection check without making a generation call", async () => {
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  const button = await screen.findByRole("button", { name: "Check SpicyAPI connection (free)" });
  fireEvent.click(button);
  expect(await screen.findByText(/dns_retry/)).toBeTruthy();
  expect(mocks.connectivity).toHaveBeenCalledWith({ data: { conversationId: "riley-conversation" } });
  expect(mocks.command.mock.calls.every((c) => c[0].data.action !== "generate")).toBe(true);
});
it("shows which upstream is failing without generating a paid image", async () => {
  mocks.connectivity.mockResolvedValueOnce({
    status: "transport_error", httpStatus: null, transportCode: "fetch_failed",
    checks: {
      publicCatalog: { status: "transport_error", httpStatus: null, transportCode: "fetch_failed" },
      internet: { status: "reachable", httpStatus: 200, transportCode: null },
    },
  });
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  fireEvent.click(await screen.findByRole("button", { name: "Check SpicyAPI connection (free)" }));
  expect(await screen.findByText(/General internet access works/)).toBeTruthy();
  expect(screen.getByText(/Public SpicyAPI \(no key\)/)).toBeTruthy();
  expect(screen.getByText(/Neutral internet check/)).toBeTruthy();
  expect(mocks.command.mock.calls.every((c) => c[0].data.action !== "generate")).toBe(true);
});
it("has a separate button for each exact category and does not generate on opening", async () => {
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  const button = await screen.findByRole("button", {
    name: "Generate Mature romantic (non-explicit) test",
  });
  expect(screen.getAllByRole("button", { name: /^Generate/ })).toHaveLength(PHOTO_LAB_TYPES.length);
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

it("offers a suggestive test with a private custom scene without messaging the character", async () => {
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  const testButton = await screen.findByRole("button", {
    name: "Generate Suggestive (non-explicit) test",
  });
  fireEvent.change(screen.getByLabelText("suggestive custom scene 1"), {
    target: { value: "Confident adult at home, warm lighting, playful eye contact and a realistic phone photo" },
  });
  fireEvent.click(testButton);
  await screen.findByAltText("Riley Suggestive (non-explicit) developer test");
  expect(mocks.command).toHaveBeenCalledWith({
    data: expect.objectContaining({
      action: "generate",
      category: "suggestive",
      customScene: "Confident adult at home, warm lighting, playful eye contact and a realistic phone photo",
    }),
  });
});

it("runs the GPT photo-choice batch separately from image generation", async () => {
  render(<DeveloperPhotoLab conversationId="riley-conversation" />);
  fireEvent.click(await screen.findByRole("button", { name: "Run photo-choice batch (no images)" }));
  await waitFor(() => expect(mocks.batch).toHaveBeenCalledWith({data:{conversationId:"riley-conversation",repetitions:2}}));
  expect(mocks.command.mock.calls.every((c) => c[0].data.action !== "generate")).toBe(true);
  expect(await screen.findByText(/Text-model decisions only/)).toBeTruthy();
});
