import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactionBubble } from "@/components/ReactionBubble";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  // jsdom has no PointerEvent; preserve the fields used by the real gesture.
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerType = "touch";
      isPrimary = true;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = () => {
  render(
    <ReactionBubble
      messageId="message"
      conversationId="conversation"
      mine={false}
      timestamp="12:00"
      body="Hello"
    />,
  );
  return screen.getByRole("button", { name: "React to message: Hello" });
};
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

it("does not open reactions on a quick tap or synthetic click", () => {
  const bubble = mount();
  fireEvent.pointerDown(bubble, { button: 0 });
  advance(100);
  fireEvent.pointerUp(bubble);
  fireEvent.click(bubble);
  advance(600);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("opens only after holding and keeps reaction selection working", () => {
  const bubble = mount();
  fireEvent.pointerDown(bubble, { button: 0 });
  advance(499);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  advance(1);
  expect(screen.getByRole("menu")).toBeInTheDocument();
  fireEvent.pointerUp(bubble);
  fireEvent.click(screen.getByRole("menuitem", { name: "React with ❤️" }));
  expect(localStorage.getItem("chats:local-reaction:conversation:message")).toBe("❤️");
});

it.each(["move", "cancel", "leave"])("cancels the hold on %s", (reason) => {
  const bubble = mount();
  fireEvent.pointerDown(bubble, { button: 0, clientX: 20, clientY: 20 });
  advance(200);
  if (reason === "move") fireEvent.pointerMove(bubble, { clientX: 20, clientY: 45 });
  else if (reason === "cancel") fireEvent.pointerCancel(bubble);
  else fireEvent.pointerLeave(bubble);
  advance(600);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("retains desktop right-click and keyboard access", () => {
  const bubble = mount();
  fireEvent.keyDown(bubble, { key: "Enter" });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  fireEvent.contextMenu(bubble);
  expect(screen.getByRole("menu")).toBeInTheDocument();
});

it("does not reopen on a quick tap of an existing reaction", () => {
  localStorage.setItem("chats:local-reaction:conversation:message", "❤️");
  mount();
  fireEvent.click(
    screen.getByLabelText("Current reaction ❤️. Hold the message to change or remove"),
  );
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
