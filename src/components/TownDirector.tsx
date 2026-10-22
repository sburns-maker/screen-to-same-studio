import { Link } from "@tanstack/react-router";
import { inboxOverview } from "@/lib/tess.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { townDirector } from "@/lib/town.functions";
export function TownDirector() {
  const contactsFn = useServerFn(inboxOverview);
  const contacts = useQuery({ queryKey: ["inbox"], queryFn: () => contactsFn({}) });
  const load = useServerFn(townDirector),
    q = useQuery({
      queryKey: ["town-director"],
      queryFn: () => load(),
      refetchInterval: 30_000,
      retry: false,
    });
  return (
    <section className="mt-4 rounded-2xl border bg-surface p-4">
      <h2 className="font-semibold">Exploration director</h2>
      {q.error ? (
        <p role="alert" className="mt-2 text-sm">
          {q.error.message}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {q.data?.available
              ? "Migration 0012 available"
              : "Exploration migration not yet confirmed"}{" "}
            · {q.data?.people.length ?? 0} persisted discovery profiles · Limit{" "}
            {q.data?.dailyAiLimit ?? 0} NPC turns/user/UTC day.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Virtual destination: {q.data?.presence?.place_key ?? "home:user"}. NPC routines are
            derived from Eastern schedules without inference. New NPC photos are disabled pending
            approved identity assets. This observation is never added to character knowledge.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {contacts.data?.map((c) => (
              <Link
                key={c.id}
                to="/debug/$conversationId"
                params={{ conversationId: c.id }}
                className="rounded-full border px-3 py-2 text-xs"
              >
                {c.name}: initiation & photo eligibility
              </Link>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {q.data?.actions.map((a) => (
              <p key={a.id} className="text-xs">
                {new Date(a.at).toLocaleString()} · {a.npc} · {a.mode} · {a.status}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
