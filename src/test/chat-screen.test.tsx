import { relationshipDraftKey, relationshipDiscussionDraft } from "@/lib/relationship-commitments";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import type { ComponentType, AnchorHTMLAttributes, ReactNode } from "react";

const fixture = vi.hoisted(() => ({
  key: "riley",
  conversation: "10000000-0000-4000-a000-000000000001",
  loading: false,
  messages: [] as {
    id: string;
    sender: string;
    body: string;
    created_at: string;
    visible_at: string;
    metadata: Record<string, unknown>;
  }[],
  calls: [] as {
    id: string;
    conversation_id: string;
    offered_at: string;
    direction: string;
    state: string;
  }[],
  insert: vi.fn().mockResolvedValue({ error: null }),
  refetch: vi.fn().mockResolvedValue({}),
  read: vi.fn().mockResolvedValue({}),
  respond: vi.fn().mockResolvedValue({}),
  cache: { invalidateQueries: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ conversationId: fixture.conversation }),
  }),
  Link: ({
    to,
    params,
    search,
    hash,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    hash?: string;
    children: ReactNode;
  }) => {
    let href = to;
    for (const [key, value] of Object.entries(params ?? {})) href = href.replace(`$${key}`, value);
    if (search) {
      const query = new URLSearchParams(
        Object.entries(search).filter(([, value]) => value !== undefined),
      ).toString();
      if (query) href += "?" + query;
    }
    if (hash) href += "#" + hash;
    return (
      <a {...rest} href={href}>
        {children}
      </a>
    );
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQueryClient: () => fixture.cache,
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === "conversation"
      ? {
          data: fixture.loading
            ? undefined
            : {
                id: fixture.conversation,
                character: { key: fixture.key },
                read_receipts: true,
                typing_indicator: true,
              },
          isPending: fixture.loading,
          refetch: fixture.refetch,
        }
      : {
          data: fixture.messages,
          refetch: fixture.refetch,
          isLoading: false,
          isFetching: false,
          isError: false,
        },
}));
vi.mock("@/lib/tess.functions", () => ({ markRead: fixture.read, tessRespond: fixture.respond }));
vi.mock("@/lib/photo-reference-library.functions", () => ({ refreshPendingPhotos: vi.fn() }));
vi.mock("@/components/ProfileImageEditor", () => ({ ProfileImageEditor: () => null }));
vi.mock("@/lib/profile-media.functions", () => ({ saveProfileImage: vi.fn() }));
vi.mock("@/lib/use-portrait", () => ({ usePortraits: () => ({ data: {} }) }));
vi.mock("@/lib/phone-queries", () => ({
  usePhone: () => ({ data: { available: true, calls: fixture.calls } }),
}));
vi.mock("@/lib/use-schedule", () => ({
  invalidateSchedule: vi.fn(),
  useSchedule: () => ({
    data: {
      available: true,
      events: [
        {
          id: "plan-one",
          title: "Coffee together",
          conversation_id: fixture.conversation,
          status: "accepted",
          starts_at: "2026-10-28T22:30:00Z",
          time_zone: "America/New_York",
          missing_details: [],
          venueLabel: "Switchyard Coffee",
          experience: null,
        },
      ],
    },
  }),
}));
vi.mock("@/components/NpcIntroductionChip", () => ({ NpcIntroductionChip: () => null }));
vi.mock("@/components/VideoUploadButton", () => ({ VideoUploadButton: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from: () => ({ insert: fixture.insert }),
  },
}));
import { Route } from "@/routes/_authenticated/chat.$conversationId";
const Chat = (Route as unknown as { component: ComponentType }).component;
const now = new Date("2026-10-27T20:00:00Z").getTime();
function message(id: string, sender: string, body: string, metadata: Record<string, unknown> = {}) {
  const at = new Date(now - 60000).toISOString();
  return { id, sender, body, created_at: at, visible_at: at, metadata };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  localStorage.clear();
  sessionStorage.clear();
  fixture.loading = false;
  fixture.key = "riley";
  fixture.conversation = "10000000-0000-4000-a000-000000000001";
  fixture.messages = [
    message("player-one", "user", "How was your afternoon?"),
    message(
      "reply-one",
      "tess",
      "Finally home. I'm making something to eat, then doing absolutely nothing for a bit.",
      { in_reply_to: "player-one" },
    ),
    message("reply-two", "tess", "Got a photo on the way for you.", {
      photo_pending: { actionId: "pending-one" },
    }),
  ];
  fixture.calls = [
    {
      id: "call-one",
      conversation_id: fixture.conversation,
      direction: "incoming",
      state: "missed",
      offered_at: "2026-10-27T19:15:00Z",
    },
  ];
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: function (this: HTMLElement, args: { top: number }) {
      this.scrollTop = args.top;
    },
  });
  fixture.insert.mockReset().mockResolvedValue({ error: null });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(["tess", "maya", "riley", "claire", "jordan", "ben"])(
  "renders %s's correct identity, missed call, pending photo and plan without starting a call or generation",
  async (key) => {
    fixture.key = key;
    const view = render(<Chat />);
    const name = key[0]!.toUpperCase() + key.slice(1);
    expect(screen.getByRole("region", { name: `Messages with ${name}` })).toBeInTheDocument();
    expect(screen.getByLabelText(`Missed call from ${name}`)).toHaveTextContent("View history");
    expect(screen.getAllByRole("link", { name: `Call ${name}` })[0]).toHaveAttribute(
      "href",
      `/live-call/${fixture.conversation}`,
    );
    expect(
      screen.getByRole("navigation", { name: "Plans from this conversation" }),
    ).toHaveTextContent("Confirmed");
    expect(screen.getByRole("status")).toHaveTextContent("Preparing photo");
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: `Message ${name}` })).not.toBeDisabled();
    expect(fixture.respond).not.toHaveBeenCalled();
    await waitFor(() => expect(fixture.read).toHaveBeenCalled());
    const dir = process.env["UI_REVIEW_DIR"];
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const css = readdirSync(".output/public/assets")
        .filter((p) => p.endsWith(".css"))
        .map(
          (p) =>
            `<link rel="stylesheet" href="file://${process.cwd()}/.output/public/assets/${p}">`,
        )
        .join("");
      const html = view.container.innerHTML.replace(
        /src="(\/src\/[^"]+)"/g,
        (_, path: string) => `src="file://${process.cwd()}${path}"`,
      );
      writeFileSync(
        `${dir}/${key}.html`,
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${css}</head><body>${html}</body></html>`,
      );
    }
  },
);

it("preserves reading position and offers a jump when new messages arrive", () => {
  const view = render(<Chat />);
  const region = screen.getByRole("region", { name: "Messages with Riley" });
  Object.defineProperties(region, {
    scrollHeight: { configurable: true, value: 2200 },
    clientHeight: { configurable: true, value: 500 },
  });
  region.scrollTop = 100;
  fireEvent.scroll(region);
  fixture.messages = [...fixture.messages, message("later", "tess", "Talk later.")];
  view.rerender(<Chat />);
  expect(region.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole("button", { name: "Latest messages" }));
  expect(region.scrollTop).toBe(2200);
});

it("does not carry a draft or another contact's identity into the next conversation", () => {
  const view = render(<Chat />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsent Riley draft" } });
  fixture.key = "maya";
  fixture.conversation = "20000000-0000-4000-a000-000000000002";
  view.rerender(<Chat />);
  expect(screen.getByRole("textbox", { name: "Message Maya" })).toHaveValue("");
  expect(screen.queryByLabelText("Missed call from Riley")).not.toBeInTheDocument();
});

it("stays neutral while a different contact is loading", () => {
  fixture.loading = true;
  render(<Chat />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading contact");
  expect(screen.queryByText("Tess")).not.toBeInTheDocument();
});

it("does not show another conversation's missed call", () => {
  fixture.calls[0]!.conversation_id = "other-conversation";
  render(<Chat />);
  expect(screen.queryByLabelText("Missed call from Riley")).not.toBeInTheDocument();
});

it("preserves an uncertain send with its original request ID without erasing the next draft", async () => {
  let settle: (value: { error: { code: string } }) => void = () => {};
  fixture.insert.mockImplementation(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  render(<Chat />);
  const composer = screen.getByRole("textbox");
  fireEvent.change(composer, { target: { value: "First text" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fixture.insert).toHaveBeenCalledTimes(1));
  fireEvent.change(composer, { target: { value: "Next draft" } });
  const sentId = fixture.insert.mock.calls[0]![0].id;
  settle({ error: { code: "network" } });
  await waitFor(() =>
    expect(screen.getByText("Not confirmed · Saved on this device")).toBeInTheDocument(),
  );
  expect(composer).toHaveValue("Next draft");
  expect(JSON.parse(localStorage.getItem(`tess:outbox:${fixture.conversation}`)!)).toEqual([
    expect.objectContaining({ id: sentId, body: "First text" }),
  ]);
  expect(fixture.respond).not.toHaveBeenCalled();
});

it("keeps a short composer scrollbar-free and caps long drafts without hiding their text", () => {
  render(<Chat />);
  const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
  Object.defineProperty(composer, "scrollHeight", { configurable: true, value: 44 });
  fireEvent.change(composer, { target: { value: "Short draft" } });
  expect(composer.style.height).toBe("46px");
  expect(composer.style.overflowY).toBe("hidden");
  Object.defineProperty(composer, "scrollHeight", { configurable: true, value: 240 });
  fireEvent.change(composer, { target: { value: "A much longer draft" } });
  expect(composer.style.height).toBe("144px");
  expect(composer.style.overflowY).toBe("auto");
});

it.each(["tess", "maya", "riley", "claire", "jordan"])("opens only %s's editable relationship draft without sending", (key) => {
  fixture.key = key;
  sessionStorage.setItem(relationshipDraftKey(fixture.conversation), JSON.stringify({character:key,kind:"partnership",eventId:crypto.randomUUID()}));
  render(<Chat />);
  expect(screen.getByRole("textbox")).toHaveValue(relationshipDiscussionDraft("partnership"));
  expect(fixture.insert).not.toHaveBeenCalled();
  expect(fixture.respond).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(relationshipDraftKey(fixture.conversation))).toBeNull();
});
it("does not load another contact's draft", () => {
  fixture.key = "riley";
  sessionStorage.setItem(relationshipDraftKey(fixture.conversation), JSON.stringify({character:"tess",kind:"partnership",eventId:crypto.randomUUID()}));
  render(<Chat />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(fixture.insert).not.toHaveBeenCalled();
});
