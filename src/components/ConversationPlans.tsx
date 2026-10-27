import { calendarStatus, eventTime, nextConversationPlan } from "@/lib/calendar-view";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useSchedule } from "@/lib/use-schedule";

export function ConversationPlanCard({
  id,
  title,
  status,
  location,
  time,
  active,
}: {
  id: string;
  title: string;
  status: string;
  location: string;
  time: string;
  active: boolean;
}) {
  return (
    <nav aria-label="Plans from this conversation" className="mx-auto w-full max-w-xl px-3 py-2">
      <Link
        to={active ? "/experiences" : "/plans"}
        search={active ? { plan: id } : {}}
        hash={active ? "" : `plan-${id}`}
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2.5"
      >
        <CalendarDays size={19} className="shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            <span className="shrink-0 text-[10px] font-medium text-primary">{status}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {time} · {location}
          </span>
        </span>
        <span className="sr-only">{active ? "Continue outing" : "View plan"}</span>
        <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </nav>
  );
}

export function ConversationPlans({ conversationId }: { conversationId: string }) {
  const q = useSchedule();
  if (q.error)
    return (
      <Link to="/plans" className="mx-auto w-full max-w-xl px-4 py-2 text-xs underline">
        Plan details unavailable · Review Plans
      </Link>
    );
  if (!q.data?.available) return null;
  const plan = nextConversationPlan(q.data.events, conversationId);
  if (!plan) return null;
  const day = plan.starts_at
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(plan.starts_at))
    : (plan.date_local ?? "Date undecided");
  return (
    <ConversationPlanCard
      id={plan.id}
      title={plan.title}
      status={plan.missing_details.length ? "Details needed" : calendarStatus(plan)}
      location={plan.venueLabel || "Location undecided"}
      time={`${day} · ${eventTime(plan)}`}
      active={
        ["interactive", "paused"].includes(plan.experience?.state ?? "") ||
        plan.status === "in_progress"
      }
    />
  );
}
