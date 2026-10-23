import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePhone } from "@/lib/phone-queries";
import { phoneAction } from "@/lib/phone-calls.functions";
import { characterFor } from "@/lib/characters";
import {
  fictionalNumber,
  CALL_LABELS,
  ACTIVE_CALL_STATES,
  type CallPreferences,
} from "@/lib/phone-calls";
import { TownLayout, card } from "@/components/TownLayout";
import { CallButton } from "@/components/CallButton";
import { toast } from "sonner";
export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({ meta: [
    { title: "Calls \u00b7 AI Town" },
    { name: "description", content: "Your fictional call history and voice preferences in AI Town." },
    { property: "og:title", content: "Calls \u00b7 AI Town" },
    { property: "og:description", content: "Your fictional call history and voice preferences in AI Town." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: Calls });
function Calls() {
  const q = usePhone(),
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
      <details open={!q.data?.configured} className={`${card} mb-5`}>
        <summary className="min-h-11 cursor-pointer font-medium">Call settings</summary>
        <p className="my-3 text-sm text-muted-foreground">
          This is a fictional in-app phone service. Numbers use the reserved 814-555-0100–0199 range
          and never dial a real carrier. Microphone audio is processed only during an answered call
          and is not saved.
        </p>
        {!q.data?.available ? (
          <p className="text-sm">Calls setup is incomplete. Existing Messages still works.</p>
        ) : (
          <>
            <p role="status" className="mb-3 text-sm">
              {q.data.configured
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
              This first version requires transcript consent to use the existing character memory
              engine. You can delete a call’s transcript below; retained memories and plans remain
              separate. Incoming ringing is available while this app is open. Closing the call
              screen ends microphone capture. Full-duplex WebRTC and native background ringing are
              not included.
            </p>
          </>
        )}
      </details>
      <h2 className="mb-3 text-lg font-semibold">Recents</h2>
      {!q.data?.calls.length && (
        <p className={`${card} text-sm text-muted-foreground`}>Your calls will appear here.</p>
      )}
      <div className="space-y-3">
        {q.data?.calls.map((c) => {
          const def = characterFor(c.character_key);
          return (
            <article key={c.id} className={`${card} space-y-2`}>
              <div className="flex items-center justify-between gap-3">
                <Link to="/call/$callId" params={{ callId: c.id }} className="min-w-0">
                  <h3 className="font-medium">{def.preferredName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {fictionalNumber(def.key)} ·{" "}
                    {c.direction === "incoming" ? "Incoming" : "Outgoing"}
                  </p>
                </Link>
                <CallButton conversationId={c.conversation_id} name={def.preferredName} />
              </div>
              <p className="text-sm">
                {c.state === "missed" && c.direction === "incoming"
                  ? "Missed call"
                  : (CALL_LABELS[c.state] ?? c.state)}
                {c.answered_at ? ` · ${c.duration_seconds}s` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(c.offered_at).toLocaleString("en-US", { timeZone: "America/New_York" })}{" "}
                Eastern
              </p>
              {c.summary && <p className="text-sm text-muted-foreground">{c.summary}</p>}
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
            </article>
          );
        })}
      </div>
    </TownLayout>
  );
}
