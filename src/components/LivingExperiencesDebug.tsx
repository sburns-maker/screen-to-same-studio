import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { experienceDiagnostics, experienceProviderCheck } from "@/lib/living-experiences.functions";
export function LivingExperiencesDebug({ conversationId }: { conversationId: string }) {
  const read = useServerFn(experienceDiagnostics);
  const check = useServerFn(experienceProviderCheck);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof check>> | null>(null);
  const [error, setError] = useState("");
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
      <section className="rounded-xl border p-3">
        <p className="font-medium">Isolated character provider check</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Uses one text-AI request with the production schema and a short test prompt. It does not
          use outing history, send a message, advance an outing or consume its retries. Counts
          against the existing AI budget. One check per account per UTC day; repeats read the saved
          result.
        </p>
        <button
          disabled={checking}
          className="mt-3 min-h-11 rounded-full border px-4"
          onClick={async () => {
            setChecking(true);
            setError("");
            try {
              setResult(await check({ data: { conversationId } }));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Provider check unavailable");
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? "Checking…" : "Run one provider check (uses text AI)"}
        </button>
        {error && <p role="alert">{error}</p>}
        {result && (
          <div role="status" className="mt-2">
            <p>
              {result.state}: {result.note}
            </p>
            {result.diagnostic && (
              <p>
                HTTP {result.diagnostic.statusCode ?? "not returned"} · {result.diagnostic.model} ·{" "}
                {result.diagnostic.code} · Hint: {result.diagnostic.hint ?? "not returned"} ·
                Provider code: {result.diagnostic.providerCode ?? "not returned"} · Parameter:{" "}
                {result.diagnostic.param ?? "not returned"} · Request ID:{" "}
                {result.diagnostic.requestId ?? "not returned"}
              </p>
            )}
          </div>
        )}
      </section>
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
                <p>
                  Current scene: {e.live_scene?.locationLabel ?? "not indexed yet"} ·{" "}
                  {e.live_scene?.activity ?? "unknown"} · scene revision {e.scene_revision}
                </p>
                {e.live_scene && (
                  <p>
                    Participants: {e.live_scene.participants.join(", ")} · area:{" "}
                    {e.live_scene.area || "not specified"}
                  </p>
                )}
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
