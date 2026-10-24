import { calendarStatus } from "@/lib/calendar-view";
import { Link } from "@tanstack/react-router";
import { useSchedule } from "@/lib/use-schedule";
export function ConversationPlans({ conversationId }: { conversationId: string }) {
  const q = useSchedule();
  if (q.error)
    return (
      <Link to="/plans" className="mx-auto w-full max-w-xl px-3 py-2 text-xs underline">
        Plan details unavailable · Review Plans
      </Link>
    );
  if (!q.data?.available) return null;
  const plans = q.data.events
    .filter(
      (p) =>
        p.conversation_id === conversationId &&
        !["completed", "missed", "cancelled", "declined"].includes(p.status),
    )
    .slice(0, 2);
  if (!plans.length) return null;
  return (
    <nav
      aria-label="Plans from this conversation"
      className="mx-auto flex w-full max-w-xl gap-2 overflow-x-auto px-3 py-2"
    >
      {plans.map((p) => (
        <Link
          key={p.id}
          to="/plans"
          hash={`plan-${p.id}`}
          className="shrink-0 rounded-full border bg-surface px-3 py-2 text-xs"
        >
          {p.title} · {calendarStatus(p)}
          {p.missing_details.length ? " · details needed" : ""}
        </Link>
      ))}
    </nav>
  );
}
