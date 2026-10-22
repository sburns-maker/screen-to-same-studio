import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
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
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-5 pb-8">
      <header className="flex items-start justify-between gap-3 py-7">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[.18em] text-primary">
            {kicker ?? "Your fictional Blair County"}
          </p>
          <h1 className="font-display text-4xl">{title}</h1>
        </div>
        <Link to="/settings" className="rounded-full border px-3 py-2 text-sm">
          Settings
        </Link>
      </header>
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
export const card = "rounded-3xl border bg-surface p-5";
