import { Link } from "@tanstack/react-router";
import { CalendarDays, ArrowUpRight, Mail } from "lucide-react";
import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { useTown } from "@/lib/town-queries";
import { placeByKey } from "@/lib/place-registry";
import { characterFor } from "@/lib/characters";
import { PlaceArtwork } from "./PlaceArtwork";
import { card } from "./TownLayout";
export function WorldHighlights() {
  const world = useInteractiveWorld(),
    town = useTown();
  const upcoming = (world.data?.plans ?? [])
      .filter((p) => ["accepted", "in_progress"].includes(p.status))
      .sort((a, b) => Date.parse(a.starts_at ?? "") - Date.parse(b.starts_at ?? ""))
      .slice(0, 3),
    attention = (world.data?.plans ?? []).filter((p) =>
      ["proposed", "awaiting_details", "rescheduled"].includes(p.status),
    );
  const featured = (town.data?.places ?? [])
    .filter((p) => p.open && ["library", "bar", "park", "community"].includes(p.kind))
    .slice(0, 2);
  return (
    <section className="mt-7 space-y-4" aria-label="Around your day">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">On the horizon</h2>
        <Link to="/plans" className="flex min-h-11 items-center gap-1 text-sm text-primary">
          All plans
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      {world.error ? (
        <p role="status" className={`${card} text-sm`}>
          Plans are temporarily unavailable. Your existing commitments remain saved.
        </p>
      ) : (
        <>
          {!!attention.length && (
            <Link
              to="/plans"
              className="flex items-center gap-3 rounded-2xl border bg-primary/5 p-4"
            >
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {attention.length} invitation{attention.length === 1 ? "" : "s"} to work out
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A reply, a time or a meeting place is still needed.
                </p>
              </div>
            </Link>
          )}
          {upcoming.map((p) => (
            <Link key={p.id} to="/plans" hash={`plan-${p.id}`} className={`${card} flex gap-3`}>
              <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-medium">
                  {p.title} with {characterFor(p.organizer).preferredName}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.starts_at
                    ? new Date(p.starts_at).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Time to be decided"}{" "}
                  Eastern
                </p>
                <p className="mt-1 text-xs text-primary">
                  {placeByKey(p.place_key)?.label ?? "Venue undecided"}
                  {p.status === "in_progress" ? " · Happening now" : ""}
                </p>
              </div>
            </Link>
          ))}
          {!upcoming.length && !world.isLoading && (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              Room for a quiet day. Invitations and agreed plans will appear here.
            </p>
          )}
        </>
      )}
      {!!featured.length && (
        <>
          <h2 className="pt-3 text-lg font-semibold">A little local life</h2>
          <p className="text-xs text-muted-foreground">
            Public fictional activities, not private character updates.
          </p>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            {featured.map((p) => (
              <Link
                key={p.key}
                to="/place/$placeKey"
                params={{ placeKey: p.key }}
                className="min-w-0 overflow-hidden rounded-2xl border bg-surface p-2"
              >
                <PlaceArtwork kind={p.kind} label={p.label} compact />
                <h3 className="px-2 pt-3 text-sm font-medium">{p.label}</h3>
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {p.community} ·{" "}
                  {p.kind === "library"
                    ? "Reading & discussion"
                    : p.kind === "bar"
                      ? "A few trivia rounds"
                      : p.kind === "park"
                        ? "A walk & a quiet bench"
                        : "A public space to explore"}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
