// The ONLY service-worker registrar in the app. Registers /sw.js (generated
// by vite-plugin-pwa at build time) exclusively in production on the real
// published domain — never in dev, never in Lovable previews, never in
// iframes. In any refused context it unregisters stale copies instead.

function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  if (window.self !== window.top) return true; // iframe
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterStale() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL.endsWith("/sw.js") || r.waiting?.scriptURL.endsWith("/sw.js") || r.installing?.scriptURL.endsWith("/sw.js"))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (refused()) {
    void unregisterStale();
    return;
  }
  void (async () => {
    try {
      const { registerSW } = await import("virtual:pwa-register");
      registerSW({ immediate: true });
    } catch {
      // Module absent in dev — nothing to register.
    }
  })();
}
