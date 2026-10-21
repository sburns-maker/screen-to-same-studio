// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // Explicit offline support (user-requested). The service worker is only
      // ever registered by src/lib/pwa/register-sw.ts — never in dev/preview.
      VitePWA({
        strategies: "generateSW",
        filename: "sw.js",
        registerType: "autoUpdate",
        injectRegister: null,
        manifest: false, // keep the existing public/manifest.webmanifest
        devOptions: { enabled: false },
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          runtimeCaching: [
            {
              // HTML navigations: network first, cache fallback for offline.
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "tess-pages", networkTimeoutSeconds: 4 },
            },
            {
              // Same-origin hashed build assets: cache first.
              urlPattern: ({ url, request }: { url: URL; request: Request }) =>
                url.origin === self.location.origin && (/\/assets\//.test(url.pathname) || request.destination === "image"),
              handler: "CacheFirst",
              options: {
                cacheName: "tess-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
              },
            },
            {
              // Signed photo URLs (Tess's photos) — cache for offline viewing.
              urlPattern: ({ url }: { url: URL }) => /storage\/v1\/object\/sign\/tess-photos/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "tess-photos",
                expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 3600 },
              },
            },
          ],
        },
      }),
    ],
  },
});
