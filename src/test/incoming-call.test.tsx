import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  action: vi.fn(),
  refetch: vi.fn(),
  calls: [] as unknown[],
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/phone-queries", () => ({
  usePhone: () => ({ data: { calls: mocks.calls }, refetch: mocks.refetch }),
}));
vi.mock("@/lib/phone-calls.functions", () => ({ phoneAction: mocks.action }));
vi.mock("@/lib/use-portrait", () => ({ usePortraits: () => ({ data: {} }) }));
vi.mock("@/lib/call-ringtone", () => ({ startRingtone: mocks.start, enableRingtone: vi.fn() }));
import { IncomingCall } from "@/components/IncomingCall";
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
  mocks.calls = [];
});
const offer = () => ({
  id: "call",
  character_key: "maya",
  conversation_id: "conversation",
  state: "ringing",
  direction: "incoming",
  ring_until: new Date(Date.now() + 20000).toISOString(),
});
it("rings an incoming offer and stops immediately on answer, before polling", async () => {
  mocks.calls = [offer()];
  mocks.start.mockResolvedValue(mocks.stop);
  render(<IncomingCall />);
  await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("Answer"));
  expect(screen.queryByLabelText("Incoming call")).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1));
});
it("shows a blocked-audio explanation and never implies a missed call rang audibly", async () => {
  mocks.calls = [offer()];
  mocks.start.mockRejectedValue(new Error("blocked"));
  const view = render(<IncomingCall />);
  expect(await screen.findByText(/Silent ring/)).toBeInTheDocument();
  mocks.calls = [{ ...offer(), state: "missed" }];
  view.rerender(<IncomingCall />);
  expect(screen.queryByLabelText("Incoming call")).not.toBeInTheDocument();
});

it("removes an expired ringing banner without waiting for the next server poll", async () => {
  vi.useFakeTimers();
  mocks.calls = [{ ...offer(), ring_until: new Date(Date.now() + 1000).toISOString() }];
  mocks.start.mockResolvedValue(mocks.stop);
  render(<IncomingCall />);
  expect(screen.getByLabelText("Incoming call")).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(1001);
  });
  expect(screen.queryByLabelText("Incoming call")).not.toBeInTheDocument();
});
