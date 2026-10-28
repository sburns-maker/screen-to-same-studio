import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode, MouseEvent } from "react";
import { ContactRelationshipStory } from "@/components/ContactRelationshipStory";
import { relationshipDraftKey, RELATIONSHIP_CAST } from "@/lib/relationship-commitments";
const state = vi.hoisted(() => ({
  pending: false,
  available: true,
  loading: false,
  refetch: vi.fn(),
  change: vi.fn(),
}));
vi.mock("@/lib/use-relationship-commitments", () => ({
  useRelationshipCommitments: () => ({
    isLoading: state.loading,
    refetch: state.refetch,
    data: {
      available: state.available,
      diagnostic: state.available ? undefined : { phase: "sync", code: "PGRST202" },
      events: state.pending
        ? [
            {
              id: "00000000-0000-4000-8000-000000000001",
              kind: "partnership",
              status: "pending",
              proposedBy: "user",
              userResponse: "accepted",
            },
          ]
        : [],
    },
  }),
}));
vi.mock("@/lib/tess-queries", () => ({ stateQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/relationship-commitments.functions", () => ({
  changeRelationshipCommitment: state.change,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/RelationshipMilestones", () => ({ RelationshipMilestones: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    onClick,
    children,
    className,
  }: {
    params: { conversationId: string };
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
    children: ReactNode;
    className: string;
  }) => (
    <a
      href={`/chat/${params.conversationId}`}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
beforeEach(() => {
  state.pending = false;
  state.available = true;
  state.loading = false;
  state.refetch.mockReset();
  state.change.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);
it.each(RELATIONSHIP_CAST)("offers %s a private relationship discussion", (character) => {
  render(
    <ContactRelationshipStory
      characterKey={character}
      characterName={character}
      conversationId="own-conversation"
    />,
  );
  expect(screen.getByRole("button", { name: "Discuss a relationship" })).toBeInTheDocument();
});
it.each(RELATIONSHIP_CAST)(
  "prepares %s's draft in the right conversation without issuing a decision",
  (character) => {
    state.pending = true;
    render(
      <ContactRelationshipStory
        characterKey={character}
        characterName={character}
        conversationId="own-conversation"
      />,
    );
    const link = screen.getByRole("link", { name: "Discuss in messages" });
    expect(link).toHaveAttribute("href", "/chat/own-conversation");
    fireEvent.click(link);
    expect(
      JSON.parse(sessionStorage.getItem(relationshipDraftKey("own-conversation"))!),
    ).toMatchObject({ character, kind: "partnership" });
    expect(sessionStorage.getItem(relationshipDraftKey("another-conversation"))).toBeNull();
    expect(state.change).not.toHaveBeenCalled();
  },
);
it("leaves Ben's relationship buttons unavailable", () => {
  render(
    <ContactRelationshipStory
      characterKey="ben"
      characterName="Ben"
      conversationId="ben-conversation"
    />,
  );
  expect(screen.queryByRole("button", { name: "Discuss a relationship" })).toBeNull();
});

it.each(RELATIONSHIP_CAST)(
  "keeps %s's card visible with safe failure details and retry",
  (character) => {
    state.available = false;
    render(
      <ContactRelationshipStory
        characterKey={character}
        characterName={character}
        conversationId="own-conversation"
      />,
    );
    expect(screen.getByText("Your story together")).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/PGRST202/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discuss a relationship" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry relationship history" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute(
      "href",
      "/chat/own-conversation",
    );
    expect(state.change).not.toHaveBeenCalled();
  },
);
it("shows loading instead of disappearing", () => {
  state.loading = true;
  render(<ContactRelationshipStory characterKey="claire" characterName="Claire" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading relationship history");
});
