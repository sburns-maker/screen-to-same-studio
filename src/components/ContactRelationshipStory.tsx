import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { changeRelationshipCommitment } from "@/lib/relationship-commitments.functions";
import { useRelationshipCommitments } from "@/lib/use-relationship-commitments";
import { RelationshipMilestones } from "./RelationshipMilestones";
import type { CommitmentEvent } from "@/lib/relationship-commitments";

export function ContactRelationshipStory({ characterKey, characterName }: {
  characterKey: string;
  characterName: string;
}) {
  const query = useRelationshipCommitments(characterKey);
  const change = useServerFn(changeRelationshipCommitment);
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function respond(event: CommitmentEvent, action: "accept" | "decline" | "cancel") {
    setBusy(true);
    setFeedback("");
    try {
      await change({ data: {
        requestId: crypto.randomUUID(),
        characterKey,
        kind: event.kind,
        eventId: event.id,
        action,
      } });
      await cache.invalidateQueries({ queryKey: ["relationship-commitments", characterKey] });
      setFeedback("Your response was saved.");
    } catch {
      setFeedback("Unable to save that decision. Please try again.");
    } finally { setBusy(false); }
  }
  if (query.isLoading) return null;
  if (query.error) return <p role="alert" className="text-sm text-muted-foreground">Relationship history is temporarily unavailable.</p>;
  if (!query.data?.available) return null;
  const pending = query.data.events.filter((e) => e.status === "pending");
  async function propose(kind: "exclusive" | "partnership") {
    setBusy(true);
    setFeedback("");
    try {
      await change({ data: {
        requestId: crypto.randomUUID(), characterKey, kind, action: "propose", eventId: null,
      } });
      await cache.invalidateQueries({ queryKey: ["relationship-commitments", characterKey] });
      setFeedback("You proposed a relationship decision. The other person has not agreed yet.");
    } catch {
      setFeedback("Unable to send your proposal. Please try again.");
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <RelationshipMilestones events={query.data.events} characterName={characterName} />
      {characterKey === "tess" && pending.length === 0 && (
        <section aria-label="Discuss a relationship commitment" className="rounded-2xl border border-border bg-background p-4 shadow-sm">
          <h3 className="font-semibold">Where do we stand?</h3>
          <p className="mt-1 text-sm text-muted-foreground">You can bring up exclusivity or a committed relationship. Tess decides for herself; proposing is not acceptance.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void propose("exclusive")} className="min-h-11 rounded-xl border px-4 text-sm">Ask about exclusivity</button>
            <button type="button" disabled={busy} onClick={() => void propose("partnership")} className="min-h-11 rounded-xl border px-4 text-sm">Discuss a relationship</button>
          </div>
        </section>
      )}
      {pending.map((event) => (
        <section key={event.id} aria-label="Pending relationship decision" className="rounded-2xl border border-border bg-background p-4 shadow-sm">
          <h3 className="font-semibold">A decision to make together</h3>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{event.kind.replaceAll("_", " ")} · {event.proposedBy === "character" ? characterName + " proposed" : "You proposed"}</p>
          <p className="mt-2 text-xs text-muted-foreground">This isn't final until both people independently agree. Living arrangements are managed separately.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {event.userResponse === "pending" && <>
              <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground" onClick={() => void respond(event, "accept")}>Agree</button>
              <button type="button" disabled={busy} className="min-h-11 rounded-xl border px-4" onClick={() => void respond(event, "decline")}>Decline</button>
            </>}
            {event.proposedBy === "user" && <button type="button" disabled={busy} className="min-h-11 rounded-xl border px-4" onClick={() => void respond(event, "cancel")}>Withdraw proposal</button>}
          </div>
        </section>
      ))}
      {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
    </div>
  );
}
