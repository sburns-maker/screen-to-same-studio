import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { housingDiagnostics } from "@/lib/housing.functions";
export function HousingDiagnostics() {
  const load = useServerFn(housingDiagnostics),
    q = useQuery({ queryKey: ["housing-diagnostics"], queryFn: () => load(), retry: false });
  return (
    <div className="space-y-3 text-sm">
      <p>
        {q.data?.available
          ? `${q.data.homes} stable residential locations`
          : "Housing migration unavailable"}
      </p>
      {q.error && <p role="alert">Housing diagnostics unavailable.</p>}
      {q.data?.proposals.map((p) => (
        <p key={p.id}>
          Proposal {p.id}: {p.status} · revision {p.version} · plan {p.plan_id ?? "none"}
          <br />
          {Object.entries(p.responses)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      ))}
      {q.data?.failures.map((f) => (
        <p key={f.source_id}>
          Source {f.source_id}: {f.failure}. Conversation preserved.
        </p>
      ))}
      <button className="min-h-11 underline" onClick={() => void q.refetch()}>
        Refresh housing diagnostics
      </button>
    </div>
  );
}
