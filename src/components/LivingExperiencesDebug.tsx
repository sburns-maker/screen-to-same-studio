import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { experienceDiagnostics } from "@/lib/living-experiences.functions";
export function LivingExperiencesDebug({ conversationId }: { conversationId: string }) {
  const read = useServerFn(experienceDiagnostics);
  const q = useQuery({
    queryKey: ["experience-diagnostics", conversationId],
    queryFn: () => read({ data: { conversationId } }),
    refetchInterval: 15000,
    retry: false,
  });
  if (q.error)
    return (
      <p className="text-sm">
        Diagnostics unavailable. Check developer access and reviewed migration 0026.
      </p>
    );
  return (
    <div className="space-y-4 text-sm">
      {q.isLoading
        ? "Loading…"
        : !q.data?.length
          ? "No eligible scheduled experiences."
          : q.data.map((e) => (
              <article key={e.id} className="space-y-1 rounded-xl border p-3">
                <p>
                  Experience: {e.id} · Plan: {e.plan_id}
                </p>
                <p>
                  {e.character} · {e.venue} · {e.moment_count} recorded moments
                </p>
                <p>
                  Scheduled: {e.start_at} · Deadline: {e.claim_deadline}
                </p>
                <p>
                  State: {e.state} · Ownership: {e.mode ?? "unclaimed"} · Revision: {e.revision}
                </p>
                <p>
                  Background eligibility:{" "}
                  {e.state === "scheduled" && Date.now() >= Date.parse(e.claim_deadline)
                    ? "due"
                    : e.state === "auto_running"
                      ? "recoverable automatic claim"
                      : "protected / not due"}
                </p>
                <p>Current scene: {e.live_scene?.locationLabel ?? "not indexed yet"} · {e.live_scene?.activity ?? "unknown"} · scene revision {e.scene_revision}</p>
                {e.live_scene && <p>Participants: {e.live_scene.participants.join(", ")} · area: {e.live_scene.area || "not specified"}</p>}
                <p>Failure: {e.last_failure ?? "none"}</p>
                <p>
                  Outcome: {e.outcome_id ?? "none"} · Calendar / memory synchronized:{" "}
                  {e.synced_at ?? "not completed"}
                </p>
              </article>
            ))}
    </div>
  );
}
