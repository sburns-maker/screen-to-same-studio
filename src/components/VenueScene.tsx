import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { performVenueAction } from "@/lib/interactive-world.functions";
import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { placeByKey, ACTION_LABELS, type VenueAction } from "@/lib/place-registry";
import { type CharacterKey, characterFor } from "@/lib/characters";
import { messagesQuery } from "@/lib/tess-queries";
import { card } from "./TownLayout";
export function VenueScene({ placeKey }: { placeKey: string }) {
  const q = useInteractiveWorld(),
    act = useServerFn(performVenueAction),
    cache = useQueryClient();
  const pendingIds = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [talk, setTalk] = useState(""),
    [status, setStatus] = useState("");
  const p = placeByKey(placeKey),
    s = q.data?.session,
    here = s?.place_key === placeKey && !s.departed_at;
  const companions = (q.data?.companions ?? []).filter((c) => c.place_key === placeKey),
    plan = q.data?.plans.find((p) => p.id === talk),
    messages = useQuery(messagesQuery(plan?.conversation_id ?? undefined));
  async function action(
    action: VenueAction | "freeform" | "speak",
    planId?: string,
    character?: CharacterKey,
  ) {
    setBusy(true);
    const key = JSON.stringify([placeKey, action, text, planId, character]);
    const id = pendingIds.current.get(key) ?? crypto.randomUUID();
    pendingIds.current.set(key, id);
    try {
      const r = await act({
        data: { id, place: placeKey, action, text, planId, character },
      });
      pendingIds.current.delete(key);
      await cache.invalidateQueries({ queryKey: ["interactive-world"] });
      await cache.invalidateQueries({ queryKey: ["town"] });
      await cache.invalidateQueries({ queryKey: ["messages"] });
      setText("");
      setStatus(
        action === "leave"
          ? "You left the scene. Normal virtual travel home has started."
          : action === "order_coffee"
            ? "Virtual coffee order placed; no real purchase."
            : action === "speak"
              ? "Your words were sent through the normal character conversation. Reply timing and availability still apply."
              : `Recorded: ${ACTION_LABELS[action as VenueAction] ?? action}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (q.isLoading) return <p role="status">Preparing the venue…</p>;
  if (q.error)
    return (
      <button onClick={() => void q.refetch()} className={`${card} mb-4 w-full text-left`}>
        Venue state unavailable · Retry
      </button>
    );
  if (!q.data?.available)
    return (
      <p className={`${card} mb-4 text-sm`}>
        Interactive venue scenes require reviewed migration 0019.
      </p>
    );
  if (!p || !here) return null;
  const activePlans = q.data.plans.filter(
    (x) => x.place_key === placeKey && ["accepted", "in_progress"].includes(x.status),
  );
  const visitState = s.state as {
    position?: string;
    last_activity?: VenueAction;
    order?: { item?: string; quantity?: number };
  };
  const sessionActions = q.data.actions.filter(
    (a) => (a as { session_id?: string }).session_id === s.id,
  );
  return (
    <section aria-label="Interactive venue" className="mb-6 space-y-4">
      <div className={`${card} overflow-hidden bg-gradient-to-br from-primary/15 to-surface`}>
        <div className="mb-3 text-6xl" aria-hidden="true">
          {p.marker.icon}
        </div>
        <h2 className="font-display text-3xl">A moment at {p.label}</h2>
        <p className="mt-3 text-sm">{p.description}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Virtual scene ·{" "}
          {new Date().toLocaleString("en-US", {
            timeZone: "America/New_York",
            weekday: "long",
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          Eastern ·{" "}
          {companions.length
            ? `${companions.length} confirmed companion(s) here`
            : "A quiet moment; no established companion has arrived."}
        </p>
      </div>
      <div className={`${card} space-y-2 text-sm`}>
        <h3 className="font-medium">This visit</h3>
        <p>
          {visitState.position ? `Position: ${visitState.position}. ` : ""}
          {visitState.order
            ? `Virtual order: ${visitState.order.quantity ?? 1} ${visitState.order.item ?? "item"}; no real purchase. `
            : ""}
          {visitState.last_activity ? `Activity: ${ACTION_LABELS[visitState.last_activity]}.` : ""}
          {Object.keys(visitState).length === 0 ? "No actions recorded yet." : ""}
        </p>
        {sessionActions.slice(0, 6).map((a) => (
          <p key={a.id} className="text-xs text-muted-foreground">
            {new Date(a.created_at).toLocaleTimeString()} ·{" "}
            {ACTION_LABELS[a.action as VenueAction] ?? a.action}
          </p>
        ))}
      </div>
      {status && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          {status}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {p.activities.map((a) => (
          <button
            key={a}
            disabled={busy}
            onClick={() =>
              void action(
                a,
                ["join", "discuss"].includes(a)
                  ? activePlans.find(
                      (x) =>
                        x.status === "in_progress" && companions.some((c) => c.plan_id === x.id),
                    )?.id
                  : undefined,
              )
            }
            className="min-h-12 rounded-2xl border bg-surface px-3 py-3 text-sm disabled:opacity-50"
          >
            {ACTION_LABELS[a]}
          </button>
        ))}
      </div>
      {activePlans.map((x) => (
        <div key={x.id} className={`${card} text-sm`}>
          <p className="font-medium">
            {x.title} · {x.time_local} Eastern
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {x.status === "accepted"
              ? "You may have arrived early. Your companion has not been placed here yet."
              : `Event in progress. Participation: ${x.user_attendance.replaceAll("_", " ")}`}
          </p>
          <Link to="/plans" hash={`plan-${x.id}`} className="mt-2 block underline">
            Event details
          </Link>
        </div>
      ))}
      {!!companions.length && (
        <div className={`${card} space-y-3`}>
          <h3 className="font-medium">Talk with a companion</h3>
          {companions.map((c) => (
            <button
              key={c.character_key}
              onClick={() => setTalk(c.plan_id)}
              className="mr-2 rounded-full border px-3 py-2 text-sm"
            >
              {characterFor(c.character_key).preferredName}
            </button>
          ))}
          {talk && (
            <p className="text-xs text-muted-foreground">
              Talking to {plan?.organizer}; this uses their ordinary messaging, memory and pacing
              system.
            </p>
          )}
        </div>
      )}
      {talk && plan && (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border p-3">
          {(messages.data ?? [])
            .filter(
              (m) =>
                Date.parse(m.visible_at) <= Date.now() &&
                Date.parse(m.created_at) >= Date.parse(s.arrived_at),
            )
            .slice(-8)
            .map((m) => (
              <p
                key={m.id}
                className={`rounded-xl p-3 text-sm ${m.sender === "user" ? "bg-primary/10" : "bg-surface"}`}
              >
                {m.body}
              </p>
            ))}
          <Link
            to="/chat/$conversationId"
            params={{ conversationId: plan.conversation_id! }}
            className="text-xs underline"
          >
            Full conversation and media
          </Link>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(
            talk ? "speak" : "freeform",
            talk || undefined,
            plan?.organizer as CharacterKey | undefined,
          );
        }}
        className="space-y-2"
      >
        <label className="text-sm">
          {talk ? "What do you say?" : "What would you like to do?"}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1500}
            className="mt-2 min-h-24 w-full rounded-2xl border bg-background p-3"
            placeholder={
              talk
                ? "Ask about the book or respond naturally…"
                : "Sit, order coffee for two, look around, browse…"
            }
          />
        </label>
        <button
          disabled={busy || !text.trim()}
          className="min-h-12 w-full rounded-full bg-primary p-3 text-primary-foreground"
        >
          {busy ? "Recording…" : talk ? "Speak through the normal conversation" : "Try this action"}
        </button>
        {talk && (
          <button
            type="button"
            onClick={() => setTalk("")}
            className="min-h-11 w-full text-sm underline"
          >
            Back to venue actions
          </button>
        )}
      </form>
      <button
        disabled={busy}
        onClick={() => void action("leave")}
        className="min-h-12 w-full rounded-full border p-3 text-sm"
      >
        Leave this visit and head home virtually
      </button>
    </section>
  );
}
