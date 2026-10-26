import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadVoiceHistory } from "@/lib/phone-calls.functions";
import { characterFor } from "@/lib/characters";
export function VoiceSessionHistory({ conversation }: { conversation?: string | undefined }) {
  const load = useServerFn(loadVoiceHistory);
  const q = useQuery({
    queryKey: ["voice-history", conversation],
    queryFn: () => load({ data: { conversation } }),
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <details className="mt-5 rounded-2xl border p-4" open>
      <summary className="min-h-11 cursor-pointer font-medium">Live voice sessions</summary>
      <p className="mb-3 text-xs text-muted-foreground">
        Answered incoming calls may also appear here. Older records do not store a link to their
        ringing entry or a reliable connection timestamp.
      </p>
      {q.isLoading && <p role="status">Loading voice history…</p>}
      {q.error && (
        <p role="alert">
          Voice session history unavailable.{" "}
          <button className="min-h-11 underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      )}
      {q.data?.length === 0 && <p className="text-sm">No voice sessions recorded.</p>}
      {q.data?.map((c) => (
        <article key={c.id} className="border-t py-3 text-sm">
          <p className="font-medium">{characterFor(c.character_key).preferredName}</p>
          <p>
            {c.state === "active"
              ? "Voice session active"
              : c.state === "failed"
                ? "Connection failed"
                : c.state === "closed"
                  ? "Voice session ended"
                  : "Connecting"}
          </p>
          <time dateTime={c.created_at}>
            {new Date(c.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}{" "}
            Eastern
          </time>
          {c.usage_seconds != null && <p>Reported usage: {c.usage_seconds}s</p>}
        </article>
      ))}
    </details>
  );
}
