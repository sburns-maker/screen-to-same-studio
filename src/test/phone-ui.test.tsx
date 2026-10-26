import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  act: vi.fn().mockResolvedValue({}),
  refetch: vi.fn(),
  call: { id: "call", direction: "incoming", state: "ringing", character_key: "tess" },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/phone-queries", () => ({
  usePhone: () => ({ data: { calls: [mocks.call] }, refetch: mocks.refetch }),
}));
vi.mock("@/lib/phone-calls.functions", () => ({ phoneAction: mocks.act }));
vi.mock("@/lib/use-portrait", () => ({ usePortraits: () => ({ data: {} }) }));
import { IncomingCall } from "@/components/IncomingCall";
afterEach(() => {
  cleanup();
  mocks.act.mockClear();
});
describe("foreground phone controls", () => {
  it("shows identity, display-only number and accessible answer/decline controls without requesting microphone", async () => {
    render(<IncomingCall />);
    expect(screen.getByText("Tess")).toBeInTheDocument();
    expect(screen.getByText(/684-2739/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Answer" })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).not.toMatch(/^(tel|sms):/i);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(mocks.act).toHaveBeenCalledWith({ data: { id: "call", command: "decline" } }),
    );
  });
  it("does not present an already missed call as incoming", () => {
    mocks.call.state = "missed";
    render(<IncomingCall />);
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
    mocks.call.state = "ringing";
  });
});
