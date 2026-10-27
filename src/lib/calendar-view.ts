import { easternDate } from "./calendar-logic";
export function calendarWeek(day: string) {
  const d = new Date(day + "T12:00:00Z");
  const offset = (d.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) =>
    new Date(d.getTime() + (i - offset) * 86400000).toISOString().slice(0, 10),
  );
}
export function eventDay(event: { starts_at: string | null; date_local: string | null }) {
  return event.starts_at ? easternDate(new Date(event.starts_at)) : event.date_local;
}
export function eventTime(event: {
  starts_at: string | null;
  time_zone?: string;
  time_local: string | null;
  time_hint?: string | null;
}) {
  if (!event.starts_at) return event.time_hint ?? event.time_local ?? "Time undecided";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: event.time_zone ?? "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(event.starts_at));
}
export function calendarStatus(event: { status: string; experience?: { state: string } | null }) {
  if (event.experience?.state === "paused") return "Paused experience";
  if (event.experience?.state === "interactive") return "Active experience";
  return (
    (
      {
        accepted: "Confirmed",
        in_progress: "In progress",
        awaiting_details: "Awaiting details",
        proposed: "Invitation",
        rescheduled: "New time proposed",
        cancelled: "Canceled",
        completed: "Completed",
        declined: "Declined",
        missed: "Unresolved / missed",
      } as Record<string, string>
    )[event.status] ?? event.status
  );
}

/** Active outing first, then the nearest confirmed plan, then incomplete invitations. */
export function nextConversationPlan<T extends {
  conversation_id: string | null; status: string; starts_at: string | null;
  experience?: { state: string } | null;
}>(events: readonly T[], conversationId: string): T | undefined {
  const priority = (p: T) => ["interactive", "paused"].includes(p.experience?.state ?? "") || p.status === "in_progress" ? 0 : p.status === "accepted" ? 1 : 2;
  return events.filter(p => p.conversation_id === conversationId &&
    !["completed", "missed", "cancelled", "declined"].includes(p.status))
    .sort((a, b) => priority(a) - priority(b) ||
      (a.starts_at ? Date.parse(a.starts_at) : Infinity) - (b.starts_at ? Date.parse(b.starts_at) : Infinity))[0];
}

/** Same bounded fictional continuation window enforced by calendar_followup_ready. */
export function followupCanStart(
  child: { status: string; starts_at: string | null },
  parent: { ends_at: string | null } | undefined,
  scene: { mode: string | null; state: string; updated_at: string } | undefined,
  now: Date,
) {
  return (
    child.status === "accepted" &&
    !!child.starts_at &&
    !!parent?.ends_at &&
    scene?.mode === "interactive" &&
    scene.state === "completed" &&
    Date.parse(scene.updated_at) >= now.getTime() - 4 * 3600000 &&
    Date.parse(child.starts_at) >= Date.parse(parent.ends_at) &&
    Date.parse(child.starts_at) <= Date.parse(parent.ends_at) + 3 * 3600000
  );
}
