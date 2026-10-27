import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
const fixture = vi.hoisted(() => ({
  loading: false,
  failed: false,
  refetch: vi.fn().mockResolvedValue({}),
  initiate: vi.fn().mockResolvedValue({ count: 0 }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (o: object) => o,
  Link: ({
    children,
    to,
    className,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    className?: string;
    params?: unknown;
  }) => (
    <a href={to} className={className} aria-label={(rest as Record<string, string>)["aria-label"]}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === "ensure"
      ? {
          isSuccess: !fixture.loading && !fixture.failed,
          isPending: fixture.loading,
          isError: fixture.failed,
          refetch: fixture.refetch,
        }
      : {
          data: fixture.loading
            ? undefined
            : [
                {
                  id: "riley",
                  characterKey: "riley",
                  name: "Riley",
                  preview: "A quiet afternoon",
                  unread: 1,
                  lastAt: new Date().toISOString(),
                },
              ],
          isSuccess: true,
          isLoading: false,
          isError: false,
          refetch: fixture.refetch,
        },
}));
vi.mock("@/lib/tess.functions", () => ({
  ensureConversations: vi.fn(),
  inboxOverview: vi.fn(),
  tessMaybeInitiate: fixture.initiate,
}));
vi.mock("@/lib/use-portrait", () => ({ usePortraits: () => ({ data: {}, isSuccess: true }) }));
vi.mock("@/lib/town-queries", () => ({
  useTown: () => ({
    data: {
      people: [{ key: "sam", name: "Sam", connection: { contact: true, read_at: "" } }],
      messages: [
        {
          npc_key: "sam",
          text: "See you at the cafe",
          role: "assistant",
          created_at: new Date().toISOString(),
        },
      ],
    },
  }),
}));
vi.mock("@/lib/tess-queries", () => ({ userTz: () => "America/New_York" }));
import { Route } from "@/routes/_authenticated/inbox";
const Inbox = (Route as unknown as { component: ComponentType }).component;
beforeEach(() => {
  fixture.loading = false;
  fixture.failed = false;
  vi.clearAllMocks();
});
afterEach(cleanup);
it("filters persistent world contacts as well as main characters and shows an honest empty result", () => {
  render(<Inbox />);
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  const search = screen.getByRole("textbox", { name: "Search conversations" });
  fireEvent.change(search, { target: { value: "Riley" } });
  expect(screen.getByText("Riley")).toBeInTheDocument();
  expect(screen.queryByText("Sam")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "cafe" } });
  expect(screen.getByText("Sam")).toBeInTheDocument();
  expect(screen.queryByText("Riley")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "no-match" } });
  expect(screen.getByRole("status")).toHaveTextContent("No matching conversations");
});
it("shows a neutral initial loading state instead of a default contact", () => {
  fixture.loading = true;
  render(<Inbox />);
  expect(screen.getByRole("status", { name: "Loading conversations" })).toBeInTheDocument();
  expect(screen.queryByText("Tess")).not.toBeInTheDocument();
  expect(fixture.initiate).not.toHaveBeenCalled();
});
it("offers a retry when initialization fails without resetting saved conversations", () => {
  fixture.failed = true;
  render(<Inbox />);
  expect(screen.getByRole("alert")).toHaveTextContent("saved messages are unchanged");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(fixture.refetch).toHaveBeenCalledTimes(1);
});
