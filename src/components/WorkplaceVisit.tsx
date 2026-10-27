import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ensureConversations, inboxOverview } from "@/lib/tess.functions";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { WORKPLACES, workplaceShiftLikely } from "@/lib/workplaces";
import { workplaceEncounterTurn } from "@/lib/workplace-encounter.functions";
import { giftHandoffHistory, changeGiftHandoff, verifyGiftReceipt } from "@/lib/gift-handoffs.functions";
import { nextReceptionTurn, dropoffSummary, type ReceptionSession } from "@/lib/workplace-reception";

export function WorkplaceVisit({ placeKey, arrived }: { placeKey: string; arrived: boolean }) {
  const workplace = Object.values(WORKPLACES).find(p => p.key === placeKey);
  const navigate = useNavigate();
  const ensure = useServerFn(ensureConversations);
  const inbox = useServerFn(inboxOverview);
  const encounter = useServerFn(workplaceEncounterTurn);
  const getGifts = useServerFn(giftHandoffHistory);
  const updateGift = useServerFn(changeGiftHandoff);
  const verifyGift = useServerFn(verifyGiftReceipt);
  const queryClient = useQueryClient();
  const gifts = useQuery({ queryKey: ["gift-handoffs", placeKey], queryFn: () => getGifts({ data: { character: workplace!.character } }), enabled: Boolean(workplace) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [spoken, setSpoken] = useState("");
  const [lunch, setLunch] = useState("A packed lunch and a drink");
  const [dropoffNote, setDropoffNote] = useState('I walk up to reception with the lunch. "Hi, I brought this for someone who works here. Is there a permitted way to leave it for them?"');
  const [encounterStatus, setEncounterStatus] = useState("");
  const [receptionSession, setReceptionSession] = useState<ReceptionSession | null>(null);
  const [choice, setChoice] = useState<"ask" | "wait" | "leave_note" | "speak" | "drop_lunch">("ask");
  if (!workplace) return null;
  const place = workplace;
  const name = CHARACTERS[workplace.character as CharacterKey].preferredName;
  const restricted = workplace.publicAccess === "restricted";
  const shiftLikely = workplaceShiftLikely(workplace.character, new Date());
  const prompt = restricted
    ? `Hey ${name}, I was thinking of stopping by when you have a break. Would meeting somewhere public near work suit you?`
    : `Hey ${name}, would it be okay if I stopped by ${workplace.label} when you have a minute? No pressure if you're busy.`;

  async function speakOnSite(dropoff = false) {
    if (!workplace || !arrived || busy || !(dropoff ? receptionSession && receptionSession.turns.length > 0 && lunch.trim() : spoken.trim())) return;
    setBusy(true);setError("");setEncounterStatus("");
    try {
      await ensure();
      const rows=await inbox({});
      const thread=rows.find(row=>row.characterKey===place.character);
      if (!thread) throw new Error("Conversation unavailable");
      await encounter({ data: {
        conversationId: thread.id, character: place.character,
        activity: dropoff ? "item_dropoff" : "conversation",
        ...(dropoff ? { item: lunch.trim() } : {}),
        ...(dropoff && receptionSession ? { receptionTurns: receptionSession.turns, deliveryOutcome: receptionSession.outcome } : {}),
        text: dropoff ? dropoffSummary({ ...receptionSession!, item: lunch.trim() }) : spoken.trim(), requestId: crypto.randomUUID(),
      }});
      if (dropoff) await queryClient.invalidateQueries({ queryKey: ["gift-handoffs", placeKey] });
      if (!dropoff) setSpoken("");
      setEncounterStatus("Your conversation was recorded. Open the thread to continue and read the reply.");
      await navigate({ to: "/chat/$conversationId", params: { conversationId: thread.id } });
    } catch(e) {
      setError(e instanceof Error ? e.message : "On-site conversation unavailable");
    } finally { setBusy(false); }
  }
  async function prepare() {
    if (!workplace || busy) return;
    setBusy(true);setError("");
    try {
      await ensure();
      const rows = await inbox({});
      const thread = rows.find(row => row.characterKey === place.character);
      if (!thread) throw new Error("Conversation unavailable");
      const draft = choice === "drop_lunch"
        ? `Hey ${name}, I stopped by the public reception desk at ${place.label} to leave a lunch for you. I didn’t go into any staff or patient areas. If the front desk can accept it, they can let you know whenever you get a break. No need to stop what you’re doing.`
        : choice === "speak"
        ? `Hey ${name}, I’m in the public visitor area at ${place.label}. If you’re actually here and have time, could we catch up for a minute? Totally fine if not.`
        : choice === "wait"
        ? `Hey ${name}, I am in the public waiting area near ${place.label}. No rush or pressure—are you free for a quick hello, or should I head out?`
        : choice === "leave_note"
          ? `Hey ${name}, I stopped by the public area near ${place.label} but did not want to interrupt your shift. Hope work goes smoothly!`
          : prompt;
      sessionStorage.setItem("home-moment-draft:" + thread.id, JSON.stringify({
        text: draft, homeKey: place.key, activity: "work_visit_request",
      }));
      await navigate({ to: "/chat/$conversationId", params: { conversationId: thread.id } });
    } catch {
      setError("Unable to open the conversation. Try again from Messages.");
    } finally { setBusy(false); }
  }
  return <section aria-label={name + "'s fictional workplace"} className="mb-4 rounded-2xl border bg-surface p-4">
    <h2 className="font-display text-xl">{name}'s workplace</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      This is a real Altoona location used as a fictional game setting. {name} is an invented character, not an employee.
      {restricted
        ? " No access to clinical, private or staff-only areas. Ask about meeting outside work."
        : " The workplace may be busy. Being here does not guarantee a conversation."}
    </p>
    <p className="mt-2 text-sm text-muted-foreground">{arrived
      ? "You've reached the virtual public area. Contact them before expecting a visit."
      : "You can ask first, then decide whether to travel virtually."}</p>
    <div className="mt-3 rounded-xl border bg-background p-3">
      <p className="text-sm font-semibold">{arrived ? "Public visitor area" : "Plan a visit"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{shiftLikely ? "A usual shift may be in progress, but availability is unconfirmed." : "Outside the character’s usual working hours; they may not be here."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(arrived ? (["ask", "speak", "wait", "leave_note", "drop_lunch"] as const) : ["ask"] as const).map(item => <button key={item} type="button" aria-pressed={choice === item} onClick={() => setChoice(item)} className={`min-h-11 rounded-lg border px-3 text-sm ${choice === item ? "bg-primary/10 border-primary" : "bg-background"}`}>{item === "drop_lunch" ? "Drop off item" : item === "ask" ? "Ask permission" : item === "speak" ? "Start a visit conversation" : item === "wait" ? "Ask while waiting" : "Leave a note"}</button>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Only public spaces are simulated. Waiting never guarantees a meeting; messages are editable and must be sent manually.</p>
    </div>
    {arrived && choice === "drop_lunch" && <div className="mt-3 space-y-3 rounded-xl border bg-background p-3" aria-label="Play item drop-off">
      <h3 className="font-semibold">Item drop-off · public reception</h3>
      <p className="text-sm text-muted-foreground">You're in the permitted public visitor area. Ask reception about a delivery; no access to staff-only spaces or guaranteed handoff.</p>
      <label htmlFor="lunch-items" className="block text-sm font-medium">What did you bring?</label>
      <input id="lunch-items" value={lunch} maxLength={160} onChange={e => setLunch(e.target.value)} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm" />
      <label htmlFor="lunch-dialogue" className="block text-sm font-medium">Speak with reception</label>
      <textarea id="lunch-dialogue" value={dropoffNote} maxLength={600} onChange={e => setDropoffNote(e.target.value)} rows={4} className="w-full rounded-lg border bg-background p-3 text-sm" />
      {receptionSession?.turns.map((turn, i) => <p key={i} className="rounded-lg border p-3 text-sm"><strong>{turn.speaker === "player" ? "You" : "Reception"}:</strong> {turn.body}</p>)}
      {receptionSession && <p className="text-xs text-muted-foreground">Status: {receptionSession.outcome.replaceAll("_", " ")}. Item receipt is unconfirmed.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !lunch.trim() || !dropoffNote.trim() || (receptionSession?.turns.length ?? 0) >= 20} onClick={() => {
          const previous = receptionSession ?? { character: place.character as CharacterKey, item: lunch.trim(), outcome: "unresolved" as const, turns: [] };
          setReceptionSession(nextReceptionTurn({ ...previous, item: lunch.trim() }, dropoffNote));
          setDropoffNote("");
        }} className="min-h-11 rounded-xl border px-4 text-sm">Talk to reception</button>
        {receptionSession && receptionSession.turns.length > 0 && <button type="button" disabled={busy} onClick={() => void speakOnSite(true)} className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Finish visit"}
        </button>}
      </div>
      <p className="text-xs text-muted-foreground">This is a fictional, rule-based receptionist—not an AI employee. Finish only when ready to record the visit in your character conversation. No delivery is automatically confirmed, and no plan is scheduled.</p>
    </div>}
    {arrived && choice !== "drop_lunch" && <div className="mt-4 space-y-2 rounded-xl border bg-background p-3">
      <label htmlFor="workplace-dialogue" className="block text-sm font-medium">Speak from the public visitor area</label>
      <textarea id="workplace-dialogue" value={spoken} maxLength={900} onChange={e=>setSpoken(e.target.value)}
        placeholder={restricted ? "Ask whether they can meet you outside the restricted area…" : "Say hello, ask if they have a moment…"}
        className="min-h-24 w-full rounded-lg border bg-background p-3 text-sm"/>
      <button type="button" disabled={busy || !spoken.trim()} onClick={() => void speakOnSite()}
        className="min-h-11 rounded-lg border border-primary px-4 text-sm font-medium disabled:opacity-50">
        {busy ? "Talking…" : "Speak here"}
      </button>
      <p className="text-xs text-muted-foreground">Uses the game's actual AI conversation history. They may be unavailable; a message does not grant access to treatment rooms or staff areas.</p>
    </div>}
    {arrived && <section aria-label="Gift handoff history" className="mt-4 space-y-2 rounded-xl border bg-background p-3">
      <h3 className="font-semibold">Items and deliveries</h3>
      <p className="text-xs text-muted-foreground">An attempted delivery is not proof the character received an item.</p>
      {gifts.isLoading && <p className="text-sm">Loading handoffs…</p>}
      {gifts.error && <button type="button" className="text-sm underline" onClick={() => void gifts.refetch()}>Couldn't load handoffs · retry</button>}
      {gifts.data?.length === 0 && <p className="text-sm text-muted-foreground">No recorded item drop-offs yet.</p>}
      {gifts.data?.map(gift => <div key={gift.id} className="rounded-lg border p-3 text-sm">
        <p className="font-medium">{gift.item}</p>
        <p className="text-xs text-muted-foreground">Status: {gift.status.replaceAll("_", " ")} · {gift.recipientReceived ? "Recipient confirmed receipt" : "Recipient receipt unconfirmed"}</p>
        {gift.status !== "returned" && gift.status !== "received" && <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="min-h-10 rounded-lg border px-3" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const result = await verifyGift({ data: { id: gift.id, character: place.character } });
              await queryClient.invalidateQueries({ queryKey: ["gift-handoffs", placeKey] });
              setEncounterStatus(result.confirmed ? "Receipt verified from the character's conversation." : "No explicit receipt confirmation yet. The delivery remains unconfirmed.");
            } catch { setError("Could not verify receipt. Try again."); }
            finally { setBusy(false); }
          }}>Check for receipt</button>
          <button type="button" className="min-h-10 rounded-lg border px-3" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try { await updateGift({ data: { id: gift.id, character: place.character, action: "wait" } }); await queryClient.invalidateQueries({ queryKey: ["gift-handoffs", placeKey] }); }
            catch { setError("Unable to update the item. Try again."); }
            finally { setBusy(false); }
          }}>Still waiting</button>
          <button type="button" className="min-h-10 rounded-lg border px-3" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try { await updateGift({ data: { id: gift.id, character: place.character, action: "take_back" } }); await queryClient.invalidateQueries({ queryKey: ["gift-handoffs", placeKey] }); }
            catch { setError("Unable to update the item. Try again."); }
            finally { setBusy(false); }
          }}>Take it back</button>
        </div>}
      </div>)}
    </section>}
    {encounterStatus && <p role="status" className="mt-2 text-sm">{encounterStatus}</p>}
    {choice !== "drop_lunch" && <button type="button" disabled={busy} onClick={() => void prepare()}
      className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
      {busy ? "Opening conversation…" : choice === "leave_note" ? "Write a note" : choice === "speak" ? "Open live conversation" : choice === "wait" ? "Ask about a quick hello" : restricted ? `Ask ${name} to meet nearby` : `Ask to visit ${name} at work`}
    </button>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}
