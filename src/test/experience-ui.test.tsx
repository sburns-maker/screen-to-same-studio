import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ExperienceFailure } from "@/lib/experience-failure";
const mocks = vi.hoisted(() => ({
  act: vi.fn().mockResolvedValue({}),
  read: vi.fn(),
  state: "interactive",
  moments: [] as Array<{ id: string; body: string; source: string }>,
  pending: null as null | {
    id: string;
    kind: string;
    body: string;
    status: string;
    failure?: ExperienceFailure;
  },
  available: true,
  historyScene: undefined as
    undefined | { id: string; plan_id: string; revision: number; state: string },
  refresh: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => ({
    ...config,
    useSearch: () => ({ plan: "plan" }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/components/ScreenHeader", () => ({
  Screen: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  ScreenHeader: () => null,
}));
vi.mock("@/lib/use-schedule", () => ({ invalidateSchedule: async () => {} }));
vi.mock("@/lib/use-experiences", () => ({
  useExperiences: () => ({
    refetch: mocks.refresh,
    data: {
      available: mocks.available,
      scenes: [
        {
          id: "e",
          plan_id: "plan",
          state: mocks.state,
          revision: 1,
          start_at: "2026-10-25T18:00:00Z",
          claim_deadline: "2026-10-25T22:00:00Z",
          mode: "interactive",
          summary: "",
          last_failure: null,
        },
      ],
      plans: [
        { id: "plan", title: "Coffee together", organizer: "maya", place_key: "coffee:local" },
      ],
    },
  }),
}));
vi.mock("@/lib/use-portrait", () => ({
  usePortraits: () => ({ data: { maya: "/maya-approved.jpg" } }),
}));
vi.mock("@/lib/living-experiences.functions", () => ({
  experienceAction: mocks.act,
  recoverExperienceOperation: mocks.act,
  experienceMoments: mocks.read,
}));
import { Route } from "@/routes/_authenticated/experiences";
beforeEach(() => {
  mocks.state = "interactive";
  mocks.moments = [];
  mocks.pending = null;
  mocks.available = true;
  mocks.historyScene = undefined;
  mocks.refresh.mockClear();
  mocks.act.mockClear();
  mocks.read.mockImplementation(async () => ({
    moments: mocks.moments,
    pending: mocks.pending,
    scene: mocks.historyScene,
  }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function view() {
  const Component = (Route as unknown as { component: () => ReactNode }).component;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Component />
    </QueryClientProvider>,
  );
}
describe("mobile experience controls", () => {
  it("offers free text, character portrait, pause and automatic finish", async () => {
    view();
    expect(screen.getByAltText("Maya")).toHaveAttribute("src", "/maya-approved.jpg");
    const input = await screen.findByRole("textbox", { name: "What you say or do" });
    fireEvent.change(input, { target: { value: "That was a lovely walk." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.act).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "turn",
          text: "That was a lovely walk.",
          revision: 1,
        }),
      }),
    );
    expect(screen.getByRole("button", { name: "Pause" })).toHaveClass("min-h-11");
  });
  it("uses the newer saved history revision instead of the slower outing list", async () => {
    mocks.historyScene = { id: "e", plan_id: "plan", revision: 8, state: "interactive" };
    view();
    const input = await screen.findByRole("textbox", { name: "What you say or do" });
    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    fireEvent.change(input, { target: { value: "Let's keep walking." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.act).toHaveBeenCalledWith({
        data: expect.objectContaining({ revision: 8, text: "Let's keep walking." }),
      }),
    );
  });
  it("refreshes a rejected action without losing the draft or replaying it", async () => {
    mocks.act.mockRejectedValueOnce(new Error("Your saved outing changed."));
    view();
    const input = await screen.findByRole("textbox", { name: "What you say or do" });
    fireEvent.change(input, { target: { value: "My unsaved contribution" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const refresh = await screen.findByRole("button", { name: "Refresh saved outing" });
    await waitFor(() => expect(refresh).not.toBeDisabled());
    fireEvent.click(refresh);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(input).toHaveValue("My unsaved contribution");
    expect(mocks.act).toHaveBeenCalledTimes(1);
  });
  it("paused ownership survives refresh and offers resume without text entry", async () => {
    mocks.state = "paused";
    mocks.moments = [{ id: "m", body: "An earlier real choice.", source: "user" }];
    view();
    expect(await screen.findByText("An earlier real choice.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume Experience" }));
    await waitFor(() =>
      expect(mocks.act).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: "resume" }),
      }),
    );
  });
  it("a failed contribution reuses the durable operation ID after refresh", async () => {
    mocks.pending = {
      id: "durable-operation",
      kind: "turn",
      body: "A real earlier contribution",
      status: "failed",
    };
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Retry pending scene" }));
    await waitFor(() =>
      expect(mocks.act).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "durable-operation",
          action: "turn",
          text: "A real earlier contribution",
        }),
      }),
    );
  });
  it("shows a saved failure cause and reference before the scene history after refresh", async () => {
    mocks.pending = {
      id: "saved-operation",
      kind: "turn",
      body: "A contribution",
      status: "failed",
      failure: { version: 1, phase: "generation", code: "model_unavailable" },
    };
    mocks.moments = [{ id: "m", body: "Earlier dialogue", source: "user" }];
    view();
    const diagnostic = await screen.findByText(/response service is temporarily unavailable/);
    expect(screen.getByText("Failure reference: saved-operation")).toBeInTheDocument();
    expect(
      diagnostic.compareDocumentPosition(screen.getByText("Earlier dialogue")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it("shows setup requirements rather than fake success when disabled", () => {
    mocks.available = false;
    view();
    expect(screen.getByText(/reviewed migrations 0025/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("claiming starts character dialogue automatically with a separate durable scene action", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T18:01Z"));
    mocks.state = "scheduled";
    mocks.act.mockResolvedValue({ experience: { revision: 1 } });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Experience this outing" }));
    await waitFor(() => expect(mocks.act).toHaveBeenCalledTimes(2));
    expect(mocks.act.mock.calls[1]![0].data).toEqual(
      expect.objectContaining({ action: "turn", text: "", revision: 1 }),
    );
    expect(mocks.act.mock.calls[0]![0].data.id).not.toBe(mocks.act.mock.calls[1]![0].data.id);
  });
});
