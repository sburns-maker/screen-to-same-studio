import type {CalendarResidence} from "@/lib/calendar-residences";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AgendaEvent } from "@/lib/scheduling-agenda.server";
const mocks = vi.hoisted(() => ({
  events: [] as AgendaEvent[],
  manual: false,
  residences: undefined as CalendarResidence[] | undefined,
  respond: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, hash }: { children: ReactNode; to: string; hash?: string }) => (
    <a href={to + (hash ? "#" + hash : "")}>{children}</a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/use-schedule", () => ({
  useSchedule: () => ({
    data: {
      available: true,
      manual: mocks.manual,
      structured: true,
      events: mocks.events,
      residences:mocks.residences,
      contacts: [{ id: "contact", name: "Maya", key: "maya" }],
    },
  }),
  invalidateSchedule: mocks.invalidate,
}));
vi.mock("@/lib/interactive-world.functions", () => ({ respondToCalendarPlan: mocks.respond }));
vi.mock("@/lib/scheduling.functions", () => ({
  createPlanDraft: mocks.create,
  editCalendarPlan: mocks.edit,
}));
vi.mock("@/components/ExperienceEntry", () => ({
  ExperienceEntry: ({ planId }: { planId: string }) => (
    <a href={"/experiences?plan=" + planId}>Experience this outing</a>
  ),
}));
import { CalendarBoard } from "@/components/CalendarBoard";
import { ConversationPlans } from "@/components/ConversationPlans";
const fixture: AgendaEvent = {
  id: "event",
  user_id: "user",
  conversation_id: "contact",
  organizer: "maya",
  origin: "conversation",
  place_key: "coffee:local",
  title: "Coffee with Maya",
  category: "coffee",
  date_local: "2026-10-25",
  time_local: "14:00",
  starts_at: "2026-10-25T18:00:00Z",
  ends_at: "2026-10-25T19:00:00Z",
  status: "accepted",
  version: 2,
  user_response: "accepted",
  character_response: "accepted",
  missing_details: [],
  conflicts: [],
  followthrough: {},
  source_message_id: "source",
  last_message_id: "last",
  duration_minutes: 60,
  user_attendance: "not_reported",
  created_at: "2026-10-24T18:00:00Z",
  time_zone: "America/New_York",
  venueLabel: "Switchyard Coffee",
  participants: [
    { key: "user", name: "You", response: "accepted" },
    { key: "maya", name: "Maya", response: "accepted" },
  ],
  experience: null,
  followupReady: false,
};
beforeEach(() => {
  mocks.events = [{ ...fixture }];
  mocks.manual = false;
  mocks.residences = undefined;
  mocks.navigate.mockClear();
  mocks.respond.mockReset().mockResolvedValue({ conversationId: "contact" });
  mocks.create.mockReset().mockResolvedValue({ replyPending: false });
  mocks.edit.mockReset().mockResolvedValue({ status: "rescheduled" });
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());
const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarBoard />
    </QueryClientProvider>,
  );
it("renders confirmed plans immediately with matching conversation status and no redundant Accept", () => {
  view();
  expect(screen.getByText("Confirmed")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.getByText(/2026-10-25.*2:00 PM EDT/)).toBeInTheDocument();
  render(<ConversationPlans conversationId="contact" />);
  expect(
    screen.getByRole("navigation", { name: "Plans from this conversation" }),
  ).toHaveTextContent("Confirmed");
  expect(document.getElementById("plan-event")).not.toBeNull();
});
it("supports weekly and agenda views with event details and venue navigation", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "week" }));
  expect(screen.getByLabelText("Weekly calendar")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "agenda" }));
  fireEvent.click(screen.getByRole("button", { name: "Coffee with Maya" }));
  expect(screen.getByText(/Planned duration: 60 minutes/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View venue / travel" })).toBeInTheDocument();
});
it("shows pending details and persists explicit invitation responses", async () => {
  mocks.events = [
    {
      ...fixture,
      status: "awaiting_details",
      user_response: "invited",
      time_local: null,
      starts_at: null,
      time_hint: "after lunch",
      missing_details: ["time (include AM/PM)"],
    },
  ];
  view();
  fireEvent.click(screen.getByRole("button", { name: "Invitations events" }));
  expect(screen.getByText(/Still needed: time/)).toHaveTextContent("after lunch");
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  await waitFor(() =>
    expect(mocks.respond).toHaveBeenCalledWith({
      data: expect.objectContaining({ planId: "event", action: "accept" }),
    }),
  );
  expect(mocks.invalidate).toHaveBeenCalled();
});
it("protects active experiences and surfaces schedule conflicts without cancelling anything", () => {
  mocks.events = [
    {
      ...fixture,
      status: "in_progress",
      experience: { state: "paused" } as AgendaEvent["experience"],
      conflicts: ["calendar_or_travel_overlap"],
    },
  ];
  view();
  fireEvent.click(screen.getByRole("button", { name: "Active events" }));
  expect(screen.getByText("Paused experience")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  expect(screen.getByText(/Another confirmed plan or travel overlaps/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Experience this outing" })).toBeInTheDocument();
});
it("manual creation sends an invitation with missing details instead of assuming mutual consent", async () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "New invitation" }));
  fireEvent.change(screen.getByLabelText("Contact"), { target: { value: "contact" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "contact",
        plan: expect.objectContaining({ action: "invite", date: null, time: null, place: null }),
      }),
    }),
  );
  expect(mocks.invalidate).toHaveBeenCalled();
});

