import { useEffect, useRef } from "react";

/** Keep the composer above the Android keyboard without disabling page zoom. */
export function useChatViewport() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // A pinch zoom should zoom the page, not continually resize its layout.
      if (viewport.scale !== 1) return;
      root.current?.style.setProperty("--chat-height", `${viewport.height}px`);
      root.current?.style.setProperty("--chat-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return root;
}
