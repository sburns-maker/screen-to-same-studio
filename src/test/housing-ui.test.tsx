import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mock = vi.hoisted(() => ({
  change: vi.fn(),
  data: {
    available: true,
    adultConfirmed: true,
    primary: "home:user",
    homes: [
      {
        id: "home-id",
        key: "home:user",
        label: "My Home",
        community: "Altoona",
        housingType: "apartment",
        arrangement: "renting",
        description: "My fictional apartment",
        address: null,
        exact: false,
        canEdit: true,
        canVisit: true,
        canPlan: true,
        primaryFor: ["user"],
        provisional: true,
      },
    ],
    members: [],
    proposals: [] as {
      id: string;
      plan_id: string | null;
      residence_id: string;
      initiator: string;
      movers: string[];
      required: string[];
      responses: Record<string, string>;
      status: string;
      version: number;
      starts_at: string | null;
      ends_at: string | null;
      purpose: string;
      homeLabel: string;
      community: string;
      kind: string;
    }[],
    history: [],
  },
}));
vi.mock("@/lib/use-housing", () => ({
  useHousing: () => ({ data: mock.data, isLoading: false, error: null }),
}));
vi.mock("@/lib/use-schedule", () => ({
  useSchedule: () => ({ data: { contacts: [{ key: "tess", name: "Tess" }] } }),
  invalidateSchedule: vi.fn(),
}));
vi.mock("@/lib/housing.functions", () => ({ changeHousing: mock.change }));
vi.mock("@/components/ContactRelationshipStory", () => ({ ContactRelationshipStory: () => null }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#place">{children}</a>,
}));
import { HousingPanel } from "@/components/HousingPanel";
function show(character?: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HousingPanel character={character} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mock.change.mockReset().mockResolvedValue({});
  mock.data.proposals = [];
});
it("exposes accessible home controls and schedules a move with explicit user participation", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Move / arrange a stay" }));
  fireEvent.change(screen.getByLabelText("Home label"), {
    target: { value: "My Tyrone apartment" },
  });
  fireEvent.change(screen.getByLabelText("Move date (Eastern)"), {
    target: { value: "2026-10-28" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Propose move / stay" }));
  await waitFor(() => expect(mock.change).toHaveBeenCalled());
  expect(mock.change.mock.calls[0]![0].data.action).toMatchObject({
    command: "new_home",
    payload: { movers: ["user"], startsAt: "2026-10-28T22:00:00.000Z" },
  });
  expect(mock.change.mock.calls[0]![0].data).not.toHaveProperty("actor");
});
it("does not expose another character's hidden home details or owner edit controls", () => {
  show("tess");
  expect(screen.getByText("Private home details have not been shared.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit home" })).not.toBeInTheDocument();
});
it("answers a cohabitation proposal as the player, preserving the proposal revision", async () => {
  mock.data.proposals = [
    {
      id: "30000000-0000-4000-a000-000000000001",
      plan_id: null,
      residence_id: "home-id",
      initiator: "tess",
      movers: ["tess", "user"],
      required: ["tess", "user"],
      responses: { tess: "accepted", user: "pending" },
      status: "proposed",
      version: 3,
      starts_at: "2026-10-28T22:00:00Z",
      ends_at: null,
      purpose: "roommates",
      homeLabel: "My Home",
      community: "Altoona",
      kind: "move",
    },
  ];
  show();
  fireEvent.click(screen.getByRole("button", { name: "Agree" }));
  await waitFor(() => expect(mock.change).toHaveBeenCalled());
  expect(mock.change.mock.calls[0]![0].data.action).toMatchObject({
    command: "respond",
    payload: { version: 3, accept: true },
  });
});
it("shows an error after a rejected change without claiming the move succeeded", async () => {
  mock.change.mockRejectedValue(new Error("Proposal changed; refresh"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Edit home" }));
  fireEvent.click(screen.getByRole("button", { name: "Save home" }));
  expect(await screen.findByText("Proposal changed; refresh")).toBeInTheDocument();
  expect(screen.queryByText(/Saved\. Invitations/)).not.toBeInTheDocument();
});
