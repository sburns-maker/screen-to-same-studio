import { ExperienceEntry } from "./ExperienceEntry";
import { Calendar } from "./ui/calendar";
import { useState, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTravelTrips } from "@/lib/travel.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { respondToCalendarPlan } from "@/lib/interactive-world.functions";
import { placeByKey } from "@/lib/place-registry";
import { easternDate } from "@/lib/calendar-logic";
import { card } from "./TownLayout";
export function CalendarBoard() {
  const travelList=useServerFn(listTravelTrips),
    travel=useQuery({queryKey:["travel-trips"],queryFn:()=>travelList()}),
    q = useInteractiveWorld(),
    respond = useServerFn(respondToCalendarPlan),
    cache = useQueryClient(),
    navigate = useNavigate();
  const pendingIds = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false),
    [day, setDay] = useState(""),
    [view, setView] = useState("all");
  async function act(
    planId: string,
    action: "accept" | "decline" | "cancel" | "details" | "reschedule",
  ) {
    setBusy(true);
    const key = JSON.stringify([planId, action]);
    const id = pendingIds.current.get(key) ?? crypto.randomUUID();
    pendingIds.current.set(key, id);
    try {
      const r = await respond({ data: { id, planId, action } });
      pendingIds.current.delete(key);
      await cache.invalidateQueries({ queryKey: ["interactive-world"] });
      await cache.invalidateQueries({ queryKey: ["messages", r.conversationId] });
      await navigate({ to: "/chat/$conversationId", params: { conversationId: r.conversationId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (q.isLoading) return <p role="status">Checking conversation invitations…</p>;
  if (q.error)
    return (
      <button className={`${card} mb-5 w-full text-left`} onClick={() => void q.refetch()}>
        Calendar sync unavailable · Retry
      </button>
    );
  if (!q.data?.available)
    return (
      <p className={`${card} mb-5 text-sm`}>
        Conversation invitations and venue activities require reviewed migration 0019. Existing
        gatherings remain below.
      </p>
    );
  const plans = q.data.plans.filter(
    (p) =>
      (!day || p.date_local === day) &&
      (view === "all" ||
        (view === "upcoming" && ["accepted", "in_progress"].includes(p.status)) ||
        (view === "attention" &&
          ["proposed", "awaiting_details", "rescheduled"].includes(p.status)) ||
        (view === "history" &&
          ["completed", "missed", "cancelled", "declined"].includes(p.status))),
  );
  const travelPlans=(travel.data??[]).filter(t=>t.startDate&&t.status!=="cancelled"&&(!day||t.startDate<=day&&(t.endDate??t.startDate)>=day)&& (view==="all" || view==="history"&&t.status==="completed" || view==="upcoming"&&["accepted","in_progress"].includes(t.status) || view==="attention"&&["idea","proposed"].includes(t.status)));
  const dates = [
    ...new Set([...q.data.plans.flatMap((p) => (p.date_local ? [p.date_local] : [])),...(travel.data??[]).flatMap(t=>t.startDate?[t.startDate]:[])]),
  ].sort();
  return (
    <section className="mb-8 space-y-4" aria-label="Conversation calendar">
      <div className={`${card} space-y-3`}>
        <h2 className="font-display text-2xl">Your social calendar</h2>
        <p className="text-xs text-muted-foreground">
          America/New_York · plans are not proof of attendance. Duration uses a clearly estimated
          one-hour planning window unless stated otherwise.
        </p>
        <div className="flex gap-2 overflow-x-auto" aria-label="Plan filters">
          {[
            ["all", "All"],
            ["upcoming", "Upcoming"],
            ["attention", "Needs attention"],
            ["history", "History"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={view === key}
              onClick={() => setView(key!)}
              className={`min-h-11 shrink-0 rounded-full border px-3 text-xs ${view === key ? "bg-primary text-primary-foreground" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          timeZone="America/New_York"
          selected={day ? new Date(`${day}T12:00:00-04:00`) : undefined}
          onSelect={(d) => setDay(d ? easternDate(d) : "")}
          modifiers={{
            planned: [...q.data.plans.flatMap((p) => p.date_local ? [new Date(`${p.date_local}T12:00:00Z`)] : []),...(travel.data??[]).flatMap(t=>t.startDate?[new Date(`${t.startDate}T12:00:00Z`)]:[])],
          }}
          modifiersClassNames={{
            planned: "font-bold underline decoration-primary underline-offset-4",
          }}
          className="mx-auto rounded-2xl border"
        />
        <label className="block text-sm">
          Filter by day
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="ml-3 rounded-lg border bg-background p-2"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setDay("")}
            className="shrink-0 rounded-full border px-3 py-2 text-xs"
          >
            All plans
          </button>
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className="shrink-0 rounded-full border px-3 py-2 text-xs"
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      {travelPlans.map(t=><article key={t.id} className={`${card} space-y-2`}><h3 className="font-display text-xl">{t.title}</h3><p className="text-sm">{t.startDate} · {t.destination} · {t.status}</p><p className="text-sm">{t.companions.length?t.companions.map(c=>`${c.characterKey}: ${c.response}`).join(" · "):"Solo trip"}</p><p className="text-xs text-muted-foreground">Travel itinerary · fictional plans, not tickets or reservations</p><Link to="/travel" className="text-sm underline">Open trip and invitations →</Link></article>)}
      {!plans.length && !travelPlans.length && (
        <p className="text-sm text-muted-foreground">
          No conversation plans in this view. A clear new invitation will appear automatically.
        </p>
      )}
      {plans.map((p) => {
        const place = placeByKey(p.place_key),
          terminal = ["completed", "missed", "cancelled", "declined"].includes(p.status);
        return (
          <article id={`plan-${p.id}`} key={p.id} className={`${card} space-y-3`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-2xl">{p.title}</h3>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs">
                {p.status.replaceAll("_", " ")}
              </span>
            </div>
            <ExperienceEntry planId={p.id} />
            <p className="text-sm">
              {p.date_local ?? "Date undecided"} · {p.time_local ?? "Time undecided"} Eastern ·{" "}
              {place?.label ?? "Venue undecided"}
            </p>
            <p className="text-xs text-muted-foreground">
              With {p.organizer} · You: {p.user_response} · {p.organizer}: {p.character_response} ·
              Attendance: {p.user_attendance.replaceAll("_", " ")}
            </p>
            {!!p.missing_details.length && (
              <p className="rounded-xl bg-muted p-3 text-sm">
                Still needed: {p.missing_details.join(", ")}
              </p>
            )}
            {!!p.conflicts.length && (
              <p role="status" className="rounded-xl border border-amber-500/50 p-3 text-sm">
                Not confirmed:{" "}
                {p.conflicts
                  .map((c) =>
                    c === "character_schedule_or_venue_hours"
                      ? "The character or venue is unavailable at that time"
                      : c === "calendar_or_travel_overlap"
                        ? "Another commitment overlaps, including travel time"
                        : "The timing needs review",
                  )
                  .join("; ")}
                . Discuss a different time; existing commitments have not changed.
              </p>
            )}
            {place && (
              <div className="text-xs text-muted-foreground">
                {place.address ??
                  "No verified street address. Use the fictional virtual map meeting point."}
                <Link
                  to="/place/$placeKey"
                  params={{ placeKey: place.key }}
                  className="mt-2 block text-sm text-primary underline"
                >
                  {["accepted", "in_progress"].includes(p.status)
                    ? "View destination and travel"
                    : "View proposed destination"}
                </Link>
              </div>
            )}
            {p.conversation_id && (
              <Link
                to="/chat/$conversationId"
                params={{ conversationId: p.conversation_id }}
                className="block text-sm underline"
              >
                Open related conversation
              </Link>
            )}
            {!terminal && (
              <div className="flex flex-wrap gap-2">
                {p.user_response !== "accepted" && (
                  <button
                    disabled={busy}
                    onClick={() => void act(p.id, "accept")}
                    className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
                  >
                    Accept invitation
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => void act(p.id, "details")}
                  className="rounded-full border px-4 py-2 text-sm"
                >
                  Ask for details
                </button>
                <button
                  disabled={busy}
                  onClick={() => void act(p.id, "reschedule")}
                  className="rounded-full border px-4 py-2 text-sm"
                >
                  Discuss a change
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(p.id, p.user_response === "accepted" ? "cancel" : "decline")
                  }
                  className="rounded-full border px-4 py-2 text-sm"
                >
                  {p.user_response === "accepted" ? "Cancel" : "Decline"}
                </button>
              </div>
            )}
            <details className="text-xs text-muted-foreground">
              <summary>Event history & follow-through</summary>
              <p className="mt-2">
                {p.followthrough &&
                typeof p.followthrough === "object" &&
                !Array.isArray(p.followthrough) &&
                p.followthrough["kind"] === "host_unavailable"
                  ? "Host confirmation is unavailable. Discuss a known public venue instead."
                  : p.place_key
                    ? "A virtual destination is available; a verified street address has not been supplied."
                    : "Venue details remain undecided."}
              </p>
              {q
                .data!.transitions.filter((t) => t.plan_id === p.id)
                .map((t, i) => (
                  <p key={i} className="mt-1">
                    {new Date(t.created_at).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })}
                    : {t.from_status} → {t.to_status} ·{" "}
                    {(
                      {
                        invite: "Invitation proposed",
                        accept: "Invitation accepted",
                        details: "Meeting details updated",
                        reschedule: "A new time was proposed",
                        cancel: "Plan canceled",
                        decline: "Invitation declined",
                        explicit_participation_and_departure:
                          "Participation and departure recorded",
                        elapsed_without_recorded_attendance:
                          "No attendance was recorded before the event ended",
                        scheduled_character_arrival_user_not_assumed:
                          "The character arrived for the accepted event",
                      } as Record<string, string>
                    )[t.reason] ?? "Plan updated"}
                  </p>
                ))}
            </details>
          </article>
        );
      })}
    </section>
  );
}
