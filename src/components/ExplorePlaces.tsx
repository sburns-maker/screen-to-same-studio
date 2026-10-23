import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, MapPin, Search, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { useTown } from "@/lib/town-queries";
import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { favoriteTownPlace } from "@/lib/interactive-world.functions";
import {
  PLACE_CATEGORIES,
  matchesPlace,
  searchPlace,
  placeTravelMinutes,
  type PlaceCategory,
} from "@/lib/place-discovery";
import { PlaceArtwork } from "./PlaceArtwork";
import { card } from "./TownLayout";
export function ExplorePlaces() {
  const town = useTown(),
    world = useInteractiveWorld(),
    save = useServerFn(favoriteTownPlace),
    cache = useQueryClient();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState<PlaceCategory>("all"),
    [filter, setFilter] = useState("all"),
    [area, setArea] = useState("all"),
    [busy, setBusy] = useState<string | null>(null);
  const arrived = town.data?.presence && Date.parse(town.data.presence.arrives_at) <= Date.now(),
    from = arrived ? town.data?.presence?.place_key : null;
  const favorites = town.data?.favorites ?? [];
  const plans = (world.data?.plans ?? []).filter((p) =>
    ["accepted", "in_progress"].includes(p.status),
  );
  const places = (town.data?.places ?? [])
    .filter(
      (p) =>
        searchPlace(p, search) &&
        matchesPlace(p.kind, category) &&
        (area === "all" || p.community === area) &&
        (filter !== "favorites" || favorites.includes(p.key)) &&
        (filter !== "events" || plans.some((x) => x.place_key === p.key)) &&
        (filter !== "open" || p.open),
    )
    .sort(
      (a, b) => (placeTravelMinutes(from, a.key) ?? 999) - (placeTravelMinutes(from, b.key) ?? 999),
    );
  async function favorite(place: string) {
    setBusy(place);
    try {
      await save({ data: { place, enabled: !favorites.includes(place) } });
      await cache.invalidateQueries({ queryKey: ["town"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section aria-label="Find your next stop" className="space-y-4">
      <label className="flex min-h-12 items-center gap-2 rounded-2xl border bg-surface px-4">
        <Search className="h-4 w-4 shrink-0" />
        <input
          aria-label="Search places"
          placeholder="A place, an activity, a neighborhood"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 outline-none"
        />
      </label>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Activity filters">
        {Object.entries(PLACE_CATEGORIES).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={category === key}
            onClick={() => setCategory(key as PlaceCategory)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${category === key ? "bg-primary text-primary-foreground" : "bg-surface"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">
          Area
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border bg-surface p-2 text-sm text-foreground"
          >
            <option value="all">All communities</option>
            {[...new Set(town.data?.places.map((p) => p.community))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Show
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border bg-surface p-2 text-sm text-foreground"
          >
            <option value="all">All places</option>
            <option value="open">Open now</option>
            <option value="favorites">Saved places</option>
            <option value="events">My upcoming events</option>
          </select>
        </label>
      </div>
      {world.error && (
        <p role="status" className="text-xs text-muted-foreground">
          Your event details are temporarily unavailable. Public places remain browsable.
        </p>
      )}
      {from && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-4 w-4" />
          Nearest first from your virtual location. Travel estimates use the existing route
          calculation.
        </p>
      )}
      {!places.length && !town.isLoading && (
        <div className={card}>
          <h2 className="font-medium">A quieter corner of the map</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No places match these filters. Try another activity or community.
          </p>
          <button
            className="mt-3 min-h-11 text-sm underline"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setFilter("all");
              setArea("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {places.map((p) => {
        const at = from === p.key,
          minutes = placeTravelMinutes(from, p.key),
          events = plans.filter((x) => x.place_key === p.key);
        return (
          <article key={p.key} className={`${card} !p-3`}>
            <Link to="/place/$placeKey" params={{ placeKey: p.key }}>
              <PlaceArtwork kind={p.kind} label={p.label} compact />
              <div className="px-2 pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                  {p.community} · {p.kind}
                </p>
                <h2 className="mt-1 font-display text-2xl">{p.label}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              </div>
            </Link>
            <div className="mt-3 flex items-center justify-between gap-2 px-2">
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {at
                  ? "You’re here"
                  : minutes !== null
                    ? `About ${minutes} min virtually`
                    : "Virtual destination"}{" "}
                · {p.open ? "Open" : "Closed"}
                {events.length ? ` · ${events.length} of your plans` : ""}
              </p>
              <button
                aria-label={`${favorites.includes(p.key) ? "Unsave" : "Save"} ${p.label}`}
                aria-pressed={favorites.includes(p.key)}
                disabled={busy === p.key || !world.data?.experiencesEnabled}
                onClick={() => void favorite(p.key)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40"
              >
                <Heart
                  className="h-4 w-4"
                  fill={favorites.includes(p.key) ? "currentColor" : "none"}
                />
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
