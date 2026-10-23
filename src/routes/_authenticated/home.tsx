import { WorldHighlights } from "@/components/WorldHighlights";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useTown } from "@/lib/town-queries";
import { actInTown } from "@/lib/town.functions";
import { inboxOverview } from "@/lib/tess.functions";
import { TownLayout, card } from "@/components/TownLayout";
export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [
    { title: "Home \u00b7 AI Town" },
    { name: "description", content: "Your private AI Town conversations, plans and virtual whereabouts." },
    { property: "og:title", content: "Home \u00b7 AI Town" },
    { property: "og:description", content: "Your private AI Town conversations, plans and virtual whereabouts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: Home });
function Home() {
  const q = useTown(),
    load = useServerFn(inboxOverview),
    inbox = useQuery({ queryKey: ["inbox"], queryFn: () => load({}) }),
    act = useServerFn(actInTown),
    [busy, setBusy] = useState(false);
  const pos = q.data?.presence,
    travelling = !!pos && Date.parse(pos.arrives_at) > Date.now();
  async function goHome() {
    setBusy(true);
    try {
      await act({ data: { action: "visit", id: crypto.randomUUID(), place: "home:user" } });
      await q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <TownLayout title="Life around here" kicker="Home" error={q.error} loading={q.isLoading}>
      <div className={`${card} mb-5 bg-primary/5`}>
        <p className="text-xs uppercase tracking-wider text-primary">Your virtual whereabouts</p>
        <h2 className="my-3 font-display text-2xl">
          {q.isLoading
            ? "Checking virtual presence…"
            : q.error
              ? "Virtual presence unavailable"
              : travelling
                ? "On your way"
                : pos && pos.place_key !== "home:user"
                  ? q.data?.places.find((p) => p.key === pos.place_key)?.label
                  : "A quiet moment at home"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {travelling
            ? `Arrival ${new Date(pos!.arrives_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : "A private fictional home, with no real address or GPS tracking."}
        </p>
        <div className="mt-4 flex gap-4 text-sm">
          {pos && !travelling && pos.place_key !== "home:user" && (
            <Link
              to="/place/$placeKey"
              params={{ placeKey: pos.place_key }}
              className="font-medium underline"
            >
              Enter this destination
            </Link>
          )}
          <Link to="/explore" className="font-medium underline">
            Head into town
          </Link>
          {pos?.place_key !== "home:user" && (
            <button
              disabled={busy || travelling}
              onClick={goHome}
              className="underline disabled:opacity-40"
            >
              Go home virtually
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/inbox" className={card}>
          <p className="font-medium">Messages</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {inbox.data?.reduce((n, c) => n + c.unread, 0) ?? 0} unread from established contacts
          </p>
        </Link>
        <Link to="/plans" className={card}>
          <p className="font-medium">Plans</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {q.data?.plans.filter((p) => p.status === "proposed").length ?? 0} shared proposals
          </p>
        </Link>
      </div>
      <WorldHighlights />
      <h2 className="mb-3 mt-7 text-lg font-semibold">Recent conversations</h2>
      <div className="divide-y rounded-3xl border">
        {inbox.data?.slice(0, 3).map((c) => (
          <Link
            key={c.id}
            to="/chat/$conversationId"
            params={{ conversationId: c.id }}
            className="block p-4"
          >
            <p className="font-medium">{c.name}</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">{c.preview}</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 mt-7 text-lg font-semibold">A change of scenery</h2>
      <Link to="/explore" className={`${card} block`}>
        <p className="font-display text-2xl">Coffee, books, or a small adventure?</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Explore fictional places in Altoona, Hollidaysburg, Tyrone, and Duncansville. New
          acquaintances begin with an actual encounter.
        </p>
      </Link>
      <p className="mt-6 text-xs text-muted-foreground">
        This dashboard shows your own conversations and plans you arranged. Private character
        activities are not a public feed.
      </p>
    </TownLayout>
  );
}
