import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { useTown } from "@/lib/town-queries";
import { placeByKey, ACTION_LABELS, type VenueAction } from "@/lib/place-registry";
export function InteractiveWorldDebug() {
  const q = useInteractiveWorld(),
    town = useTown();
  if (q.error) return <p role="alert">Calendar/venue diagnostics unavailable: {q.error.message}</p>;
  if (!q.data?.available) return <p>Migration 0019 is not available.</p>;
  const pos = town.data?.presence,
    place = placeByKey(pos?.place_key),
    travelling = pos && Date.parse(pos.arrives_at) > Date.now();
  return (
    <div className="space-y-3 text-sm">
      <p>
        Player: {travelling ? "travelling toward" : "at"}{" "}
        {place?.label ?? pos?.place_key ?? "virtual home"} · Arrival{" "}
        {pos?.arrives_at ?? "not travelling"}
      </p>
      <p>
        Active session: {q.data.session?.id ?? "none"} · actions:{" "}
        {place?.activities.map((a) => ACTION_LABELS[a]).join(", ") ?? "none"}
      </p>
      <p>
        Known confirmed character presence:{" "}
        {q.data.companions
          .map((c) => `${c.character_key} at ${placeByKey(c.place_key)?.label ?? c.place_key}`)
          .join("; ") || "none; unrelated private whereabouts are not disclosed"}
      </p>
      <details>
        <summary>Invitations, conflicts, missing details & commitments</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(
            q.data.plans.map((p) => ({
              id: p.id,
              character: p.organizer,
              status: p.status,
              missing: p.missing_details,
              conflicts: p.conflicts,
              followthrough: p.followthrough,
              attendance: p.user_attendance,
            })),
            null,
            2,
          )}
        </pre>
      </details>
      <details>
        <summary>Calendar transitions & recent venue actions</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(
            {
              transitions: q.data.transitions,
              actions: q.data.actions.map((a) => ({
                id: a.id,
                action: ACTION_LABELS[a.action as VenueAction] ?? a.action,
                at: a.created_at,
              })),
            },
            null,
            2,
          )}
        </pre>
      </details>
      <p className="text-xs text-muted-foreground">
        The same durable state is used by the backend world tick. Observing it here does not share
        it with characters.
      </p>
    </div>
  );
}
