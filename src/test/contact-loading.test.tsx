import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isPending: true,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  housing: vi.fn(),
  voice: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ conversationId: "selected" }),
    useSearch: () => ({}),
  }),
  Link: ({
    children,
    search,
  }: {
    children: React.ReactNode;
    search?: { conversation?: string };
  }) => <a href={`/calls?conversation=${search?.conversation ?? ""}`}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/use-portrait", () => ({ usePortraits: () => ({ data: {} }) }));
vi.mock("@/lib/tess-queries", () => ({ conversationQuery: vi.fn() }));
vi.mock("@/lib/tess.functions", () => ({ updateSettings: vi.fn() }));
vi.mock("@/components/HousingPanel", () => ({
  HousingPanel: (props: unknown) => {
    mocks.housing(props);
    return null;
  },
}));
vi.mock("@/components/ProfilePhotoPanel", () => ({ ProfilePhotoPanel: () => null }));
vi.mock("@/components/PhotoViewer", () => ({ PhotoViewer: () => null }));
vi.mock("@/lib/live-call-client", () => ({ createLiveCall: mocks.voice }));
vi.mock("@/lib/live-calls.functions", () => ({
  endLiveCall: vi.fn(),
  liveCallHeartbeat: vi.fn(),
  liveCallStatus: vi.fn(),
  startLiveCall: vi.fn(),
}));
import { Route as ProfileRoute } from "@/routes/_authenticated/profile.$conversationId";
import { Route as LiveRoute } from "@/routes/_authenticated/live-call.$conversationId";
// The router mock exposes the actual registered components without requiring a running router.
const Profile = (ProfileRoute as unknown as { component: React.ComponentType }).component;
const Live = (LiveRoute as unknown as { component: React.ComponentType }).component;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.query.data = undefined;
  mocks.query.isPending = true;
  mocks.query.error = null;
});
it("does not render Tess or mount her housing while another profile loads", () => {
  const view = render(<Profile />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading contact");
  expect(screen.queryByText(/Tess/)).not.toBeInTheDocument();
  expect(mocks.housing).not.toHaveBeenCalled();
  expect(screen.getByText("Call history")).toHaveAttribute("href", "/calls?conversation=selected");
  mocks.query.data = { character: { key: "maya" } };
  mocks.query.isPending = false;
  view.rerender(<Profile />);
  expect(screen.getByRole("heading", { name: /Maya/ })).toBeInTheDocument();
  expect(mocks.housing).toHaveBeenCalledWith({ character: "maya" });
});
it("keeps the live call neutral until the correct character is resolved and shows history", () => {
  const view = render(<Live />);
  expect(screen.queryByText("Tess")).not.toBeInTheDocument();
  expect(mocks.voice).not.toHaveBeenCalled();
  mocks.query.data = { character: "maya", enabled: true, voiceSet: true, maxSeconds: 300 };
  mocks.query.isPending = false;
  view.rerender(<Live />);
  expect(screen.getByRole("heading", { name: "Maya" })).toBeInTheDocument();
  expect(screen.getByText("Call history")).toHaveAttribute("href", "/calls?conversation=selected");
});
it("failed contact loading offers retry instead of falling back to Tess", () => {
  mocks.query.isPending = false;
  mocks.query.error = new Error("unavailable");
  render(<Live />);
  expect(screen.getByRole("alert")).toHaveTextContent("Contact unavailable");
  fireEvent.click(screen.getByText("Try again"));
  expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Tess")).not.toBeInTheDocument();
});
