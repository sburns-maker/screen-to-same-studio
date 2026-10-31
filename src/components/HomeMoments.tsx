import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createPlanDraft } from "@/lib/scheduling.functions";
import { inboxOverview, ensureConversations } from "@/lib/tess.functions";
import { homeMoments } from "@/lib/home-moments";
import type { HousingHome, HousingSnapshot } from "@/lib/housing";

export function HomeMoments({ home, snapshot, character }: {
  home: HousingHome;
  snapshot: HousingSnapshot;
  character?: string | undefined;
}) {
  const navigate = useNavigate();
  const overview = useServerFn(inboxOverview);
  const ensure = useServerFn(ensureConversations);
  const scheduleReview = useServerFn(createPlanDraft);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewTime, setReviewTime] = useState("");
  const [opening, setOpening] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [rent, setRent] = useState("");
  const [utilities, setUtilities] = useState("");
  const [groceries, setGroceries] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (character) return;
    try {
      const saved = sessionStorage.getItem("roommate-review:" + home.key);
      if (!saved) return;
      const data = JSON.parse(saved) as Record<string, unknown>;
      if (typeof data.rent === "string") setRent(data.rent);
      if (typeof data.utilities === "string") setUtilities(data.utilities);
      if (typeof data.groceries === "string") setGroceries(data.groceries);
      if (typeof data.notes === "string") setNotes(data.notes);
      if (typeof data.date === "string") setReviewDate(data.date);
      if (typeof data.time === "string") setReviewTime(data.time);
    } catch { /* optional draft recovery */ }
  }, [home.key, character]);
  useEffect(() => {
    if (character) return;
    try {
      sessionStorage.setItem("roommate-review:" + home.key, JSON.stringify({
        rent, utilities, groceries, notes, date: reviewDate, time: reviewTime,
      }));
    } catch { /* private browsing can prevent draft storage */ }
  }, [home.key, character, rent, utilities, groceries, notes, reviewDate, reviewTime]);
  const moments = useMemo(() => homeMoments(home, snapshot, character), [home, snapshot, character]);
  const chosen = moments.find((moment) => moment.id === selected);
  const numeric = (value: string) => Math.max(0, Number(value) || 0);
  const totals = numeric(rent) + numeric(utilities) + numeric(groceries);
  const proposalText = chosen?.id === "roommate"
    ? `${chosen.suggestion}${totals > 0 ? ` For a starting estimate: rent $${numeric(rent).toFixed(2)}, utilities $${numeric(utilities).toFixed(2)}, shared groceries $${numeric(groceries).toFixed(2)} per month. That totals $${totals.toFixed(2)}, or roughly $${(totals / 2).toFixed(2)} each with an equal split (we can negotiate).` : ""}${notes.trim() ? ` Other things to discuss: ${notes.trim().slice(0, 800)}` : ""}`
    : chosen?.suggestion ?? "";
  async function createReviewInvitation() {
    if (opening || !reviewDate || !reviewTime) { setCopyStatus("Choose a date and time first."); return; }
    setOpening(true);
    try {
      await ensure();
      const threads = await overview({});
      const tess = threads.find(thread => thread.characterKey === "tess");
      if (!tess) throw new Error("Tess's conversation is unavailable.");
      await scheduleReview({ data: {
        id: crypto.randomUUID(), conversationId: tess.id, confirmed: false,
        plan: {
          action: "invite", planId: null, parentPlanId: null,
          title: "Review Roommate Plan", description: proposalText.slice(0, 600),
          category: "meetup", date: reviewDate, time: reviewTime,
          timeHint: null, timeZone: "America/New_York", place: home.key,
          durationMinutes: 90, userQuote: null,
        },
      } });
      setCopyStatus("Meeting invitation saved. Tess still needs to agree; this is not a move-in.");
    } catch (error) { setCopyStatus(error instanceof Error ? error.message : "Couldn't save the meeting invitation."); }
    finally { setOpening(false); }
  }
  async function openDraft() {
    if (!chosen || opening) return;
    setOpening(true);
    setCopyStatus("");
    try {
      await ensure();
      const threads = await overview({});
      const tess = threads.find((thread) => thread.characterKey === "tess");
      if (!tess) throw new Error("Tess's conversation is unavailable.");
      // Same-tab temporary draft, scoped to this exact existing conversation.
      // No message is sent and the plan/calendar isn't changed.
      sessionStorage.setItem("home-moment-draft:" + tess.id, JSON.stringify({
        text: proposalText,
        homeKey: home.key,
        activity: chosen.id,
      }));
      await navigate({ to: "/chat/$conversationId", params: { conversationId: tess.id } });
    } catch {
      setCopyStatus("Could not open Tess's chat. You can copy this message instead.");
    } finally {
      setOpening(false);
    }
  }
  return (
    <section aria-label="Home moments" className="space-y-3 rounded-2xl border border-border/70 bg-gradient-to-br from-orange-50/70 via-background to-rose-50/50 p-4 dark:from-orange-950/10 dark:via-background dark:to-rose-950/10 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Life at home</p>
        <h3 className="mt-1 font-display text-xl">Make a moment</h3>
        <p className="mt-1 text-sm text-muted-foreground">Real moments begin with a conversation. Choosing an idea never invents an event or forces a photo.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {moments.map((moment) => (
          <button key={moment.id} type="button" aria-pressed={selected === moment.id}
            onClick={() => { setSelected(moment.id); setCopyStatus(""); }}
            className={`min-h-28 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected === moment.id ? "border-primary bg-primary/10" : "border-border/70 bg-background/85 hover:bg-accent"}`}>
            <span aria-hidden="true" className="text-xl">{({ coffee: "☕", movie: "🎬", cook: "🍳", mabel: "🐾", photo: "📸", invite: "💌", myphoto: "🪴", roommate: "🧾" } as const)[moment.id]}</span>
            <span className="mt-2 block text-sm font-semibold">{moment.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{moment.description}</span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversation starter</p>
          <p className="text-sm">{proposalText}</p>
          {chosen.id === "roommate" && <div className="space-y-3 rounded-xl border p-3" aria-label="Roommate budget worksheet">
            <p className="text-sm font-semibold">Optional monthly budget worksheet</p>
            <p className="text-xs text-muted-foreground">Draft estimates only. No expenses or agreements are saved to the household until you both decide.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([{ label: "Rent", value: rent, set: setRent }, { label: "Utilities", value: utilities, set: setUtilities }, { label: "Shared groceries", value: groceries, set: setGroceries }] as const).map(item => <label key={item.label} className="text-xs">{item.label}<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" type="number" min="0" step="0.01" value={item.value} onChange={e => item.set(e.target.value)} placeholder="0.00" /></label>)}
            </div>
            <p className="text-sm">Estimated shared monthly total: <strong>${totals.toFixed(2)}</strong> · 50/50 share: <strong>${(totals / 2).toFixed(2)} each</strong></p>
            <label className="block text-xs">Space, privacy, Mabel, chores, guests, and exit plan<textarea className="mt-1 min-h-20 w-full rounded-xl border bg-background p-3" value={notes} onChange={e => setNotes(e.target.value)} maxLength={800} placeholder="Questions and ideas for Tess; no agreement implied" /></label>
          </div>}
          {chosen.id === "roommate" && <div className="grid grid-cols-2 gap-2"><label className="text-xs">Meeting date<input type="date" className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2" value={reviewDate} onChange={e => setReviewDate(e.target.value)} /></label><label className="text-xs">Meeting time<input type="time" className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2" value={reviewTime} onChange={e => setReviewTime(e.target.value)} /></label><button type="button" className="col-span-2 min-h-11 rounded-xl border px-3" disabled={opening || !reviewDate || !reviewTime} onClick={() => void createReviewInvitation()}>Invite Tess to review the plan</button></div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground"
              onClick={() => {
                if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
                  setCopyStatus("Copy unavailable in this browser. Select the text above instead.");
                  return;
                }
                void navigator.clipboard.writeText(proposalText)
                  .then(() => setCopyStatus("Copied. Paste into your conversation when you're ready."))
                  .catch(() => setCopyStatus("Copy failed. Select the text above instead."));
              }}>
              Copy text
            </button>
            <button type="button" disabled={opening} onClick={() => void openDraft()}
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
              {opening ? "Opening…" : "Open draft with Tess"}
            </button>
            {(home.canVisit || !character) && <Link to="/place/$placeKey" params={{ placeKey: home.key }}
              className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm">Explore home</Link>}
          </div>
          {copyStatus && <p role="status" className="text-xs text-muted-foreground">{copyStatus}</p>}
          {chosen.id === "photo" && <p className="text-xs text-muted-foreground">The character decides whether to share. The existing photo system handles eligibility, generation and storage; this screen does not create an image.</p>}
        </div>
      )}
    </section>
  );
}