it("sends versioned edits with a stable retry ID and refreshes the canonical agenda", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarBoard />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Edit"));
  fireEvent.change(screen.getByLabelText("Time (Eastern)"), { target: { value: "15:00" } });
  fireEvent.click(screen.getByText("Save changes"));
  await waitFor(() => expect(mocks.edit).toHaveBeenCalledTimes(1));
  expect(mocks.edit.mock.calls[0]![0].data).toMatchObject({
    planId: "event",
    version: 2,
    time: "15:00",
    confirmed: true,
  });
  expect(mocks.edit.mock.calls[0]![0].data.id).toMatch(/^[0-9a-f-]{36}$/);
  await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
});

it("adds an already agreed plan explicitly without navigating to chat", async () => {
  mocks.manual = true;
  mocks.create.mockResolvedValue({ status: "accepted", replyPending: false });
  view();
  fireEvent.click(screen.getByRole("button", { name: "Add agreed plan" }));
  fireEvent.change(screen.getByLabelText("Contact"), { target: { value: "contact" } });
  expect(screen.getByRole("button", { name: "Save to calendar" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("We already agreed to this plan."));
  fireEvent.click(screen.getByRole("button", { name: "Save to calendar" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ confirmed: true, conversationId: "contact" }),
    }),
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("manual confirmation stays on the calendar and editing sends no request-details message", async () => {
  mocks.manual = true;
  mocks.events = [{ ...fixture, status: "proposed", character_response: "invited" }];
  mocks.respond.mockResolvedValue({ conversationId: "contact", manual: true, status: "accepted" });
  view();
  fireEvent.click(screen.getByRole("button", { name: "We agreed — confirm" }));
  await waitFor(() => expect(mocks.respond).toHaveBeenCalled());
  expect(mocks.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
  expect(screen.getByRole("form", { name: "Edit plan" })).toBeInTheDocument();
  expect(mocks.respond).toHaveBeenCalledTimes(1);
});

it("lists private homes with invitation status and restricts them to the selected contact",()=>{
  mocks.manual=true;
  mocks.residences=[{key:'home:maya',label:"Maya's home",canPlan:true,existingPermission:false,characters:['maya']},{key:'home:claire',label:"Claire's home",canPlan:false,existingPermission:false,characters:['claire']},{key:'home:riley',label:"Riley's home",canPlan:true,existingPermission:true,characters:['riley']},{key:'home:user',label:'My Home',canPlan:true,existingPermission:true,characters:[]}];
  view();
  fireEvent.click(screen.getByRole('button',{name:'Add agreed plan'}));
  fireEvent.change(screen.getByLabelText('Contact'),{target:{value:'contact'}});
  expect(screen.getByRole('option',{name:"⌂ Maya's home"})).not.toBeDisabled();
  expect(screen.getByRole('option',{name:"⌂ Claire's home · Invitation required"})).toBeDisabled();
  expect(screen.getByRole('option',{name:"⌂ Riley's home"})).toBeDisabled();
  expect(screen.getByRole('option',{name:'⌂ My Home'})).not.toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});
