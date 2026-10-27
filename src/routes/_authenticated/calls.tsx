import { PhoneIncoming, PhoneOutgoing, PhoneMissed, ChevronRight } from "lucide-react";
import { VoiceSessionHistory } from "@/components/VoiceSessionHistory";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePhone } from "@/lib/phone-queries";
import { phoneAction } from "@/lib/phone-calls.functions";
import { characterFor } from "@/lib/characters";
import {
  CALL_LABELS,
  ACTIVE_CALL_STATES,
  type CallPreferences,
} from "@/lib/phone-calls";
import { TownLayout, card } from "@/components/TownLayout";
import { CallButton } from "@/components/CallButton";
import { RingtoneSettings } from "@/components/RingtoneSettings";
import { z } from "zod";
import { toast } from "sonner";
export const Route = createFileRoute("/_authenticated/calls")({
  validateSearch: z.object({ conversation: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Calls \u00b7 AI Town" },
      {
        name: "description",
        content: "Your fictional call history and voice preferences in AI Town.",
      },
      { property: "og:title", content: "Calls \u00b7 AI Town" },
      {
        property: "og:description",
        content: "Your fictional call history and voice preferences in AI Town.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Calls,
});
function Calls() {
  const { conversation } = Route.useSearch();
  const q = usePhone(conversation),
    act = useServerFn(phoneAction);
  async function preferences(patch: Partial<CallPreferences>) {
    if (!q.data) return;
    try {
      await act({
        data: {
          id: crypto.randomUUID(),
          command: "preferences",
          preferences: { ...q.data.preferences, ...patch },
        },
      });
      await q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <TownLayout title="Calls" kicker="Your phone" loading={q.isLoading} error={q.error}>
      <details open={!q.data?.available || (!q.data?.configured && !q.data?.incomingLive)} className={`${card} mb-5`}>
        <summary className="min-h-11 cursor-pointer font-medium">Call settings</summary>
        <p className="my-3 text-sm text-muted-foreground">
          This is a fictional in-app phone service. Contact numbers are display-only identifiers and
          cannot dial or text a real phone. Microphone audio is processed only during an answered
          call and is not saved.
        </p>
        {!q.data?.available ? (
          <p className="text-sm">Calls setup is incomplete. Existing Messages still works.</p>
        ) : (
          <>
            <p role="status" className="mb-3 text-sm">
              {q.data.incomingLive
                ? "Live voice is enabled. Each contact needs their saved voice."
                : q.data.configured
                ? "Voice service configured. Live audio quality still needs device testing."
                : "Voice connection is not configured and validated. Calls cannot connect until setup is completed."}
            </p>
            {(
              [
                ["enabled", "Allow outgoing calls"],
                ["incoming", "Allow occasional incoming calls"],
                ["save_transcripts", "Save call transcripts in Messages until I delete them"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-12 items-center justify-between gap-4 border-t py-3 text-sm"
              >
                {label}
                <input
                  type="checkbox"
                  checked={q.data!.preferences[key]}
                  onChange={(e) => void preferences({ [key]: e.target.checked })}
                />
              </label>
            ))}
            <p className="mt-3 text-xs text-muted-foreground">
              Transcript consent lets characters remember the conversations you actually had. You can delete a call’s transcript below; retained memories and plans remain
              separate. Closing the call screen ends microphone capture. Background notification delivery depends on this device’s permissions; native background ringing needs Android integration.
            </p>
          </>
        )}
      </details>
      <details className={`${card} mb-5`}><summary className="min-h-11 cursor-pointer font-medium">Ringtone and sound</summary><div className="pt-3"><RingtoneSettings /></div></details>
      {conversation && (
        <Link to="/calls" search={{}} className="mb-4 block underline">
          All contacts’ calls
        </Link>
      )}
      <h2 className="mb-3 text-lg font-semibold">
        {conversation && q.data?.calls[0]
          ? `${characterFor(q.data.calls[0].character_key).preferredName} · `
          : ""}
        Recents
      </h2>
      {q.data && !q.data.calls.length && (
        <p className={`${card} text-sm text-muted-foreground`}>
          No calls recorded{conversation ? " for this conversation" : ""}.
        </p>
      )}
      <div className="divide-y overflow-hidden rounded-2xl border bg-surface">
        {q.data?.calls.map((c) => {
          const def = characterFor(c.character_key);
          return (
            <article key={c.id} className="px-3 py-3 sm:px-4">
              <div className="flex min-h-14 items-center gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{c.state === "missed" ? <PhoneMissed className="h-5 w-5" /> : c.direction === "incoming" ? <PhoneIncoming className="h-5 w-5" /> : <PhoneOutgoing className="h-5 w-5" />}</span>
                <Link to="/call/$callId" params={{ callId: c.id }} className="min-w-0 flex-1">
                  <h3 className="font-medium">{def.preferredName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {c.state === "missed" ? "Missed" : c.direction === "incoming" ? "Incoming" : "Outgoing"} · {new Date(c.offered_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </Link>
                <CallButton conversationId={c.conversation_id} name={def.preferredName} />
              </div>
              <p
                className={
                  c.state === "missed" ? "text-sm font-medium text-destructive" : "text-sm"
                }
              >
                {c.state === "missed" && c.direction === "incoming"
                  ? "Missed call"
                  : (CALL_LABELS[c.state] ?? c.state)}
                {c.answered_at
                  ? ` · ${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s`
                  : " · Not answered"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(c.offered_at).toLocaleString("en-US", { timeZone: "America/New_York" })}{" "}
                Eastern
              </p>
              <details className="mt-1 text-sm"><summary className="flex min-h-9 cursor-pointer items-center gap-1 text-xs text-muted-foreground">Details <ChevronRight className="h-3.5 w-3.5" /></summary><div className="pt-2">              {c.summary && <p className="text-sm text-muted-foreground">{c.summary}</p>}
              {!ACTIVE_CALL_STATES.includes(c.state) && (
                <div className="flex flex-wrap gap-3">
                  <button
                    className="min-h-11 text-xs underline"
                    onClick={() =>
                      void act({ data: { id: c.id, command: "callback" } })
                        .then(() =>
                          toast.message(
                            "Callback requested in Messages. They can decide whether to call.",
                          ),
                        )
                        .catch(() => toast.error("Callback request unavailable"))
                    }
                  >
                    Request a callback
                  </button>
                  <Link
                    to="/chat/$conversationId"
                    params={{ conversationId: c.conversation_id }}
                    className="min-h-11 py-3 text-xs underline"
                  >
                    Message or request a callback
                  </Link>
                  <button
                    className="min-h-11 text-xs underline"
                    onClick={() =>
                      void act({ data: { id: c.id, command: "delete_transcript" } })
                        .then(() => q.refetch())
                        .catch(() => toast.error("Transcript could not be removed"))
                    }
                  >
                    Delete transcript
                  </button>
                </div>
              )}
              </div></details>
            </article>
          );
        })}
      </div>
      <VoiceSessionHistory conversation={conversation} />
    </TownLayout>
  );
}
