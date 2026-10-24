import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Json } from "@/integrations/supabase/types";
type WorldFixture = {
  experiencesEnabled: boolean;
  plans: { id: string; place_key: string; organizer: string; category: string; status: string }[];
  companions: { plan_id: string; character_key: string }[];
  session: { id: string; place_key: string; departed_at: null; state: Json };
};
type TownFixture = {
  places: ((typeof TOWN_PLACES)[number] & { open: boolean })[];
  presence: null;
  favorites: string[];
};
import { TOWN_PLACES } from "@/lib/town";
const mocks = vi.hoisted(() => ({
  progress: vi.fn(),
  favorite: vi.fn(),
  world: { data: null as unknown as WorldFixture, error: null },
  town: { data: null as unknown as TownFixture, isLoading: false },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...p }: { children: ReactNode; to: string; [key: string]: unknown }) => (
    <a href={to} aria-label={p["aria-label"] as string}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));
vi.mock("@/lib/town-queries", () => ({ useTown: () => mocks.town }));
vi.mock("@/lib/use-interactive-world", () => ({ useInteractiveWorld: () => mocks.world }));
vi.mock("@/lib/interactive-world.functions", () => ({
  progressVenueExperience: mocks.progress,
  favoriteTownPlace: mocks.favorite,
}));
import { ExplorePlaces } from "@/components/ExplorePlaces";
import { VenueExperience } from "@/components/VenueExperience";
import { TownLayout } from "@/components/TownLayout";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  mocks.progress.mockReset().mockResolvedValue({});
  mocks.favorite.mockReset().mockResolvedValue([]);
  mocks.town.data = {
    places: TOWN_PLACES.map((p) => ({ ...p, open: true })),
    presence: null,
    favorites: [],
  };
  mocks.world.data = {
    experiencesEnabled: true,
    plans: [],
    companions: [],
    session: { id: "visit", place_key: "reading:lantern", departed_at: null, state: {} },
  };
});
describe("mobile-friendly discovery and venue controls", () => {
  it("filters places by a tappable activity and exposes an honest empty saved-place state", () => {
    render(<ExplorePlaces />);
    fireEvent.click(screen.getByRole("button", { name: "Bars & Nightlife" }));
    expect(screen.getByRole("heading", { name: "Foundry Table" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Switchyard Coffee" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "favorites" } });
    expect(
      screen.getByRole("heading", { name: "A quieter corner of the map" }),
    ).toBeInTheDocument();
  });
  it("saves a place through the authenticated action rather than changing identity or location", async () => {
    render(<ExplorePlaces />);
    fireEvent.click(screen.getByRole("button", { name: "Save Foundry Table" }));
    await waitFor(() =>
      expect(mocks.favorite).toHaveBeenCalledWith({
        data: { place: "trivia:foundry", enabled: true },
      }),
    );
  });
  it("starts a shared discussion only with a known confirmed companion", async () => {
    mocks.world.data.plans = [
      {
        id: "plan",
        place_key: "reading:lantern",
        organizer: "claire",
        category: "book_club",
        status: "in_progress",
      },
    ];
    mocks.world.data.companions = [{ plan_id: "plan", character_key: "claire" }];
    render(<VenueExperience placeKey="reading:lantern" />);
    expect(screen.getByText("With Claire")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check in and join the discussion" }));
    await waitFor(() =>
      expect(mocks.progress).toHaveBeenCalledWith({
        data: expect.objectContaining({
          place: "reading:lantern",
          kind: "book_club",
          step: -1,
          choice: -1,
          planId: "plan",
        }),
      }),
    );
  });
  it("uses a tap to record a contribution and does not show raw game state", async () => {
    mocks.world.data.session.state = {
      experiences: {
        "solo:book_club": {
          kind: "book_club",
          step: 0,
          answers: [],
          score: 0,
          status: "active",
          plan_id: null,
        },
      },
    };
    render(<VenueExperience placeKey="reading:lantern" />);
    fireEvent.click(screen.getByRole("button", { name: "How the setting shapes the story" }));
    await waitFor(() =>
      expect(mocks.progress).toHaveBeenCalledWith({
        data: expect.objectContaining({ step: 0, choice: 1 }),
      }),
    );
    expect(document.querySelector("pre")).toBeNull();
  });
  it("reports offline status without fabricating local world progress", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(
      <TownLayout title="Explore">
        <p>Saved places</p>
      </TownLayout>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("You’re offline");
  });
});
