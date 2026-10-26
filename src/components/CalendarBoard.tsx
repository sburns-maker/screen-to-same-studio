import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar } from "./ui/calendar";
import { ExperienceEntry } from "./ExperienceEntry";
import { useSchedule, invalidateSchedule } from "@/lib/use-schedule";
import { respondToCalendarPlan } from "@/lib/interactive-world.functions";
import { createPlanDraft, editCalendarPlan } from "@/lib/scheduling.functions";
import { PlanEditor } from "./PlanEditor";
import { PLACE_REGISTRY } from "@/lib/place-registry";
import { easternDate } from "@/lib/calendar-logic";
import { calendarWeek, eventDay, eventTime, calendarStatus } from "@/lib/calendar-view";
import { card } from "./TownLayout";
const views = [
  ["upcoming", "Upcoming"],
  ["invitations", "Invitations"],
  ["active", "Active"],
  ["completed", "Recent history"],
] as const;
export function CalendarBoard() {
  const q = useSchedule(),
    respond = useServerFn(respondToCalendarPlan),
    create = useServerFn(createPlanDraft),
    edit = useServerFn(editCalendarPlan),
    cache = useQueryClient(),
    navigate = useNavigate();
  const [mode, setMode] = useState<"month" | "week" | "agenda">("month"),
    [filter, setFilter] = useState("upcoming"),
    [day, setDay] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState(false),
    [editing, setEditing] = useState("");
  const [contact, setContact] = useState(""),
    [title, setTitle] = useState("Coffee together"),
    [category, setCategory] = useState("coffee"),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [place, setPlace] = useState(""),
    [duration, setDuration] = useState(60),
    [agreed, setAgreed] = useState(false);
  const pending = useRef(new Map<string, string>());
  function actionId(key: string) {
    const id = pending.current.get(key) ?? crypto.randomUUID();
    pending.current.set(key, id);
    return id;
  }
  async function act(
    planId: string,
    action: "accept" | "decline" | "cancel" | "reschedule" | "details",
  ) {
    setBusy(true);
    const key = planId + action;
    try {
      const r = await respond({ data: { id: actionId(key), planId, action } });
      pending.current.delete(key);
      await invalidateSchedule(cache);
      if (!r.manual)
        await navigate({
          to: "/chat/$conversationId",
          params: { conversationId: r.conversationId },
        });
      else toast.success("Calendar updated. No message sent.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function draft(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const key = JSON.stringify([contact, title, category, date, time, place, duration, agreed]);
    try {
      const r = await create({
        data: {
          id: actionId(key),
          conversationId: contact,
          confirmed: agreed,
          plan: {
            action: "invite",
            planId: null,
            parentPlanId: null,
            title,
            description: null,
            category: category as "coffee" | "dinner" | "walk" | "book_club" | "meetup",
            date: date || null,
            time: time || null,
            timeHint: null,
            timeZone: "America/New_York",
            place: place || null,
            durationMinutes: duration,
            userQuote: null,
          },
        },
      });
      pending.current.delete(key);
      setManual(false);
      await invalidateSchedule(cache);
      toast.success(
        q.data?.manual
          ? r.status === "accepted"
            ? "Agreed plan added. No message sent."
            : "Plan saved; check missing details or conflicts."
          : r.replyPending
            ? "Invitation saved; character reply is pending."
            : "Invitation saved.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (q.isLoading) return <p role="status">Loading your calendar…</p>;
  if (q.error)
    return (
      <div className={card} role="alert">
        <p>Calendar could not be loaded. Existing plans are safe.</p>
        <button className="min-h-11 underline" onClick={() => void q.refetch()}>
          Retry
        </button>
      </div>
    );
  if (!q.data?.available)
    return <p className={card}>Calendar setup requires reviewed migration 0019.</p>;
  const events = q.data.events,
    today = easternDate(new Date()),
    week = calendarWeek(day || today);
  const sorted = [...events].sort((a, b) =>
    String(a.starts_at ?? "9999").localeCompare(String(b.starts_at ?? "9999")),
  );
  const shown = sorted.filter(
    (e) =>
      (!day || eventDay(e) === day) &&
      (filter === "invitations"
        ? ["proposed", "awaiting_details", "rescheduled"].includes(e.status)
        : filter === "active"
          ? ["interactive", "paused"].includes(e.experience?.state ?? "") ||
            e.status === "in_progress"
          : filter === "completed"
            ? ["completed", "cancelled", "declined", "missed"].includes(e.status)
            : !["completed", "cancelled", "declined", "missed"].includes(e.status)),
  );
  return (
    <section aria-label="Social calendar" className="mb-8 space-y-4">
      <div className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Your calendar</h2>
            <p className="text-xs text-muted-foreground">World time · America/New_York</p>
          </div>
          <button
            disabled={!q.data.structured}
            onClick={() => setManual(!manual)}
            className="min-h-11 rounded-full border px-4 text-sm"
          >
            {q.data.manual ? "Add agreed plan" : "New invitation"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {q.data.manual
            ? "After you agree in conversation, add the plan here. Conversation sweeps do not rewrite or cancel it, and saving sends no message."
            : "Make plans naturally in Messages or during an outing. Mutual agreement confirms them here. A plan is not evidence that it happened."}
        </p>
        <div className="flex gap-2" aria-label="Calendar views">
          {(["month", "week", "agenda"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
              className={`min-h-11 rounded-full border px-4 text-sm capitalize ${mode === v ? "bg-primary text-primary-foreground" : ""}`}
            >
              {v}
            </button>
          ))}
        </div>
        {mode === "month" && (
          <Calendar
            mode="single"
            timeZone="America/New_York"
            selected={day ? new Date(day + "T12:00:00Z") : undefined}
            onSelect={(d) => setDay(d ? easternDate(d) : "")}
            modifiers={{
              planned: events.flatMap((e) =>
                eventDay(e) ? [new Date(eventDay(e) + "T12:00:00Z")] : [],
              ),
            }}
            modifiersClassNames={{
              planned: "font-bold underline decoration-primary underline-offset-4",
            }}
          />
        )}
        {mode === "week" && (
          <>
            <div className="flex justify-between">
              <button
                className="min-h-11 underline"
                onClick={() =>
                  setDay(
                    new Date(Date.parse(week[0]! + "T12:00Z") - 7 * 86400000)
                      .toISOString()
                      .slice(0, 10),
                  )
                }
              >
                Previous week
              </button>
              <button
                className="min-h-11 underline"
                onClick={() =>
                  setDay(
                    new Date(Date.parse(week[0]! + "T12:00Z") + 7 * 86400000)
                      .toISOString()
                      .slice(0, 10),
                  )
                }
              >
                Next week
              </button>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[630px] grid-cols-7 gap-2" aria-label="Weekly calendar">
                {week.map((d) => (
                  <div key={d} className="min-h-32 rounded-xl border p-2">
                    <button
                      aria-pressed={day === d}
                      onClick={() => setDay(d)}
                      className="min-h-11 text-xs font-medium"
                    >
                      {new Date(d + "T12:00Z").toLocaleDateString("en-US", {
                        timeZone: "America/New_York",
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </button>
                    {sorted
                      .filter((e) => eventDay(e) === d)
                      .map((e) => (
                        <button
                          key={e.id}
                          onClick={() => {
                            setDay(d);
                            setSelected(e.id);
                          }}
                          className="mb-2 block w-full rounded-lg bg-primary/10 p-2 text-left text-xs"
                        >
                          <strong className="block">{e.title}</strong>
                          {eventTime(e)}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {day && (
          <button className="min-h-11 text-sm underline" onClick={() => setDay("")}>
            Clear day filter · {day}
          </button>
        )}
      </div>
      {manual && (
        <form
          onSubmit={(ev) => void draft(ev)}
          className={`${card} grid gap-3 sm:grid-cols-2`}
          aria-label={q.data.manual ? "Add agreed plan" : "New calendar invitation"}
        >
          <label className="text-sm">
            Contact
            <select
              required
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            >
              <option value="">Choose a contact</option>
              {q.data.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Activity
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            />
          </label>
          <label className="text-sm">
            Type
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            >
              {["coffee", "dinner", "walk", "book_club", "meetup"].map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            />
          </label>
          <label className="text-sm">
            Time · Eastern
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            />
          </label>
          <label className="text-sm">
            Place
            <select
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            >
              <option value="">Undecided</option>
              {[...PLACE_REGISTRY.filter((p) => p.public), ...(q.data?.residences ?? [])].map(
                (p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-sm">
            Duration · minutes
            <input
              type="number"
              min={15}
              max={360}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
            />
          </label>
          {q.data.manual && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(ev) => setAgreed(ev.target.checked)}
              />
              We already agreed to this plan.
            </label>
          )}
          <button
            disabled={busy || !contact || (q.data.manual && !agreed)}
            className="min-h-11 rounded-full bg-primary px-4 text-primary-foreground"
          >
            {q.data.manual ? "Save to calendar" : "Send invitation"}
          </button>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Inviting someone does not assume their acceptance. Missing details remain pending.
          </p>
        </form>
      )}
      <div className="flex gap-2 overflow-x-auto" aria-label="Agenda filters">
        {views.map(([v, label]) => (
          <button
            key={v}
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${filter === v ? "bg-primary text-primary-foreground" : ""}`}
          >
            {label}
            <span className="sr-only"> events</span>
          </button>
        ))}
      </div>
      {!shown.length && (
        <p className="rounded-2xl border p-5 text-sm text-muted-foreground">
          No {filter === "upcoming" ? "upcoming plans" : filter} for this view. Your saved history
          is preserved.
        </p>
      )}
      {shown.map((e) => {
        const active = ["interactive", "paused", "auto_running"].includes(
          e.experience?.state ?? "",
        );
        return (
          <article
            key={e.id}
            className={`${card} space-y-3`}
            id={`plan-${e.id}`}
            data-event-id={e.id}
          >
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => setSelected(selected === e.id ? "" : e.id)}
                className="min-h-11 text-left font-display text-xl"
              >
                {e.title}
              </button>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs">
                {calendarStatus(e)}
              </span>
            </div>
            <p className="text-sm">
              {eventDay(e) ?? "Date undecided"} · {eventTime(e)} · {e.venueLabel}
            </p>
            <p className="text-sm text-muted-foreground">
              {e.participants.map((p) => p.name).join(" · ")}
            </p>
            {e.parent_plan_id && (
              <p className="text-xs text-muted-foreground">
                Continues{" "}
                {events.find((p) => p.id === e.parent_plan_id)?.title ?? "an earlier outing"}
                {e.time_hint === "after_parent" ? " · starts after that outing and travel" : ""}
              </p>
            )}
            {e.missing_details.length > 0 && (
              <p className="rounded-xl bg-muted p-3 text-sm">
                Still needed: {e.missing_details.join(", ")}
                {e.time_hint && e.time_hint !== "after_parent" ? ` (${e.time_hint})` : ""}
              </p>
            )}
            {e.residentialReview && (
              <p role="status" className="rounded-xl border border-amber-500/40 p-3 text-sm">
                {e.residentialReview}
              </p>
            )}
            {e.conflicts.length > 0 && (
              <p role="status" className="rounded-xl border border-amber-500/40 p-3 text-sm">
                Scheduling conflict:{" "}
                {e.conflicts
                  .map((c) =>
                    c === "calendar_or_travel_overlap"
                      ? "Another confirmed plan or travel overlaps this time."
                      : "Character availability or venue hours need another time.",
                  )
                  .join(" ")}
              </p>
            )}
            {selected === e.id && (
              <div className="space-y-2 border-t pt-3 text-sm">
                <p>{e.description || "Details come from your conversation and shared plans."}</p>
                <p>
                  Planned duration: {e.duration_minutes} minutes · {e.time_zone}
                </p>
                <ul>
                  {e.participants.map((p) => (
                    <li key={p.key}>
                      {p.name}: {p.response}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Attendance: {e.user_attendance.replaceAll("_", " ")}. Event {e.id}
                </p>
              </div>
            )}
            {e.origin === "housing" && (
              <Link to="/explore" className="block min-h-11 text-sm underline">
                Manage housing agreement & consent
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              {e.conversation_id && (
                <>
                  <Link
                    to="/chat/$conversationId"
                    params={{ conversationId: e.conversation_id }}
                    className="min-h-11 rounded-full border px-4 py-3 text-sm"
                  >
                    Conversation
                  </Link>
                  {!active &&
                    !["completed", "cancelled", "declined", "missed"].includes(e.status) && (
                      <>
                        {(q.data.manual
                          ? e.status !== "accepted"
                          : e.user_response !== "accepted") && (
                          <button
                            disabled={busy}
                            onClick={() => void act(e.id, "accept")}
                            className="min-h-11 rounded-full border px-4 text-sm"
                          >
                            {q.data.manual ? "We agreed — confirm" : "Accept"}
                          </button>
                        )}
                        {["proposed", "awaiting_details", "rescheduled"].includes(e.status) && (
                          <button
                            disabled={busy}
                            onClick={() => void act(e.id, "decline")}
                            className="min-h-11 rounded-full border px-4 text-sm"
                          >
                            Decline
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() =>
                            q.data.manual ? setEditing(e.id) : void act(e.id, "details")
                          }
                          className="min-h-11 rounded-full border px-4 text-sm"
                        >
                          {q.data.manual ? "Edit details" : "Request details"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            q.data.manual ? setEditing(e.id) : void act(e.id, "reschedule")
                          }
                          className="min-h-11 rounded-full border px-4 text-sm"
                        >
                          Reschedule
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void act(e.id, "cancel")}
                          className="min-h-11 rounded-full border px-4 text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                </>
              )}
              {e.origin === "conversation" &&
                !active &&
                !["completed", "cancelled", "declined", "missed"].includes(e.status) && (
                  <button
                    onClick={() => setEditing(editing === e.id ? "" : e.id)}
                    className="min-h-11 rounded-full border px-4 text-sm"
                  >
                    Edit
                  </button>
                )}
              {e.place_key && (
                <Link
                  to="/place/$placeKey"
                  params={{ placeKey: e.place_key }}
                  className="min-h-11 rounded-full border px-4 py-3 text-sm"
                >
                  View venue / travel
                </Link>
              )}
            </div>
            {editing === e.id && (
              <PlanEditor
                residences={q.data?.residences}
                manual={q.data.manual}
                plan={e}
                onCancel={() => setEditing("")}
                onSave={async (v) => {
                  try {
                    const key = JSON.stringify(["edit", e.id, e.version, v]);
                    const result = await edit({
                      data: { id: actionId(key), version: e.version, planId: e.id, ...v },
                    });
                    pending.current.delete(key);
                    await invalidateSchedule(cache);
                    setEditing("");
                    toast.success(
                      result.status === "accepted"
                        ? "Plan confirmed"
                        : "Changes saved; check pending details or the character’s response.",
                    );
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
            )}
            {e.origin === "conversation" && <ExperienceEntry planId={e.id} />}
            {active && (
              <p className="text-xs text-muted-foreground">
                Your experience is protected. Resolve it in the experience screen before changing
                the outing.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
