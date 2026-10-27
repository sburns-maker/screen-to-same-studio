import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useChatViewport } from "@/lib/use-chat-viewport";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("tracks the Android keyboard viewport, respects pinch zoom, and removes listeners", () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  const remove = vi.spyOn(viewport, "removeEventListener");
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  function Screen() {
    const ref = useChatViewport();
    return <div ref={ref} data-testid="viewport" />;
  }
  const view = render(<Screen />);
  const screen = view.getByTestId("viewport");
  expect(screen.style.getPropertyValue("--chat-height")).toBe("800px");
  act(() => {
    viewport.height = 430;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.style.getPropertyValue("--chat-height")).toBe("430px");
  act(() => {
    viewport.scale = 2;
    viewport.height = 200;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.style.getPropertyValue("--chat-height")).toBe("430px");
  act(() => {
    viewport.scale = 1;
    viewport.offsetTop = 15;
    viewport.dispatchEvent(new Event("scroll"));
  });
  expect(screen.style.getPropertyValue("--chat-top")).toBe("15px");
  view.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
  Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
});
