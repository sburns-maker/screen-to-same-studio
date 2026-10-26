import { CalendarBoard } from "@/components/CalendarBoard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTravelTrips } from "@/lib/travel.functions";
import { toast } from "sonner";
import { TOWN_PLACES } from "@/lib/town";
import { useTown } from "@/lib/town-queries";
import { suggestGathering } from "@/lib/town.functions";
import { TownLayout, card } from "@/components/TownLayout";
import type { CharacterKey } from "@/lib/characters";
export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [
    { title: "Plans \u00b7 AI Town" },
    { name: "description", content: "Your private shared calendar and fictional gathering plans in AI Town." },
    { property: "og:title", content: "Plans \u00b7 AI Town" },
    { property: "og:description", content: "Your private shared calendar and fictional gathering plans in AI Town." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: Plans });
function Plans() {
  const travelFn=useServerFn(listTravelTrips);
  const tripQuery=useQuery({queryKey:["travel-trips"],queryFn:()=>travelFn()});
  const q = useTown(),
    suggest = useServerFn(suggestGathering),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [host, setHost] = useState<CharacterKey>("ben"),
    [guest, setGuest] = useState<CharacterKey>("claire"),
    [date, setDate] = useState(""),
    [title, setTitle] = useState("Coffee and a catch-up"),
    [place, setPlace] = useState<string>("coffee:local"),
    [id, setId] = useState(() => crypto.randomUUID()),
    [decision, setDecision] = useState("");
  async function propose() {
    if (!date) return;
    setBusy(true);
    try {
      const r = await suggest({
        data: {
          id,
          organizer: host,
          invitee: guest,
          place,
          title,
          startsAt: new Date(date).toISOString(),
        },
      });
      setDecision(r.reason);
      if (r.accepted) {
        await q.refetch();
        setId(crypto.randomUUID());
        setShow(false);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <TownLayout
      title="Calendar"
      kicker="Your plans"
      error={q.error}
      loading={q.isLoading}
    >
      <p className="mb-5 text-sm text-muted-foreground">
        Keep your agreed outings in one calendar. Use Add agreed plan after discussing the details.
        Existing dates, experience history and memories are preserved.
      </p>
      <Link to="/experiences" search={{ plan: "" }} className="mb-3 flex min-h-12 items-center justify-between rounded-2xl border bg-surface px-4 py-3 font-medium">Experiences and outings <span aria-hidden="true">›</span></Link>
      <details className="mb-5 rounded-2xl border bg-surface p-3"><summary className="min-h-11 cursor-pointer px-2 py-3 font-medium">Trips, event discovery and group gatherings</summary>
      <div className="pt-3">
      <Link to="/travel" className="mb-5 block rounded-2xl border bg-surface p-4 text-center font-medium text-primary">Explore Travel · Road trips, flights, vacations & work trips →</Link>
      {(tripQuery.data??[]).filter(t=>!["cancelled","completed"].includes(t.status)).slice(0,4).map(t=><Link key={t.id} to="/travel" className="mb-2 block rounded-xl border p-3 text-sm"><strong>{t.title}</strong><span className="block text-muted-foreground">{t.startDate??"Dates undecided"} · {t.destination} · {t.status}</span></Link>)}
      <div className="mb-4 grid gap-2 sm:grid-cols-2"><Link to="/ppg-arena" className="block rounded-2xl border p-4"><strong>Find an event</strong><span className="mt-1 block text-sm text-muted-foreground">Concerts, shows and arena outings · invite a character →</span></Link><Link to="/travel" className="block rounded-2xl border p-4"><strong>Manage a trip</strong><span className="mt-1 block text-sm text-muted-foreground">Dates, companions and itinerary →</span></Link></div>
      </div></details>
      <CalendarBoard />
      <details className="mt-5 rounded-2xl border bg-surface p-3"><summary className="min-h-11 cursor-pointer px-2 py-3 font-medium">Advanced: suggest a character gathering</summary><div className="pt-3">
      {decision && (
        <p role="status" className={`${card} mb-4 text-sm`}>
          {decision}
        </p>
      )}
      <button
        onClick={() => setShow(!show)}
        className="mb-5 w-full rounded-full bg-primary p-3 text-primary-foreground"
      >
        Suggest a small gathering
      </button>
      {show && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void propose();
          }}
          className={`${card} mb-5 space-y-3`}
        >
          <p className="text-sm text-muted-foreground">
            You are proposing a get-together, not committing anyone. The organizer can decline;
            invitees decide in the backend world tick. Your own attendance is not assumed. No paid
            AI call is needed.
          </p>
          <label className="block text-sm">
            Proposed organizer
            <select
              aria-label="Proposed organizer"
              value={host}
              onChange={(e) => {
                setHost(e.target.value as CharacterKey);
                setId(crypto.randomUUID());
                setDecision("");
              }}
              className="mt-1 w-full rounded-xl border bg-background p-3"
            >
              {["tess", "maya", "claire", "jordan", "ben"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Invite
            <select
              aria-label="Invite"
              value={guest}
              onChange={(e) => {
                setGuest(e.target.value as CharacterKey);
                setId(crypto.randomUUID());
              }}
              className="mt-1 w-full rounded-xl border bg-background p-3"
            >
              {["tess", "maya", "claire", "jordan", "ben"]
                .filter((k) => k !== host)
                .map((k) => (
                  <option key={k}>{k}</option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            Plan
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            Place
            <select
              value={place}
              onChange={(e) => setPlace(e.target.value as typeof place)}
              className="mt-1 w-full rounded-xl border bg-background p-3"
            >
              {TOWN_PLACES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Start (your device’s local time)
            <input
              required
              type="datetime-local"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setId(crypto.randomUUID());
                setDecision("");
              }}
              className="mt-1 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            One hour, 30 minutes–14 days ahead. Existing character work/sleep and travel constraints
            still apply.
          </p>
          <button
            disabled={busy || !date || host === guest}
            className="w-full rounded-full bg-primary p-3 text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Checking…" : "Propose and relay invitation"}
          </button>
        </form>
      )}
      </div></details>
    </TownLayout>
  );
}
