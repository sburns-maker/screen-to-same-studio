import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ensureConversations, inboxOverview } from "@/lib/tess.functions";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { WORKPLACES } from "@/lib/workplaces";

export function WorkplaceVisit({ placeKey, arrived }: { placeKey: string; arrived: boolean }) {
  const workplace = Object.values(WORKPLACES).find(p => p.key === placeKey);
  const navigate = useNavigate();
  const ensure = useServerFn(ensureConversations);
  const inbox = useServerFn(inboxOverview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!workplace) return null;
  const name = CHARACTERS[workplace.character as CharacterKey].preferredName;
  const restricted = workplace.publicAccess === "restricted";
  const prompt = restricted
    ? `Hey ${name}, I was thinking of stopping by when you have a break. Would meeting somewhere public near work suit you?`
    : `Hey ${name}, would it be okay if I stopped by ${workplace.label} when you have a minute? No pressure if you're busy.`;

  async function prepare() {
    if (busy) return;
    setBusy(true);setError("");
    try {
      await ensure();
      const rows = await inbox({});
      const thread = rows.find(row => row.characterKey === workplace.character);
      if (!thread) throw new Error("Conversation unavailable");
      sessionStorage.setItem("home-moment-draft:" + thread.id, JSON.stringify({
        text: prompt, homeKey: workplace.key, activity: "work_visit_request",
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
    <button type="button" disabled={busy} onClick={() => void prepare()}
      className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
      {busy ? "Opening conversation…" : restricted ? `Ask ${name} to meet nearby` : `Ask to visit ${name} at work`}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}
