import { useSyncExternalStore, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
const subscribeOnline = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};
export function TownLayout({
  title,
  kicker,
  children,
  error,
  loading,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  error?: Error | null;
  loading?: boolean;
}) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div className="mx-auto min-h-[calc(100dvh-5rem)] max-w-xl px-4 pb-8 sm:px-5">
      <header className="flex items-start justify-between gap-3 pt-safe pb-5">
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {kicker ?? "Your fictional Blair County"}
          </p>
          <h1 className="font-display text-4xl tracking-tight">{title}</h1>
        </div>
        <Link to="/settings" className="min-h-11 rounded-full border px-4 py-2.5 text-sm">
          Settings
        </Link>
      </header>
      {!online && (
        <p role="status" className="mb-4 rounded-2xl border bg-surface p-3 text-sm">
          You’re offline. Saved views may be available; reconnect before making world changes.
        </p>
      )}
      {loading && (
        <p role="status" className="py-6 text-muted-foreground">
          Opening your world…
        </p>
      )}
      {error && (
        <div role="alert" className="mb-5 rounded-2xl border p-4 text-sm">
          {error.message}
          <p className="mt-2">
            <Link to="/inbox" className="underline">
              Open existing messages
            </Link>
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
export const card = "rounded-3xl border border-border/70 bg-card p-4 shadow-[0_2px_12px_-8px_rgb(0_0_0_/_0.16)] sm:p-5";
