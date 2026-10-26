import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ diagnose: vi.fn(), ring: vi.fn(), refetch: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/live-calls.functions", () => ({ liveCallStatus: vi.fn() }));
vi.mock("@/lib/phone-calls.functions", () => ({
  diagnoseIncomingCalls: mocks.diagnose,
  testIncomingRing: mocks.ring,
  checkVoiceModelAccess: vi.fn(),
}));
vi.mock("@/lib/phone-queries", () => ({
  usePhone: () => ({
    data: { available: true, configured: true, calls: [] },
    refetch: mocks.refetch,
  }),
}));
import { CallsDebug } from "@/components/CallsDebug";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function open() {
  mocks.diagnose.mockResolvedValue({
    checkedAt: "2026-10-25T18:00Z",
    globalBlocks: ["Quiet hours active"],
    characters: [],
    worker: { lastCheckedAt: null, offered: false, failed: false, lookupFailed: false },
    serviceNote: "Both Practice and Real-Time contacts are eligible.",
    note: "No call was placed.",
  });
  render(<CallsDebug conversationId="20000000-0000-4000-a000-000000000001" />);
  fireEvent.click(screen.getByText("Refresh call eligibility (no AI cost)"));
  await screen.findByText("Global blockers: Quiet hours active");
}
describe("controlled developer call UI", () => {
  it("only diagnoses on explicit request and cancels test ringing without confirmation", async () => {
    await open();
    expect(mocks.ring).not.toHaveBeenCalled();
    expect(
      screen.getByText(/None recorded; verify the production world scheduler/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Both Practice and Real-Time contacts are eligible."),
    ).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText("Trigger one test incoming ring for this character"));
    expect(mocks.ring).not.toHaveBeenCalled();
  });
  it("disables duplicate clicks, uses a stable action ID after failure, and shows feedback", async () => {
    await open();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let fail!: (e: Error) => void;
    mocks.ring.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const button = screen.getByText("Trigger one test incoming ring for this character");
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.ring).toHaveBeenCalledTimes(1);
    fail(new Error("Connection uncertain; retry this action"));
    await screen.findByText("Connection uncertain; retry this action");
    const first = mocks.ring.mock.calls[0]![0];
    mocks.ring.mockResolvedValueOnce({ note: "Test ring recorded" });
    fireEvent.click(button);
    await screen.findByText("Test ring recorded");
    expect(mocks.ring.mock.calls[1]![0]).toEqual(first);
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  });
});
