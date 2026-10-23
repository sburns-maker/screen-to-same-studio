import { PlaceArtwork } from "@/components/PlaceArtwork";
import { VenueScene } from "@/components/VenueScene";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTown } from "@/lib/town-queries";
import { actInTown } from "@/lib/town.functions";
import { travelMinutes, TOWN_PLACES } from "@/lib/town";
import { TownLayout, card } from "@/components/TownLayout";
export const Route = createFileRoute("/_authenticated/place/$placeKey")({ component: Place });
function Place() {
  const { placeKey } = Route.useParams(),
    q = useTown(),
    act = useServerFn(actInTown),
    cache = useQueryClient(),
    [busy, setBusy] = useState(false);
  const place = q.data?.places.find((p) => p.key === placeKey),
    presence = q.data?.presence,
    travelling = !!presence && Date.parse(presence.arrives_at) > Date.now(),
    here = presence?.place_key === placeKey && !travelling;
  const from = TOWN_PLACES.find((p) => p.key === presence?.place_key),
    to = TOWN_PLACES.find((p) => p.key === placeKey);
  async function visit() {
    setBusy(true);
    try {
      await act({ data: { action: "visit", id: crypto.randomUUID(), place: placeKey } });
      await cache.invalidateQueries({ queryKey: ["town"] });
      toast.success("Virtual travel started.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <TownLayout
      title={place?.label ?? "A place in town"}
      kicker="Virtual visit"
      error={q.error}
      loading={q.isLoading}
    >
      {place && (
        <>
          <div className="mb-4">
            <PlaceArtwork kind={place.kind} label={place.label} />
          </div>
          <div className={`${card} mb-5 bg-primary/5`}>
            <p className="text-xs uppercase tracking-widest text-primary">
              {place.community} · Fictional {place.kind}
            </p>
            <p className="my-5 font-display text-2xl leading-relaxed">{place.description}</p>
            <p className="text-sm text-muted-foreground">
              {place.opens}:00–{place.closes}:00 Eastern · {place.open ? "Open" : "Closed"}
            </p>
          </div>
          {travelling ? (
            <p role="status" className={`${card} mb-4`}>
              Travelling virtually to{" "}
              {q.data?.places.find((p) => p.key === presence?.place_key)?.label ?? "home"}. Arrival{" "}
              {new Date(presence!.arrives_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              . You can keep using Messages.
            </p>
          ) : here ? (
            <p className="mb-5 text-sm text-primary">
              You are here virtually. Look around or start a conversation.
            </p>
          ) : (
            <button
              disabled={busy || !place.open}
              onClick={visit}
              className="mb-5 w-full rounded-2xl bg-primary p-4 font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy
                ? "Starting travel…"
                : `Visit virtually · about ${to ? travelMinutes(from, to) : 15} min`}
            </button>
          )}
          {here && <VenueScene placeKey={placeKey} />}
          <h2 className="mb-3 text-lg font-semibold">Around you</h2>
          {here && place.open ? (
            q.data?.people
              .filter((n) => n.present)
              .map((n) => (
                <Link
                  key={n.key}
                  to="/encounter/$npcKey"
                  params={{ npcKey: n.key }}
                  className={`${card} mb-3 block`}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 font-display text-xl">
                      {n.name[0]}
                    </span>
                    <h3 className="font-medium">{n.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{n.blurb}</p>
                  <p className="mt-3 text-sm text-primary">Say hello →</p>
                </Link>
              ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Arrive during opening hours to see who is around. Nobody is guaranteed to be here.
            </p>
          )}
          {here && !q.data?.people.some((n) => n.present) && (
            <p className="text-sm text-muted-foreground">
              A quiet moment. No one is available for an encounter right now.
            </p>
          )}
          <Link to="/home" className="mt-6 block text-sm underline">
            Your virtual home and travel status
          </Link>
        </>
      )}
    </TownLayout>
  );
}
