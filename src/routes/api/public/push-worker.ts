import { createFileRoute } from "@tanstack/react-router";

// Dedicated push-only service worker, served under /api/public/ so the private
// publish sign-in wall can't block the browser from fetching it (static files
// like /sw.js are gated on a privately published app). It controls no pages
// (scope /api/public/push/) and caches nothing — it only shows real message
// notifications sent by the server and opens the right chat on tap.
const WORKER = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Chats", {
      body: payload.body || "New message",
      tag: payload.tag || "chats",
      renotify: false,
      data: { url: payload.url || "/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/inbox";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined)).catch(() => self.clients.openWindow(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;

export const Route = createFileRoute("/api/public/push-worker")({
  server: {
    handlers: {
      GET: async () =>
        new Response(WORKER, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        }),
    },
  },
});
