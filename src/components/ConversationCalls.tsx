import { Link } from "@tanstack/react-router";
import { PhoneMissed, ChevronRight } from "lucide-react";
import { usePhone } from "@/lib/phone-queries";
import { CallButton } from "./CallButton";

/** Call ledger UI only: opening this card never places or regenerates a call. */
export function MissedCallCard({
  conversationId,
  name,
  at,
}: {
  conversationId: string;
  name: string;
  at: string;
}) {
  return (
    <aside
      className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-2.5"
      aria-label={`Missed call from ${name}`}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <PhoneMissed size={17} />
      </span>
      <Link
        to="/calls"
        search={{ conversation: conversationId }}
        className="min-w-0 flex-1 rounded-lg text-sm"
      >
        <span className="block font-medium text-destructive">Missed call</span>
        <span className="block text-xs text-muted-foreground">
          <time dateTime={at}>
            {new Date(at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>{" "}
          · View history
        </span>
      </Link>
      <CallButton conversationId={conversationId} name={name} />
    </aside>
  );
}

export function ConversationCalls({
  conversationId,
  name,
}: {
  conversationId: string;
  name: string;
}) {
  const calls = usePhone(conversationId);
  if (calls.isError || !calls.data?.available) return null;
  const latest = calls.data.calls
    .filter((c) => c.conversation_id === conversationId)
    .sort((a, b) => b.offered_at.localeCompare(a.offered_at))[0];
  if (!latest) return null;
  if (latest.direction === "incoming" && latest.state === "missed")
    return <MissedCallCard conversationId={conversationId} name={name} at={latest.offered_at} />;
  return (
    <Link
      to="/calls"
      search={{ conversation: conversationId }}
      className="mx-auto flex min-h-11 w-full max-w-xl items-center justify-between px-4 text-xs text-muted-foreground"
    >
      <span>Recent calls with {name}</span>
      <ChevronRight size={14} aria-hidden="true" />
    </Link>
  );
}
