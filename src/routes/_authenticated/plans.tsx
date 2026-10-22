import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useTown } from "@/lib/town-queries";
import { suggestGathering } from "@/lib/town.functions";
import { TownLayout, card } from "@/components/TownLayout";
import type { CharacterKey } from "@/lib/characters";
export const Route = createFileRoute("/_authenticated/plans")({ component: Plans });
function Plans() {
  const q = useTown(),
    suggest = useServerFn(suggestGathering),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [host, setHost] = useState<CharacterKey>("ben"),
    [guest, setGuest] = useState<CharacterKey>("claire"),
    [date, setDate] = useState(""),
    [title, setTitle] = useState("Coffee and a catch-up"),
    [place, setPlace] = useState<"coffee:local" | "park:local">("coffee:local"),
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
      title="Something to look forward to"
      kicker="Plans"
      error={q.error}
      loading={q.isLoading}
    >
      <p className="mb-5 text-sm text-muted-foreground">
        Shared gatherings you arrange here. Earlier dates kept only in chat memories remain in those
        conversations; this is not a complete imported calendar.
      </p>
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
              <option value="coffee:local">Switchyard Coffee</option>
              <option value="park:local">Juniper Commons</option>
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
      <div className="space-y-3">
        {q.data?.plans.map((p) => (
          <article key={p.id} className={card}>
            <p className="text-xs uppercase tracking-wider text-primary">{p.status}</p>
            <h2 className="my-2 font-display text-2xl">{p.title}</h2>
            <p className="text-sm">
              {new Date(p.starts_at).toLocaleString()} ·{" "}
              {q.data.places.find((v) => v.key === p.place_key)?.label ?? p.place_key}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {q.data.invitations
                .filter((i) => i.plan_id === p.id)
                .map((i) => (
                  <li key={i.character_key}>
                    {i.character_key} · {i.response}
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Your attendance: unreported. Characters’ private conversations are not shown.
            </p>
          </article>
        ))}
        {q.data && !q.data.plans.length && (
          <p className="py-6 text-sm text-muted-foreground">
            No gatherings arranged here yet. Existing dates and memories have not been changed.
          </p>
        )}
      </div>
    </TownLayout>
  );
}
