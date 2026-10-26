import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  preview: vi.fn(),
  change: vi.fn(),
  preference: vi.fn(),
  job: vi.fn(),
}));
vi.mock("@/lib/tess.functions", () => ({ updateSettings: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/photo-reference-library.functions", () => ({
  loadReferenceLibrary: mocks.load,
  previewReference: mocks.preview,
  changeReference: mocks.change,
  setReferenceProviderPreference: mocks.preference,
  checkApi18Job: mocks.job,
}));
import { ReferenceLibrary } from "@/components/ReferenceLibrary";
const hash = "a".repeat(64),
  mid = "20000000-0000-4000-a000-000000000001";
const fixture = () => ({
  provider: {
    ready: false,
    enabled: false,
    keyPresent: false,
    contractVerified: false,
    reason: "Api18 disabled",
  },
  page: {
    available: true,
    character: "tess",
    conversationId: mid,
    hash,
    version: 0,
    lastAction: "20000000-0000-4000-a000-000000000002",
    slots: [],
    rejected: [],
    candidates: [
      { id: null, source: "canonical", asset: "bundled", rejected: false },
      { id: mid, source: "delivered_generated", asset: "owner/photo.png", rejected: false },
    ],
    nextOffset: null,
    approved: 0,
    status: "Awaiting visual review",
    matureEnabled: false,
    api18Enabled: false,
    adultConfirmed: false,
    romanticCapable: true,
  },
});
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(fixture());
  mocks.preview
    .mockReset()
    .mockResolvedValue({ image: "data:image/jpeg;base64,/9j/", sha256: hash });
  mocks.change.mockReset().mockResolvedValue({ saved: true });
  mocks.preference.mockReset();
});
afterEach(() => cleanup());
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReferenceLibrary />
    </QueryClientProvider>,
  );
}
describe("mobile reference review interface", () => {
  it("lists the six characters, has no client key field and makes no review or generation request on load", async () => {
    mount();
    await screen.findByText("Awaiting visual review");
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.queryByLabelText(/api.*key/i)).not.toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Use Api18/)).toBeDisabled();
  });
  it("requires preview and explicit visual confirmation before approval", async () => {
    mount();
    await screen.findByText("Awaiting visual review");
    fireEvent.click(screen.getByText("Preview received photo"));
    await screen.findByAltText("Tess reference preview");
    expect(screen.getByText("Approve reference")).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I reviewed the clear/));
    fireEvent.click(screen.getByText("Approve reference"));
    await screen.findByText("Review saved.");
    expect(mocks.change.mock.calls[0]![0].data).toMatchObject({
      character: "tess",
      action: "approve",
      role: "half_body",
      message: mid,
      reviewedSha: hash,
      visualConfirmed: true,
    });
  });
  it("supports rejection and undo through persistent actions", async () => {
    mount();
    await screen.findByText("Awaiting visual review");
    fireEvent.click(screen.getByText("Preview received photo"));
    await screen.findByAltText("Tess reference preview");
    fireEvent.click(screen.getByText("Reject photo"));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
    await screen.findByText("Review saved.");
    fireEvent.click(screen.getByText("Undo last review"));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2));
    expect(mocks.change.mock.calls[1]![0].data.action).toBe("undo");
  });
  it("reports an installation requirement instead of claiming the library works without its migration", async () => {
    const f = fixture();
    f.page.available = false;
    f.page.status = "Migration 0047 required";
    mocks.load.mockResolvedValue(f);
    mount();
    await screen.findByText("Migration 0047 required");
    expect(screen.getByText("View canonical portrait")).toBeDisabled();
  });
});

it("can check a known provider job without generating or changing reviews", async () => {
  mocks.load.mockResolvedValue({
    ...fixture(),
    jobs: [
      {
        action_id: mid,
        status: "processing",
        job_id: "job_one",
        cost_usd: null,
        refund_expected: false,
        failure_code: null,
        created_at: "2026-10-26",
        updated_at: "2026-10-26",
      },
    ],
  });
  mocks.job.mockResolvedValue({ status: "completed", costUsd: 0.1 });
  mount();
  await screen.findByText("Recent Api18 jobs");
  fireEvent.click(screen.getByText("Refresh status — no generation"));
  await waitFor(() => expect(mocks.job).toHaveBeenCalledWith({ data: { actionId: mid } }));
  expect(mocks.change).not.toHaveBeenCalled();
  expect(mocks.preference).not.toHaveBeenCalled();
});
