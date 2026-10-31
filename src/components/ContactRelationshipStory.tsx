import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { stateQuery } from "@/lib/tess-queries";
import { deriveStage } from "@/lib/tess-logic";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { changeRelationshipCommitment } from "@/lib/relationship-commitments.functions";
import { planWedding, loadWeddingPlans } from "@/lib/family-life.functions";
import { useRelationshipCommitments } from "@/lib/use-relationship-commitments";
import { RelationshipMilestones } from "./RelationshipMilestones";
import { supportsRelationshipCommitment, relationshipDraftKey, resolveCommitmentStatus, type CommitmentEvent } from "@/lib/relationship-commitments";

export function ContactRelationshipStory({ characterKey, characterName, conversationId }: {
  characterKey: string;
  characterName: string;
  conversationId?: string | undefined;
}) {
  const query = useRelationshipCommitments(characterKey);
  const state = useQuery(stateQuery(conversationId));
  const connectionStage = state.data ? deriveStage(state.data) : undefined;
  const change = useServerFn(changeRelationshipCommitment);
  const plan = useServerFn(planWedding);
  const listWeddings = useServerFn(loadWeddingPlans);
  const [weddingPlans,setWeddingPlans]=useState<Array<{id:string;venue:string;startsAt:string;characterResponse:string;userResponse:string}>>([]);
  const [weddingDate,setWeddingDate]=useState("");
  const [weddingVenue,setWeddingVenue]=useState("");
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
  if (!supportsRelationshipCommitment(characterKey)) return null;
  if (query.isLoading) return <section aria-label={`Relationship with ${characterName}`} className="rounded-2xl border bg-background p-4"><h3 className="font-semibold">Your story together</h3><p role="status" className="mt-2 text-sm text-muted-foreground">Loading relationship history…</p></section>;
  if (query.error) return (
    <section aria-label={`Relationship with ${characterName}`} className="rounded-2xl border bg-background p-4">
      <h3 className="font-semibold">Your story together</h3>
      <p className="mt-2 text-sm">{connectionStage ? `Connection stage: ${connectionStage}` : "Connection stage unavailable"}</p>
      <p role="alert" className="mt-2 text-sm text-muted-foreground">
        Recorded milestones could not be loaded right now. No milestone history has been changed.
      </p>
      <button type="button" onClick={() => void query.refetch()} className="mt-2 min-h-11 rounded-xl border px-4 text-sm">Retry milestones</button>
    </section>
  );
  if (!query.data?.available) return (
    <section aria-label={`Relationship with ${characterName}`} className="space-y-3 rounded-2xl border bg-background p-4">
      <h3 className="font-semibold">Your story together</h3>
      <p role="status" className="text-sm text-muted-foreground">Recorded relationship decisions are temporarily unavailable. You can still talk in messages.</p>
      {!!query.data?.events.length && <RelationshipMilestones events={query.data.events} characterName={characterName} connectionStage={connectionStage} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void query.refetch()} className="min-h-11 rounded-xl border px-4 text-sm">Retry relationship history</button>
        {conversationId && <Link to="/chat/$conversationId" params={{conversationId}} className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm">Open messages</Link>}
      </div>
      {query.data?.diagnostic && <details className="text-xs text-muted-foreground"><summary>Troubleshooting</summary><p>Step: {query.data.diagnostic.phase} · Code: {query.data.diagnostic.code}</p></details>}
    </section>
  );
  const pending = query.data.events.filter((e) => e.status === "pending");
  const commitmentStatus = resolveCommitmentStatus(query.data.events);
  async function refreshWeddingPlans(){
    try{const plans=await listWeddings({data:{characterKey:characterKey as "tess"|"maya"|"riley"|"sienna"|"kendra"|"claire"|"jordan"}});setWeddingPlans(plans);}
    catch{setFeedback("Wedding plans unavailable until the family database migration is applied.");}
  }
  async function propose(kind: "exclusive" | "partnership" | "engagement" | "marriage") {
    setBusy(true);
    setFeedback("");
    try {
      await change({ data: {
        requestId: crypto.randomUUID(), characterKey, kind, action: "propose", eventId: null,
      } });
      await cache.invalidateQueries({ queryKey: ["relationship-commitments", characterKey] });
      setFeedback("Your proposal is saved. Open messages to discuss it together; the other person has not agreed yet.");
    } catch {
      setFeedback("Unable to send your proposal. Please try again.");
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <RelationshipMilestones events={query.data.events} characterName={characterName} connectionStage={connectionStage} />
      {supportsRelationshipCommitment(characterKey) && pending.length === 0 && (
        <section aria-label="Discuss a relationship commitment" className="rounded-2xl border border-border bg-background p-4 shadow-sm">
          <h3 className="font-semibold">Where do we stand?</h3>
          <p className="mt-1 text-sm text-muted-foreground">Discuss relationship milestones together. {characterName} makes her own decision; a proposal alone does not change your status.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void propose("exclusive")} className="min-h-11 rounded-xl border px-4 text-sm">Ask about exclusivity</button>
            <button type="button" disabled={busy} onClick={() => void propose("partnership")} className="min-h-11 rounded-xl border px-4 text-sm">Discuss a relationship</button>
            {commitmentStatus !== "engaged" && commitmentStatus !== "married" && <button type="button" disabled={busy} onClick={() => void propose("engagement")} className="min-h-11 rounded-xl border px-4 text-sm">Discuss engagement</button>}
          </div>
        </section>
      )}
      {commitmentStatus === "engaged" && (
        <section aria-label="Plan a wedding" className="space-y-3 rounded-2xl border bg-background p-4">
          <h3 className="font-semibold">Plan a ceremony together</h3>
          <p className="text-sm text-muted-foreground">Suggest a date and place. This only saves your proposed plan; it does not book a venue, obtain the other person's agreement, or declare you married.</p>
          <label className="block text-sm">Proposed date and time
            <input type="datetime-local" className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" value={weddingDate} onChange={e=>setWeddingDate(e.target.value)} />
          </label>
          <label className="block text-sm">Proposed venue
            <input type="text" maxLength={200} className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" value={weddingVenue} onChange={e=>setWeddingVenue(e.target.value)} placeholder="Where would you like to celebrate?" />
          </label>
          <button type="button" className="min-h-11 rounded-xl border px-4 text-sm" disabled={busy}
            onClick={()=>void refreshWeddingPlans()}>Show saved wedding plans</button>
          {weddingPlans.map(w=><p key={w.id} className="rounded-lg border p-2 text-sm">
            {w.venue} · {new Date(w.startsAt).toLocaleString()} ·
            {w.characterResponse === "accepted" ? " Mutually accepted" : w.characterResponse === "declined" ? " Declined" : " Awaiting character response"}
          </p>)}
          <button type="button" disabled={busy || !weddingDate || !weddingVenue.trim()}
            className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-50"
            onClick={()=>{
              const date=new Date(weddingDate);
              if(!Number.isFinite(date.getTime())){setFeedback("Choose a valid date.");return;}
              setBusy(true);setFeedback("");
              void plan({data:{characterKey: characterKey as "tess" | "maya" | "riley" | "sienna" | "kendra" | "claire" | "jordan",
                requestId:crypto.randomUUID(),startsAt:date.toISOString(),venue:weddingVenue.trim()}})
                .then(async()=>{await refreshWeddingPlans();setFeedback("Your wedding plan proposal was saved. Discuss it in messages; agreement and ceremony are still separate steps.");})
                .catch(e=>setFeedback(e instanceof Error?e.message:"Wedding plan unavailable"))
                .finally(()=>setBusy(false));
            }}>Save proposed wedding plan</button>
        </section>
      )}
      {pending.map((event) => (
        <section key={event.id} aria-label="Pending relationship decision" className="rounded-2xl border border-border bg-background p-4 shadow-sm">
          <h3 className="font-semibold">A decision to make together</h3>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{event.kind.replaceAll("_", " ")} · {event.proposedBy === "character" ? characterName + " proposed" : "You proposed"}</p>
          <p className="mt-2 text-xs text-muted-foreground">This isn't final until both people independently agree. Living arrangements are managed separately.</p>
          {conversationId && <p className="mt-2 text-sm text-muted-foreground">Opens an editable message to {characterName}. Tap Send when you’re ready.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {conversationId && <Link
              to="/chat/$conversationId"
              params={{ conversationId }}
              onClick={(e) => {
                try {
                  sessionStorage.setItem(relationshipDraftKey(conversationId), JSON.stringify({ character: characterKey, kind: event.kind, eventId: event.id }));
                } catch {
                  e.preventDefault();
                  setFeedback("Could not prepare the message. Open your conversation and write it there.");
                }
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-primary-foreground"
            >Discuss in messages</Link>}
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
