import { createFileRoute } from "@tanstack/react-router";
import { ExplorePlaces } from "@/components/ExplorePlaces";
import { useTown } from "@/lib/town-queries";
import { TownLayout } from "@/components/TownLayout";
import { CountyMap } from "@/components/CountyMap";
export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({ meta: [
    { title: "Explore \u00b7 AI Town" },
    { name: "description", content: "Discover fictional places across the AI Town community." },
    { property: "og:title", content: "Explore \u00b7 AI Town" },
    { property: "og:description", content: "Discover fictional places across the AI Town community." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: Explore });
function Explore() {
  const q = useTown();
  return (
    <TownLayout title="Find your next stop" kicker="Explore" error={q.error} loading={q.isLoading}>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        Real geography, fictional places and people. This is your virtual location; your phone’s GPS
        is never used.
      </p>
      <CountyMap places={q.data?.places} />
      <p className="my-3 text-xs text-muted-foreground">
        Venue pins are approximate fictional placements near public community centers. Map tiles
        load from OpenStreetMap.
      </p>
      <ExplorePlaces />
    </TownLayout>
  );
}
