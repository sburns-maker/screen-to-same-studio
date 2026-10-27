import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ensureConversations, inboxOverview } from "@/lib/tess.functions";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { WORKPLACES, workplaceShiftLikely } from "@/lib/workplaces";
import { workplaceEncounterTurn } from "@/lib/workplace-encounter.functions";

export function WorkplaceVisit({ placeKey, arrived }: { placeKey: string; arrived: boolean }) {
  const workplace = Object.values(WORKPLACES).find(p => p.key === placeKey);
  const navigate = useNavigate();
  const ensure = useServerFn(ensureConversations);
  const inbox = useServerFn(inboxOverview);
  const encounter = useServerFn(workplaceEncounterTurn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [spoken, setSpoken] = useState("");
  const [encounterStatus, setEncounterStatus] = useState("");
  const [choice, setChoice] = useState<"ask" | "wait" | "leave_note" | "speak">("ask");
  if (!workplace) return null;
  const place = workplace;
  const name = CHARACTERS[workplace.character as CharacterKey].preferredName;
  const restricted = workplace.publicAccess === "restricted";
  const shiftLikely = workplaceShiftLikely(workplace.character, new Date());
  const prompt = restricted
    ? `Hey ${name}, I was thinking of stopping by when you have a break. Would meeting somewhere public near work suit you?`
    : `Hey ${name}, would it be okay if I stopped by ${workplace.label} when you have a minute? No pressure if you're busy.`;

  async function speakOnSite() {
    if (!workplace || !arrived || busy || !spoken.trim()) return;
    setBusy(true);setError("");setEncounterStatus("");
    try {
      await ensure();
      const rows=await inbox({});
      const thread=rows.find(row=>row.characterKey===place.character);
      if (!thread) throw new Error("Conversation unavailable");
      await encounter({ data: {
        conversationId: thread.id, character: place.character,
        text: spoken.trim(), requestId: crypto.randomUUID(),
      }});
      setSpoken("");
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
      const draft = choice === "speak"
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
        {(arrived ? ["ask", "speak", "wait", "leave_note"] as const : ["ask"] as const).map(item => <button key={item} type="button" aria-pressed={choice === item} onClick={() => setChoice(item)} className={`min-h-11 rounded-lg border px-3 text-sm ${choice === item ? "bg-primary/10 border-primary" : "bg-background"}`}>{item === "ask" ? "Ask permission" : item === "speak" ? "Start a visit conversation" : item === "wait" ? "Ask while waiting" : "Leave a note"}</button>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Only public spaces are simulated. Waiting never guarantees a meeting; messages are editable and must be sent manually.</p>
    </div>
    {arrived && <div className="mt-4 space-y-2 rounded-xl border bg-background p-3">
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
    {encounterStatus && <p role="status" className="mt-2 text-sm">{encounterStatus}</p>}
    <button type="button" disabled={busy} onClick={() => void prepare()}
      className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
      {busy ? "Opening conversation…" : choice === "leave_note" ? "Write a note" : choice === "speak" ? "Open live conversation" : choice === "wait" ? "Ask about a quick hello" : restricted ? `Ask ${name} to meet nearby` : `Ask to visit ${name} at work`}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}
