import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTown } from "@/lib/town-queries";
import { TownLayout, card } from "@/components/TownLayout";
import { CountyMap } from "@/components/CountyMap";
export const Route = createFileRoute("/_authenticated/explore")({ component: Explore });
function Explore() {
  const q = useTown(),
    [search, setSearch] = useState("");
  return (
    <TownLayout
      title="A little further afield"
      kicker="Explore"
      error={q.error}
      loading={q.isLoading}
    >
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        Real geography, fictional places and people. This is your virtual location; your phone’s GPS
        is never used.
      </p>
      <CountyMap />
      <p className="my-3 text-xs text-muted-foreground">
        Venue pins are approximate fictional placements near public community centers. Map tiles
        load from OpenStreetMap.
      </p>
      <input
        aria-label="Search places"
        placeholder="Find a place or community"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="my-4 w-full rounded-2xl border bg-surface p-3"
      />
      <div className="space-y-3">
        {q.data?.places
          .filter((p) =>
            `${p.label} ${p.community} ${p.kind}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((p) => (
            <Link
              key={p.key}
              to="/place/$placeKey"
              params={{ placeKey: p.key }}
              className={`${card} block`}
            >
              <p className="text-xs uppercase tracking-wider text-primary">
                {p.community} · {p.kind}
              </p>
              <h2 className="my-2 font-display text-2xl">{p.label}</h2>
              <p className="text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-3 text-xs">
                {p.open ? "Open now" : "Closed now"} · {p.opens}:00–{p.closes}:00 Eastern
              </p>
            </Link>
          ))}
      </div>
    </TownLayout>
  );
}
