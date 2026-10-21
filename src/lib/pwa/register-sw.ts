// The ONLY service-worker registrar in the app. Registers /sw.js (generated
// by vite-plugin-pwa at build time) exclusively in production on the real
// published domain — never in dev, never in Lovable previews, never in
// iframes. In any refused context it unregisters stale copies instead.

/**
 * Returns the active service-worker registration, registering /sw.js if
 * needed. Never hangs: rejects with a readable message on timeout or in
 * contexts where workers are refused (editor preview, dev, iframes).
 */
export async function getPushRegistration(timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("This browser doesn't support background notifications.");
  }
  if (refused()) {
    throw new Error("Background notifications only work in the published app (installed on your phone), not in the editor preview.");
  }
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register("/sw.js");
    } catch {
      throw new Error("The notification service couldn't start on this device. Close the app fully and reopen it, then try again.");
    }
  }
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  if (!ready) throw new Error("The notification service is still starting. Wait a few seconds and try again.");
  return ready;
}

export function refused(): boolean {
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
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      // autoUpdate: pick up new workers without user action.
      setInterval(() => void reg.update(), 60 * 60 * 1000);
    } catch {
      // No sw.js (dev) — nothing to register.
    }
  })();
}
