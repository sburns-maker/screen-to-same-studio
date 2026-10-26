import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ load: vi.fn(), query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/phone-calls.functions", () => ({ loadVoiceHistory: mocks.load }));
import { VoiceSessionHistory } from "@/components/VoiceSessionHistory";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("passes the selected conversation and displays recorded sessions without inventing duration or direction", async () => {
  mocks.query.mockReturnValue({
    data: [
      {
        id: "session",
        character_key: "maya",
        state: "closed",
        created_at: "2026-10-26T14:00:00Z",
        usage_seconds: null,
      },
    ],
  });
  render(<VoiceSessionHistory conversation="chosen" />);
  expect(screen.getByText("Maya")).toBeInTheDocument();
  expect(screen.getByText("Voice session ended")).toBeInTheDocument();
  expect(screen.queryByText(/Reported usage/)).not.toBeInTheDocument();
  await mocks.query.mock.calls[0]![0].queryFn();
  expect(mocks.load).toHaveBeenCalledWith({ data: { conversation: "chosen" } });
});
it("shows history errors instead of claiming no calls", () => {
  mocks.query.mockReturnValue({ error: new Error("unavailable") });
  render(<VoiceSessionHistory />);
  expect(screen.getByRole("alert")).toHaveTextContent("Voice session history unavailable");
  expect(screen.queryByText("No voice sessions recorded.")).not.toBeInTheDocument();
});
