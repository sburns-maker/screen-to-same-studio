import { AsyncLocalStorage } from "node:async_hooks";

type ExecutionContext = { waitUntil?: (p: Promise<unknown>) => void };
export const requestContext = new AsyncLocalStorage<ExecutionContext | undefined>();

/**
 * Keeps server-owned work alive after the response on Cloudflare Workers
 * (bounded by the platform's post-response limit). In Node dev the promise
 * simply keeps running.
 */
export function keepAlive(work: Promise<unknown>) {
  const ctx = requestContext.getStore();
  const guarded = work.catch((e) => console.error("background work failed", e));
  if (ctx?.waitUntil) ctx.waitUntil(guarded);
  return { platform: !!ctx?.waitUntil };
}
