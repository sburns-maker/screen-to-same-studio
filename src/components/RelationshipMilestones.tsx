import type { CommitmentEvent } from "@/lib/relationship-commitments";
import { commitmentLabel, resolveCommitmentStatus } from "@/lib/relationship-commitments";

/**
 * Presentation-only until the commitment event service is activated.
 * Never infer a milestone from relationship score, text sentiment or cohabitation.
 */
export function RelationshipMilestones({ events, characterName }: {
  events: readonly CommitmentEvent[];
  characterName: string;
}) {
  const status = resolveCommitmentStatus(events);
  const timeline = [...events].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
  return (
    <section aria-label={`Relationship with ${characterName}`}
      className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-rose-50/90 via-background to-amber-50/50 p-4 shadow-sm dark:from-rose-950/20 dark:via-background dark:to-amber-950/10 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your story together</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{characterName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{commitmentLabel(status)}</p>
        </div>
        <span aria-hidden="true" className="rounded-full bg-background/80 px-4 py-3 text-xl shadow-sm">♡</span>
      </div>
      <div className="mt-5 space-y-3">
        <h3 className="font-semibold">Milestones</h3>
        {timeline.length === 0 ? (
          <p className="rounded-xl bg-background/80 p-4 text-sm text-muted-foreground">
            Shared decisions and milestones will appear here as your story develops.
          </p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((event) => (
              <li key={event.id} className="rounded-xl border border-border/60 bg-background/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium capitalize">{event.kind.replaceAll("_", " ")}</span>
                  <span className="text-xs capitalize text-muted-foreground">{event.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleDateString()}
                </p>
                {event.note ? <p className="mt-2 text-sm">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
