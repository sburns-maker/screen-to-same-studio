import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { worldOrderReply, worldOrderRescueAction } from "@/lib/world-order.functions";
import { RESCUE_BEATS, rescueChoice, rescueAdvancePhase, rescueOutcome, type RescueChoice, type RescuePhase, type RescueRecord } from "@/lib/world-order-rescue";
import { directorEvent, type DirectorMode } from "@/lib/world-order-director";
import { appendCharacterMemories, memoriesForContact, nextGameDay, type WorldMemory } from "@/lib/world-order-rules";
import { ArrowLeft, CalendarDays, Globe2, Heart, Landmark, MessageCircle, Newspaper, RotateCcw, Send, Sparkles, Users } from "lucide-react";

export const Route = createFileRoute("/world-order")({
  head: () => ({ meta: [{ title: "World Order — The Accidental King" }, { name: "description", content: "A fictional modern-Earth political and social life simulation." }] }),
  component: WorldOrder,
});

type Chapter = "rescue" | "interview" | "cuba";
type Tab = "feed" | "messages" | "activities" | "world";
type Post = { id: number; author: string; body: string; day: number; category: string };
type Chat = { id: number; from: "player" | "Sabrina" | "Maya" | "Elena"; body: string; day: number };
type Memory = WorldMemory;
type Save = {
  day: number; chapter: Chapter; route: "undecided" | "reform" | "investment" | "diplomacy";
  followers: number; reputation: number; influence: number; cubaSupport: number;
  posts: Post[]; chat: Chat[]; events: string[]; playerName: string; completed: string[]; memories: Memory[];
  directorMode: DirectorMode; directorEventIds: string[];
  rescuePhase: RescuePhase; rescueLog: RescueRecord[];
};
const KEY = "world-order-v1";
const INITIAL: Save = {
  day: 1, chapter: "rescue", route: "undecided", followers: 0, reputation: 50, influence: 0, cubaSupport: 0,
  playerName: "You", completed: [], directorMode: "balanced", directorEventIds: [], rescuePhase: 0, rescueLog: [], memories: [],
  posts: [{ id: 1, author: "Backstage Live", category: "Live", day: 1, body: "FICTIONAL SCENARIO · Sabrina Carpenter's concert is underway. The crowd is roaring. Something unsettling is unfolding near the stage. What happens next is up to you." }],
  chat: [],
  events: ["Day 1: You are attending Sabrina Carpenter's fictional concert."],
};
const ENDINGS = {
  reform: {
    title: "Join the democratic transition",
    summary: "A Cuban reform coalition offers you a chance to organize public support, face scrutiny, and pursue legitimate political leadership.",
    event: "You join reform leaders in Havana. Your influence grows, but local voters and political institutions—not fame alone—will decide your future.",
  },
  investment: {
    title: "Build an economic power base",
    summary: "Fund recovery and create businesses while dealing with unions, regulators, and the risk of appearing opportunistic.",
    event: "You announce a reconstruction initiative. Local entrepreneurs welcome it, while critics question foreign influence.",
  },
  diplomacy: {
    title: "Become an international negotiator",
    summary: "Broker talks among Cuban groups and international partners, building influence through agreements rather than political office.",
    event: "You help arrange the first round of talks. Rival delegations are watching your every word.",
  },
};
function readSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(INITIAL);
    const v = JSON.parse(raw);
    if (!v || typeof v.day !== "number" || !Array.isArray(v.posts) || !Array.isArray(v.chat) || !Array.isArray(v.events)) return structuredClone(INITIAL);
    // Legacy test saves said the rescue already happened before the player acted.
    // Remove only that unearned opening canon when the player has not finished it.
    const legacyOpening = v.rescuePhase === undefined && !v.completed?.includes("rescue") && v.chapter === "rescue";
    const rescuedBefore = Array.isArray(v.completed) && v.completed.includes("rescue");
    const migrated = legacyOpening ? {
      ...v,
      posts: v.posts.filter((p: Post) => p.id !== 1),
      chat: v.chat.filter((m: Chat) => m.id !== 1),
      events: v.events.filter((e: string) => !e.includes("You intervene during a fictional concert attack")),
      memories: (v.memories ?? []).filter((m: Memory) => m.key !== "world:concert-rescue"),
    } : v;
    return { ...structuredClone(INITIAL), ...migrated,
      rescuePhase: rescuedBefore ? 3 : [0, 1, 2].includes(migrated.rescuePhase) ? migrated.rescuePhase : 0,
      rescueLog: Array.isArray(migrated.rescueLog) ? migrated.rescueLog : [],
      directorMode: ["realistic", "balanced", "chaotic"].includes(v.directorMode) ? v.directorMode : "balanced",
      directorEventIds: Array.isArray(v.directorEventIds) ? v.directorEventIds : [],
      memories: Array.isArray(v.memories) ? v.memories : structuredClone(INITIAL.memories) };
  } catch { return structuredClone(INITIAL); }
}
function WorldOrder() {
  const [save, setSave] = useState<Save>(() => structuredClone(INITIAL));
  const [ready, setReady] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
  const generateReply = useServerFn(worldOrderReply);
  const narrateRescue = useServerFn(worldOrderRescueAction);
  const [rescueDraft, setRescueDraft] = useState("");
  const [sceneBusy, setSceneBusy] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [tab, setTab] = useState<Tab>("feed");
  const [draft, setDraft] = useState("");
  const [dm, setDm] = useState("");
  const [selectedContact, setSelectedContact] = useState<"Sabrina" | "Maya" | "Elena">("Sabrina");
  useEffect(() => { setSave(readSave()); setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(save)); }, [save, ready]);
  function mutate(transform: (s: Save) => Save) { setSave(prev => transform(prev)); }
  function newPost(author: string, body: string, day: number, category = "Social"): Post { return { id: Date.now() + Math.random(), author, body, day, category }; }
  function advance(s: Save, headline: string, trigger: "activity" | "public_post" | "pass_day" = "activity"): Save {
    const day = nextGameDay(s.day, trigger === "public_post" ? "post" : "activity");
    const event = directorEvent({
      day, mode: s.directorMode, chapter: s.chapter, route: s.route,
      trigger, alreadyEmittedIds: s.directorEventIds,
    });
    const additions = [
      newPost("WorldWire", headline, day, "Update"),
      ...(event ? [newPost(event.author, event.summary, day, event.category)] : []),
    ];
    return {
      ...s, day,
      influence: Math.max(0, s.influence + (event?.influenceDelta ?? 0)),
      cubaSupport: Math.max(0, s.cubaSupport + (event?.supportDelta ?? 0)),
      directorEventIds: event ? [...s.directorEventIds, event.id].slice(-120) : s.directorEventIds,
      posts: [...additions, ...s.posts].slice(0, 100),
      events: [...s.events, `Day ${day}: ${headline}`,
        ...(event ? [`Day ${day} · ${event.author}: ${event.summary}`] : [])].slice(-100),
    };
  }
  function commitRescueRecord(s: Save, record: RescueRecord): Save {
    if (s.chapter !== "rescue" || s.rescuePhase >= 3 || record.phase !== s.rescuePhase) return s;
    const log = [...s.rescueLog.filter(x => x.phase < record.phase), record];
    if (record.phase < 2) return { ...s, rescueLog: log, rescuePhase: rescueAdvancePhase(record.phase),
      events: [...s.events, "Day " + s.day + " · Concert: " + record.narrative].slice(-100) };
    const outcome = rescueOutcome(log);
    const finished = advance({
      ...s, rescuePhase: 3, rescueLog: log, chapter: "interview",
      followers: outcome.followers, reputation: outcome.reputation, influence: outcome.influence,
      completed: [...s.completed, "rescue"],
      memories: [...s.memories.filter(m => m.key !== "world:concert-rescue"), {
        key: "world:concert-rescue", summary: outcome.summary.slice(0, 500), visibility: "shared" as const,
      }],
    }, "Sabrina survived the fictional concert attack. Your actions become a viral story.");
    return { ...finished, posts: [newPost("WorldWire", outcome.summary, finished.day, "Breaking"), ...finished.posts],
      chat: [...finished.chat, { id: Date.now() + Math.random(), from: "Sabrina", body: outcome.sabrinaMessage, day: finished.day }] };
  }
  function takeRescueChoice(choice: RescueChoice) {
    const record = rescueChoice(save.rescuePhase, choice);
    if (!record || sceneBusy) return;
    const ending = record.phase === 2;
    mutate(s => commitRescueRecord(s, record));
    setSceneError("");
    if (ending) setTab("feed");
  }
  async function takeFreeformRescueAction() {
    const action = rescueDraft.trim();
    const phase = save.rescuePhase;
    if (!ready || sceneBusy || !action || action.length > 600 || phase >= 3) return;
    setSceneBusy(true); setSceneError("");
    try {
      const result = await narrateRescue({ data: {
        phase, action,
        priorActions: save.rescueLog.slice(-2).map(a => ({ phase: a.phase, action: a.action, narrative: a.narrative })),
      } });
      // AI is narration only. The canonical game state progresses exactly one beat.
      // Its proposed approach influences reputation, never authorizes a world-state change.
      const record: RescueRecord = { phase, action, narrative: result.narration, approach: result.approach };
      mutate(s => commitRescueRecord(s, record));
      setRescueDraft("");
      if (phase === 2) setTab("feed");
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : "The narrator could not continue. Retry or choose an action.");
    } finally { setSceneBusy(false); }
  }
  function completeInterview(choice: "question" | "joke" | "facts") {
    mutate(s => {
      if (s.completed.includes("interview")) return s;
      const lines = {
        question: "During a fictional televised interview beside Sabrina, you ask the president a pointed question about public accountability. The president's response backfires.",
        joke: "A sharp, spontaneous joke about the president's fictional remarks goes viral. Supporters cheer; opponents are furious.",
        facts: "You calmly challenge the president's fictional claims with documented contradictions. The interview becomes a national talking point.",
      };
      const next = advance({ ...s, chapter: "cuba", followers: s.followers + (choice === "joke" ? 2700000 : 1800000), reputation: Math.min(100, s.reputation + (choice === "facts" ? 12 : 4)), influence: s.influence + 25, completed: [...s.completed, "interview"] }, lines[choice]);
      return { ...next, posts: [newPost("Political Dispatch", "A Cuban reform coalition has invited the viral concert hero to discuss a fictional political and economic transition.", next.day, "World"), ...next.posts], chat: [...next.chat, { id: Date.now(), from: "Elena", day: next.day, body: "My name is Elena. I help organize a reform coalition in Havana. Would you hear us out?" }] };
    });
    setTab("feed");
  }
  function chooseCuba(route: "reform" | "investment" | "diplomacy") {
    mutate(s => {
      if (s.route !== "undecided") return s;
      const next = advance({ ...s, route, influence: s.influence + 20, cubaSupport: route === "reform" ? 18 : 10, completed: [...s.completed, "cuba-opening"] }, ENDINGS[route].event);
      return { ...next, chat: [...next.chat, { id: Date.now(), from: "Elena", day: next.day, body: "The path you've chosen will have consequences. Cuba isn't a prize to be handed over—people here will decide whether to trust you." }] };
    });
    setTab("world");
  }
  function publish() {
    const body = draft.trim();
    if (!body || body.length > 1200) return;
    mutate(s => {
      const next = advance(s, "Your public post sparks new conversations across the world.", "public_post");
      const reaction = body.toLowerCase().includes("cuba")
        ? "Cuban commentators debate your latest statement. Some welcome your interest, while others demand concrete commitments."
        : "Fans and skeptics alike weigh in on your latest update.";
      return { ...next, followers: s.followers + 12000, posts: [newPost(s.playerName, body, next.day), newPost("The Public Square", reaction, next.day), ...next.posts] };
    });
    setDraft(""); setTab("feed");
  }
  async function sendDm() {
    const body = dm.trim();
    if (!body || body.length > 800 || replying || !ready) return;
    const contact = selectedContact;
    const playerMessage: Chat = { id: Date.now() + Math.random(), from: "player", day: save.day, body: `To ${contact}: ${body}` };
    const current: Save = { ...save, chat: [...save.chat, playerMessage] };
    setSave(current); setDm(""); setReplying(true); setReplyError("");
    try {
      const answer = await generateReply({ data: {
        contact, day: current.day, chapter: current.chapter, route: current.route,
        reputation: current.reputation, influence: current.influence,
        worldEvents: current.events.slice(-30).map(e => e.slice(0, 400)),
        memories: memoriesForContact(current.memories, contact),
        recentMessages: current.chat.filter(m => m.from === contact || (m.from === "player" && m.body.startsWith(`To ${contact}:`))).slice(-30).map(m => ({
          from: m.from, day: m.day, body: m.body.replace(/^To (Sabrina|Maya|Elena): /, "").slice(0, 800),
        })),
      }});
      setSave(previous => {
        return { ...previous, memories: appendCharacterMemories(previous.memories, answer.remembered, contact),
          chat: [...previous.chat, { id: Date.now() + Math.random(), from: contact, day: previous.day, body: answer.reply }] };
      });
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "AI reply unavailable. Your message has been saved.");
    } finally { setReplying(false); }
  }
  function nextDay() {
    mutate(s => advance({ ...s, influence: s.influence + (s.route === "undecided" ? 0 : 1) }, "Another day passes. Reporters, officials, and citizens continue shaping events.", "pass_day"));
  }
  const activity = save.chapter === "rescue" ? "The concert" : save.chapter === "interview" ? "The televised interview" : save.route === "undecided" ? "The Cuban crossroads" : "Your next move";
  const beat = save.chapter === "rescue" ? RESCUE_BEATS[save.rescuePhase] : undefined;
  const nav = [["feed", Newspaper, "Feed"], ["messages", MessageCircle, "DMs"], ["activities", Heart, "Story"], ["world", Globe2, "World"]] as const;
  const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join("").toUpperCase();
  const avatar = (name: string, highlighted = false) => <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-extrabold " + (highlighted ? "bg-amber-300 text-slate-950" : "bg-[#34465f] text-slate-100")}>{initials(name)}</span>;
  const chapterTag = save.chapter === "rescue" ? "CHAPTER 01 · THE CONCERT" : save.chapter === "interview" ? "CHAPTER 02 · LIVE TELEVISION" : save.route === "undecided" ? "CHAPTER 03 · THE CUBA CRISIS" : "OPEN WORLD · YOUR LEGACY";
  const title = save.chapter === "rescue" ? "One night changes everything." : save.chapter === "interview" ? "The whole world is watching." : save.route === "undecided" ? "A country at a crossroads." : "History remembers your decisions.";
  return (
    <main className="min-h-dvh bg-[#09111f] text-slate-100 selection:bg-amber-300/30">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-5 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to="/" className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400"><ArrowLeft size={13}/> Back to AI Town</Link>
            <h1 className="font-display text-3xl leading-none tracking-tight text-amber-200 sm:text-4xl">WORLD ORDER</h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400">The Accidental King · Fictional world</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-slate-700 bg-[#162137] px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Game day</p>
            <p className="text-2xl font-bold tabular-nums">{save.day}</p>
          </div>
        </header>
        <section className="relative mb-4 overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-[#34415a] via-[#182438] to-[#0b1422] p-5 shadow-2xl shadow-black/20">
          <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-amber-300/10 blur-3xl"/>
          <p className="relative text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">{chapterTag}</p>
          <h2 className="relative mt-2 max-w-sm font-display text-3xl leading-tight">{title}</h2>
          <p className="relative mt-3 max-w-md text-sm leading-6 text-slate-300">{save.chapter === "rescue" ? "You're at Sabrina Carpenter's concert. You notice something security hasn't seen. The next move is yours." : save.chapter === "interview" ? "Your rescue went viral. Now a televised interview puts you in the political spotlight." : save.route === "undecided" ? "A fictional crisis in Cuba opens unexpected doors. You'll have to earn influence." : "The opening is behind you. Your ambitions are only beginning."}</p>
          <button onClick={() => setTab("activities")} className="relative mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-200">Continue story <span aria-hidden="true">→</span></button>
        </section>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { label: "Followers", value: Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(save.followers) },
            { label: "Reputation", value: String(save.reputation) + "%" },
            { label: "Influence", value: String(save.influence) },
          ].map(item => <div key={item.label} className="rounded-2xl border border-slate-800 bg-[#172236] px-2 py-3 text-center"><p className="text-xl font-bold tabular-nums">{item.value}</p><p className="mt-1 text-[11px] text-slate-400">{item.label}</p></div>)}
        </div>
        <nav aria-label="World Order navigation" className="mb-5 grid grid-cols-4 rounded-2xl border border-slate-800 bg-[#172236] p-1">
          {nav.map(([name, Icon, label]) => <button key={name} onClick={() => setTab(name)} aria-current={tab === name ? "page" : undefined}
            className={"flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition " + (tab === name ? "bg-amber-300 text-slate-950" : "text-slate-400 hover:bg-slate-800")}><Icon size={19}/>{label}</button>)}
        </nav>
        {tab === "feed" && <section className="space-y-3">
          <div className="rounded-2xl border border-slate-700 bg-[#172236] p-4">
            <div className="mb-3 flex items-center gap-3">{avatar("You", true)}<div><p className="text-sm font-bold">Your story</p><p className="text-xs text-slate-400">Public post · +1 game day</p></div></div>
            <textarea id="wo-post" aria-label="Your social post" maxLength={1200} rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's happening in your world?" className="w-full resize-y rounded-xl border border-slate-700 bg-[#0b1423] p-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"/>
            <div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{draft.length}/1200</span><button disabled={!draft.trim()} onClick={publish} className="rounded-full bg-amber-300 px-5 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">Publish · +1 day</button></div>
          </div>
          {save.posts.map(p => <article key={p.id} className="rounded-2xl border border-slate-800 bg-[#172236] p-4">
            <div className="mb-3 flex items-center gap-3">{avatar(p.author)}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{p.author}</p><p className="text-[11px] text-slate-400">{p.category} · Day {p.day}</p></div></div>
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-slate-200">{p.body}</p>
          </article>)}
        </section>}
        {tab === "messages" && <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#172236]">
          <div className="border-b border-slate-800 px-4 py-4"><h2 className="font-display text-2xl">Private messages</h2><p className="mt-1 text-xs text-slate-400">Conversations do not advance time</p></div>
          <div className="flex gap-2 overflow-x-auto p-3">{(["Sabrina", "Maya", "Elena"] as const).map(c => <button key={c} onClick={() => setSelectedContact(c)} className={"shrink-0 rounded-full border px-4 py-2 text-sm " + (selectedContact === c ? "border-amber-300 bg-amber-300 font-semibold text-slate-950" : "border-slate-700 text-slate-300")}>{c}</button>)}</div>
          <div className="flex min-h-48 flex-col gap-3 border-y border-slate-800 bg-[#0c1524] p-4">
            {save.chat.filter(m => m.from === selectedContact || (m.from === "player" && m.body.startsWith("To " + selectedContact + ":"))).map(m => <div key={m.id} className={"max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed " + (m.from === "player" ? "ml-auto rounded-br-sm bg-amber-300 text-slate-950" : "mr-auto rounded-bl-sm bg-[#34445e] text-slate-100")}><span className="mb-1 block text-[10px] font-bold opacity-60">{m.from === "player" ? "You" : m.from} · Day {m.day}</span>{m.body.replace(/^To (Sabrina|Maya|Elena): /, "")}</div>)}
            {!save.chat.some(m => m.from === selectedContact || m.body.startsWith("To " + selectedContact + ":")) && <p className="my-auto text-center text-xs text-slate-500">{selectedContact === "Sabrina" && save.chapter === "rescue" ? "Sabrina hasn't met you yet. Your story begins at the concert." : "No conversation yet. Say hello."}</p>}
            {replying && <p role="status" className="text-xs text-amber-300">{selectedContact} is typing…</p>}
            {replyError && <p role="alert" className="text-xs text-red-300">{replyError}</p>}
          </div>
          <div className="flex gap-2 p-3"><input aria-label="Message" maxLength={800} value={dm} onChange={e => setDm(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void sendDm(); }} placeholder={"Message " + selectedContact} className="min-w-0 flex-1 rounded-full border border-slate-700 bg-[#0c1524] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"/><button onClick={() => void sendDm()} disabled={!dm.trim() || replying || (selectedContact === "Sabrina" && save.chapter === "rescue")} aria-label="Send message" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-300 text-slate-950 disabled:opacity-30"><Send size={18}/></button></div>
        </section>}
        {tab === "activities" && <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#172236]">
          <div className="border-b border-slate-800 bg-gradient-to-r from-[#31425d] to-[#172236] p-5"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">Interactive scene · {chapterTag}</p><h2 className="mt-2 font-display text-3xl">{beat?.headline ?? activity}</h2></div>
          <div className="space-y-4 p-4 sm:p-5">
            {save.chapter === "rescue" && beat && <>
              <div className="flex items-center gap-2">{[0,1,2].map(i => <span key={i} className={"h-1.5 flex-1 rounded-full " + (i <= save.rescuePhase ? "bg-amber-300" : "bg-slate-700")}/>)}</div>
              <p className="text-sm leading-7 text-slate-300">{beat.scene}</p>
              {save.rescueLog.map((entry, i) => <div key={i} className="rounded-xl border-l-2 border-amber-300/70 bg-[#0c1524] p-3 text-sm"><p className="mb-1 text-xs font-bold text-amber-300">Your action: {entry.action}</p><p className="leading-6 text-slate-300">{entry.narrative}</p></div>)}
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">What do you do?</p>
              <div className="space-y-2">{beat.choices.map(c => <button key={c.id} onClick={() => takeRescueChoice(c.id)} disabled={sceneBusy} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#0c1524] px-4 py-3 text-left hover:border-amber-300 disabled:opacity-50"><span><strong className="block text-sm">{c.label}</strong><span className="mt-1 block text-xs text-slate-400">{c.note}</span></span><span className="text-amber-300">→</span></button>)}</div>
              <div className="border-t border-slate-700 pt-4"><label htmlFor="rescue-freeform" className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Or write your own action</label>
                <textarea id="rescue-freeform" value={rescueDraft} maxLength={600} rows={3} onChange={e => setRescueDraft(e.target.value)} placeholder="I rush toward the stage and…" className="w-full resize-y rounded-xl border border-slate-700 bg-[#0c1524] p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"/>
                <button onClick={() => void takeFreeformRescueAction()} disabled={!rescueDraft.trim() || sceneBusy} className="mt-2 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{sceneBusy ? "Continuing the scene…" : "Take action · AI narration"}</button>
                {sceneError && <p role="alert" className="mt-2 text-xs text-red-300">{sceneError}</p>}
                <p className="mt-2 text-[11px] text-slate-400">The scene advances one beat per action; game day advances when the rescue is complete.</p>
              </div>
            </>}
            {save.chapter === "interview" && <><p className="text-sm leading-7 text-slate-300">You're on national television alongside Sabrina. The host asks about the president's fictional public response to the attack. Millions of people are watching.</p><div className="space-y-2">{([["question", "Ask a pointed question about accountability"],["joke", "Deliver a perfectly timed joke"],["facts", "Challenge the statement with specific facts"]] as const).map(([id,label]) => <button key={id} onClick={() => completeInterview(id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#0c1524] px-4 py-4 text-left text-sm hover:border-amber-300">{label}<span className="text-amber-300">→</span></button>)}</div></>}
            {save.chapter === "cuba" && save.route === "undecided" && <><p className="text-sm leading-7 text-slate-300">A fictional constitutional crisis unfolds in Cuba. Reformers, investors, and diplomats are competing to shape the future. You have influence, but no guaranteed path to power.</p><div className="space-y-2">{(Object.entries(ENDINGS) as [keyof typeof ENDINGS, typeof ENDINGS.reform][]).map(([id,v]) => <button key={id} onClick={() => chooseCuba(id)} className="w-full rounded-xl border border-slate-700 bg-[#0c1524] px-4 py-4 text-left hover:border-amber-300"><strong className="text-sm text-amber-200">{v.title} →</strong><span className="mt-1 block text-xs leading-relaxed text-slate-400">{v.summary}</span></button>)}</div></>}
            {save.chapter === "cuba" && save.route !== "undecided" && <><p className="text-sm leading-7 text-slate-300">{ENDINGS[save.route].event}</p><p className="text-xs text-slate-400">The opening is complete. Publish posts, speak with characters, or advance the world clock.</p><button onClick={nextDay} className="rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950">Advance one day →</button></>}
          </div>
        </section>}
        {tab === "world" && <section className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><h2 className="flex items-center gap-2 font-display text-2xl"><Landmark className="text-amber-300" size={20}/> Political influence</h2><p className="mt-2 text-sm text-slate-300">{save.route === "undecided" ? "Your global ambitions have barely begun." : ENDINGS[save.route].title}</p><p className="mt-2 text-xs text-slate-400">Cuban support: {save.cubaSupport} · Influence: {save.influence}</p><p className="mt-2 text-[11px] text-slate-500">Worldwide conquest mechanics are not yet active in the prototype.</p></div>
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><h2 className="font-display text-2xl">World Director</h2><p className="mt-1 text-xs text-slate-400">Balanced by default. Background developments appear every two game days.</p><label htmlFor="world-director-mode" className="mt-4 block text-xs font-bold uppercase tracking-widest text-slate-400">Simulation pace</label><select id="world-director-mode" value={save.directorMode} onChange={e => mutate(s => ({ ...s, directorMode: e.target.value as DirectorMode }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0c1524] px-3 py-3 text-sm text-slate-100"><option value="realistic">Realistic · Every 5 days</option><option value="balanced">Balanced · Every 2 days</option><option value="chaotic">Chaotic · Every day</option></select></div>
          <details className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><summary className="cursor-pointer font-display text-xl">World history <span className="ml-2 text-xs text-slate-400">({save.events.length})</span></summary><ol className="mt-4 space-y-3">{[...save.events].reverse().map((e,i) => <li key={i} className="border-l-2 border-amber-300/40 pl-3 text-sm leading-6 text-slate-300">{e}</li>)}</ol></details>
          <details className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><summary className="cursor-pointer font-display text-xl">Memory archive <span className="ml-2 text-xs text-slate-400">({save.memories.length})</span></summary><p className="mt-2 text-xs text-slate-400">Currently stored in this browser only.</p><ul className="mt-3 space-y-2">{save.memories.map(m => <li key={m.key} className="rounded-xl bg-[#0c1524] p-3 text-sm leading-relaxed text-slate-300"><span className="mb-1 block text-[11px] text-amber-300">{m.key} · {m.visibility}</span>{m.summary}</li>)}</ul></details>
          <div className="flex flex-wrap items-start gap-2"><button onClick={nextDay} className="rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950">Advance one day</button><details className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-slate-400"><summary className="cursor-pointer">Save options</summary><p className="mt-3 max-w-xs">Progress saves in this browser, not to Tess's database. Clearing website data erases it.</p><button className="mt-3 inline-flex items-center gap-2 text-red-300" onClick={() => { if (window.confirm("Reset World Order only?")) { setSave(structuredClone(INITIAL)); setTab("feed"); } }}><RotateCcw size={13}/> Reset World Order</button></details></div>
        </section>}
        <p className="mt-7 text-center text-[11px] leading-5 text-slate-500">FICTIONAL WORLD ORDER SIMULATION · PREVIEW BUILD · TESS DATA UNCHANGED</p>
      </div>
    </main>
  );
}
