// The ONLY service-worker registrar in the app. Registers /sw.js (generated
// by vite-plugin-pwa at build time) exclusively in production on the real
// published domain — never in dev, never in Lovable previews, never in
// iframes. In any refused context it unregisters stale copies instead.

// Push uses its own dedicated worker (separate from the offline /sw.js) served
// from /api/public/ so a private publish sign-in wall can't block it.
export const PUSH_WORKER_URL = "/api/public/push-worker";
export const PUSH_SCOPE = "/api/public/push/";

/** The push registration on this device, if any (never registers). */
export async function findPushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration(PUSH_SCOPE).then((r) => (r && r.scope.endsWith(PUSH_SCOPE) ? r : undefined)).catch(() => undefined);
}

/** Every push subscription held on this device, across all registrations (old /sw.js ones included). */
export async function allLocalSubscriptions(): Promise<PushSubscription[]> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return [];
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => [] as readonly ServiceWorkerRegistration[]);
  const subs = await Promise.all(regs.map((r) => r.pushManager?.getSubscription().catch(() => null) ?? null));
  return subs.filter((s): s is PushSubscription => !!s);
}

function waitActive(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<boolean> {
  if (reg.active) return Promise.resolve(true);
  const sw = reg.installing ?? reg.waiting;
  if (!sw) return Promise.resolve(false);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(!!reg.active), timeoutMs);
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") { clearTimeout(t); resolve(true); }
      if (sw.state === "redundant") { clearTimeout(t); resolve(false); }
    });
  });
}

/**
 * Returns the active push-worker registration, registering it if needed.
 * Never hangs: rejects with a readable message on timeout or in contexts
 * where workers are refused (editor preview, dev, iframes).
 */
export async function getPushRegistration(timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("This browser doesn't support background notifications.");
  }
  if (refused()) {
    throw new Error("Background notifications only work in the published app (installed on your phone), not in the editor preview.");
  }
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: PUSH_SCOPE });
  } catch (e) {
    throw new Error(`The notification service couldn't start on this device${e instanceof Error ? ` (${e.message})` : ""}.`);
  }
  if (!(await waitActive(reg, timeoutMs))) {
    throw new Error("The notification service is still starting. Wait a few seconds and try again.");
  }
  return reg;
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
