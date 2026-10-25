import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { scheduleDiagnostics } from "@/lib/scheduling.functions";
export function SchedulingDebug({ conversationId }: { conversationId: string }) {
  const load = useServerFn(scheduleDiagnostics);
  const q = useQuery({
    queryKey: ["schedule-diagnostics", conversationId],
    queryFn: () => load({ data: { conversationId } }),
    refetchInterval: 15000,
    retry: false,
  });
  if (q.error)
    return (
      <p role="alert">
        Calendar diagnostics unavailable. Check developer authorization and migration 0038.
      </p>
    );
  if (!q.data) return <p>Loading calendar diagnostics…</p>;
  return (
    <div className="space-y-3 text-sm">
      <p>Atomic scheduling contract: {q.data.structured ? "ready" : "migration 0038 required"}</p>
      {q.data.events.map((p) => (
        <article key={p.id} className="space-y-1 rounded-xl border p-3">
          <strong>{p.title}</strong>
          <p>
            {p.id} · revision {p.version} · {p.status}
          </p>
          <p>
            {p.date_local ?? "Date missing"} {p.time_local ?? p.time_hint ?? "Time missing"} ·{" "}
            {p.time_zone} · {p.venueLabel}
          </p>
          <p>
            User: {p.user_response} · character: {p.character_response}
          </p>
          <p>
            Experience: {p.experience?.state ?? "not claimed"} · parent:{" "}
            {p.parent_plan_id ?? "none"}
          </p>
          <p>
            Missing: {p.missing_details.join(", ") || "none"} · conflicts:{" "}
            {p.conflicts.join(", ") || "none"}
          </p>
        </article>
      ))}
      <details>
        <summary>Recent persistence receipts</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(q.data.receipts, null, 2)}
        </pre>
      </details>
    </div>
  );
}
