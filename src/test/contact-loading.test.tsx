import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isPending: true,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  incoming: undefined as string | undefined,
  invalidate: vi.fn(),
  housing: vi.fn(),
  relationship: vi.fn(),
  voice: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ conversationId: "selected" }),
    useSearch: () => ({ incomingCallId: mocks.incoming }),
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
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
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
vi.mock("@/components/ContactRelationshipStory", () => ({
  ContactRelationshipStory: (props: unknown) => { mocks.relationship(props); return <section>Relationship card</section>; },
}));
vi.mock("@/components/ProfilePhotoPanel", () => ({ ProfilePhotoPanel: () => null }));
vi.mock("@/components/PhotoViewer", () => ({ PhotoViewer: () => null }));
vi.mock("@/lib/live-call-client", () => ({ createLiveCall: mocks.voice }));
vi.mock("@/lib/live-calls.functions", () => ({
  checkpointLiveCall: vi.fn(),
  endLiveCall: vi.fn(),
  liveCallHeartbeat: vi.fn(),
  liveCallStatus: vi.fn(),
  startLiveCall: vi.fn(),
}));
import { startLiveCall } from "@/lib/live-calls.functions";
import { Route as ProfileRoute } from "@/routes/_authenticated/profile.$conversationId";
import { Route as LiveRoute } from "@/routes/_authenticated/live-call.$conversationId";
// The router mock exposes the actual registered components without requiring a running router.
const Profile = (ProfileRoute as unknown as { component: React.ComponentType }).component;
const Live = (LiveRoute as unknown as { component: React.ComponentType }).component;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.incoming = undefined;
  mocks.voice.mockReset();
  vi.mocked(startLiveCall).mockReset();
  mocks.query.data = undefined;
  mocks.query.isPending = true;
  mocks.query.error = null;
});
it("does not render Tess or mount her housing while another profile loads", () => {
  const view = render(<Profile />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading contact");
  expect(screen.queryByText(/Tess/)).not.toBeInTheDocument();
  expect(mocks.housing).not.toHaveBeenCalled();
  expect(mocks.relationship).not.toHaveBeenCalled();
  expect(screen.getByText("Call history")).toHaveAttribute("href", "/calls?conversation=selected");
  mocks.query.data = { character: { key: "maya" } };
  mocks.query.isPending = false;
  view.rerender(<Profile />);
  expect(screen.getByRole("heading", { name: /Maya/ })).toBeInTheDocument();
  expect(mocks.housing).toHaveBeenCalledWith({ character: "maya", conversationId: "selected" });
  expect(mocks.relationship).toHaveBeenCalledWith({characterKey:"maya",characterName:"Maya",conversationId:"selected"});
  expect(screen.getByText("Relationship card")).toBeInTheDocument();
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

it("refreshes incoming history after failure and makes the next explicit call a callback, not a second answer", async () => {
  mocks.incoming = "offer";
  mocks.query.data = { character: "maya", enabled: true, voiceSet: true, maxSeconds: 300 };
  mocks.query.isPending = false;
  vi.mocked(startLiveCall).mockRejectedValue(new Error("provider failure"));
  mocks.voice.mockImplementation(
    (options: {
      connect: (sdp: string) => Promise<unknown>;
      onState: (s: string) => void;
      onError: (s: string) => void;
    }) => ({
      start: async () => {
        options.onState("dialing");
        try {
          await options.connect("test-sdp");
        } catch {
          options.onError("provider failure");
          options.onState("ended");
        }
      },
      hangUp: vi.fn(),
      release: vi.fn(),
      transcript: () => [],
    }),
  );
  render(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "Answer Maya" }));
  await screen.findByText("provider failure");
  expect(vi.mocked(startLiveCall).mock.calls[0]?.[0]).toMatchObject({
    data: { incomingCallId: "offer" },
  });
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["phone"] });
  fireEvent.click(screen.getByRole("button", { name: "Call Maya" }));
  await screen.findByText("provider failure");
  expect(vi.mocked(startLiveCall).mock.calls[1]?.[0]).toEqual({
    data: { conversationId: "selected", sdp: "test-sdp" },
  });
});
