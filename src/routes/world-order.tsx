import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { worldOrderReply } from "@/lib/world-order.functions";
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
};
const KEY = "world-order-v1";
const INITIAL: Save = {
  day: 1, chapter: "rescue", route: "undecided", followers: 0, reputation: 50, influence: 0, cubaSupport: 0,
  playerName: "You", completed: [], directorMode: "balanced", directorEventIds: [], memories: [
    { key: "world:concert-rescue", summary: "Day 1: The player saved fictionalized Sabrina Carpenter from an attempted assassination during a concert.", visibility: "shared" },
  ],
  posts: [{ id: 1, author: "WorldWire", category: "Breaking", day: 1, body: "FICTIONAL SCENARIO: An attempt on Sabrina Carpenter's life is stopped during a concert by an audience member. A dramatic video spreads across the world." }],
  chat: [{ id: 1, from: "Sabrina", day: 1, body: "I still can't believe what happened tonight. Are you okay? I wanted to thank you personally." }],
  events: ["Day 1: You intervene during a fictional concert attack and save Sabrina Carpenter."],
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
    return { ...structuredClone(INITIAL), ...v,
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
  function completeRescue(choice: "camera" | "sabrina" | "authorities") {
    mutate(s => {
      if (s.completed.includes("rescue")) return s;
      const messages = {
        camera: "You speak to the cameras and call for calm. The video draws huge attention.",
        sabrina: "You focus on Sabrina's safety and refuse to turn the rescue into a spectacle.",
        authorities: "You cooperate with investigators before addressing the press.",
      };
      const next = advance({ ...s, chapter: "interview", followers: choice === "camera" ? 3400000 : 1900000, reputation: choice === "sabrina" ? 78 : 67, influence: 12, completed: [...s.completed, "rescue"] }, messages[choice]);
      return { ...next, chat: [...next.chat, { id: Date.now(), from: "Sabrina", body: choice === "sabrina" ? "You looked after me before you even thought about the cameras. That means a lot." : "It's been such a strange day. I'm glad we can talk through all of this.", day: next.day }] };
    });
    setTab("feed");
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
  const activity = save.chapter === "rescue" ? "The aftermath of the concert rescue" : save.chapter === "interview" ? "The nationally televised interview" : save.route === "undecided" ? "A crossroads in Havana" : "Open-world activity";
  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-background px-4 pb-24 pt-6 text-foreground">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div><Link to="/" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft size={13}/> Original game</Link><h1 className="font-display text-4xl font-semibold tracking-tight">WORLD ORDER</h1><p className="text-xs text-muted-foreground">THE ACCIDENTAL KING · Fictional alternate history</p></div>
        <span className="rounded-full border px-3 py-2 text-sm font-semibold"><CalendarDays size={14} className="mr-1 inline"/> Day {save.day}</span>
      </header>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl border p-3"><b className="block text-lg">{Intl.NumberFormat("en", { notation: "compact" }).format(save.followers)}</b>Followers</div>
        <div className="rounded-xl border p-3"><b className="block text-lg">{save.reputation}%</b>Reputation</div>
        <div className="rounded-xl border p-3"><b className="block text-lg">{save.influence}</b>Influence</div>
      </div>
      <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed">
        <Sparkles size={14} className="mr-1 inline"/> <b>Playable prototype:</b> events, branching decisions, days and posts run locally. Signed-in DMs use the existing server AI; world saves and memories currently remain browser-local. All portrayals of public figures and political incidents are fictional.
      </div>
      <nav className="mb-5 grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1 text-xs">
        {([["feed", Newspaper, "Feed"], ["messages", MessageCircle, "DMs"], ["activities", Heart, "Activities"], ["world", Globe2, "World"]] as const).map(([name, Icon, label]) => <button key={name} onClick={() => setTab(name)} className={`flex flex-col items-center gap-1 rounded-xl py-3 ${tab === name ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}><Icon size={19}/>{label}</button>)}
      </nav>
      {tab === "feed" && <section className="space-y-3">
        <div className="rounded-xl border p-3"><label htmlFor="wo-post" className="text-sm font-semibold">Post a status · advances one day</label><textarea id="wo-post" maxLength={1200} rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's happening in your world?" className="mt-2 w-full resize-none rounded-lg border bg-background p-3 text-sm"/><button onClick={publish} disabled={!draft.trim()} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Publish +1 day</button></div>
        {save.posts.map(p => <article key={p.id} className="rounded-xl border p-4"><div className="mb-2 flex items-center justify-between gap-2"><strong className="text-sm">{p.author}</strong><span className="text-xs text-muted-foreground">Day {p.day} · {p.category}</span></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p></article>)}
      </section>}
      {tab === "messages" && <section className="space-y-4">
        <p className="text-xs text-muted-foreground">DMs do not advance time. Replies use the existing server-side AI provider. World Order memory currently saves only in this browser.</p>
        <div className="flex gap-2">{(["Sabrina","Maya","Elena"] as const).map(c => <button key={c} onClick={() => setSelectedContact(c)} className={`rounded-full border px-4 py-2 text-sm ${selectedContact === c ? "bg-primary text-primary-foreground" : ""}`}>{c}</button>)}</div>
        <div className="space-y-2">{save.chat.filter(m => m.from === selectedContact || (m.from === "player" && m.body.startsWith(`To ${selectedContact}:`))).map(m => <div key={m.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${m.from === "player" ? "ml-auto bg-primary text-primary-foreground" : "border"}`}><span className="mb-1 block text-xs opacity-70">{m.from === "player" ? "You" : m.from} · Day {m.day}</span>{m.body.replace(/^To (Sabrina|Maya|Elena): /, "")}</div>)}</div>
        {replying && <p role="status" className="text-xs text-muted-foreground">Thinking…</p>}
        {replyError && <p role="alert" className="text-xs text-red-500">{replyError}</p>}
        <div className="flex gap-2"><input aria-label="Message" maxLength={800} value={dm} onChange={e => setDm(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendDm(); }} placeholder={`Message ${selectedContact}`} className="min-w-0 flex-1 rounded-xl border bg-background p-3 text-sm"/><button onClick={sendDm} disabled={!dm.trim() || replying} className="rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-40" aria-label="Send message"><Send size={17}/></button></div>
      </section>}
      {tab === "activities" && <section className="space-y-4 rounded-xl border p-5"><span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Current story activity</span><h2 className="font-display text-3xl">{activity}</h2>
        {save.chapter === "rescue" && <><p className="text-sm leading-relaxed">The crowd is still shaken after you prevented an assassination attempt at Sabrina's concert. She is safe. Cameras are everywhere. What do you do now?</p><div className="grid gap-2">{([["camera", "Address the cameras and call for calm"],["sabrina", "Stay with Sabrina and check on her"],["authorities", "Cooperate privately with investigators"]] as const).map(([id, label]) => <button key={id} onClick={() => completeRescue(id)} className="rounded-xl border p-4 text-left text-sm hover:bg-muted">{label} <span className="text-xs text-muted-foreground">· +1 day</span></button>)}</div></>}
        {save.chapter === "interview" && <><p className="text-sm leading-relaxed">You're on national television beside Sabrina. The host asks about the president's fictional public response to the attack. Your reply will make headlines.</p><div className="grid gap-2">{([["question", "Ask a devastating question about accountability"],["joke", "Deliver a perfectly timed joke"],["facts", "Challenge the president with specific facts"]] as const).map(([id,label])=><button key={id} onClick={()=>completeInterview(id)} className="rounded-xl border p-4 text-left text-sm hover:bg-muted">{label} <span className="text-xs text-muted-foreground">· +1 day</span></button>)}</div></>}
        {save.chapter === "cuba" && save.route === "undecided" && <><p className="text-sm leading-relaxed">Cuba is experiencing a fictional constitutional crisis. A coalition invites you to Havana. You cannot simply claim leadership: citizens, institutions, and rival factions determine the outcome. How will you get involved?</p><div className="grid gap-3">{(Object.entries(ENDINGS) as [keyof typeof ENDINGS, typeof ENDINGS.reform][]).map(([id, v]) => <button key={id} onClick={() => chooseCuba(id)} className="rounded-xl border p-4 text-left hover:bg-muted"><strong className="block text-sm">{v.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{v.summary}</span><span className="mt-2 block text-xs">Begin route · +1 day</span></button>)}</div></>}
        {save.chapter === "cuba" && save.route !== "undecided" && <><p className="text-sm">{ENDINGS[save.route].event}</p><p className="text-xs text-muted-foreground">The opening is complete. Post publicly, message contacts using AI, or advance the clock to develop your world. Dynamic AI-driven activities are planned.</p><button onClick={nextDay} className="rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground">Advance one day</button></>}
      </section>}
      {tab === "world" && <section className="space-y-4">
        <div className="rounded-xl border p-4"><h2 className="mb-2 flex items-center gap-2 font-display text-2xl"><Landmark size={20}/> Your path</h2><p className="text-sm">{save.route === "undecided" ? "Your Cuba strategy is not yet decided. Finish the opening activities." : ENDINGS[save.route].title}</p><p className="mt-2 text-xs text-muted-foreground">Cuban support: {save.cubaSupport} · Personal influence: {save.influence}</p></div>
        <div className="rounded-xl border p-4">
          <h2 className="mb-2 font-display text-2xl">World Director</h2>
          <p className="mb-3 text-xs text-muted-foreground">Balanced mode creates one background event about every two game days. Events follow your current story and avoid rewriting established facts.</p>
          <label htmlFor="world-director-mode" className="block text-sm font-medium">Simulation pace</label>
          <select id="world-director-mode" value={save.directorMode} onChange={e => mutate(s => ({ ...s, directorMode: e.target.value as DirectorMode }))}
            className="mt-2 w-full rounded-xl border bg-background p-3 text-sm">
            <option value="realistic">Realistic · Every 5 days</option>
            <option value="balanced">Balanced · Every 2 days</option>
            <option value="chaotic">Chaotic · Every day</option>
          </select>
          <p className="mt-2 text-xs text-muted-foreground">Each background event is recorded once in world history. The AI is not called automatically for background news, limiting costs.</p>
        </div>
        <div className="rounded-xl border p-4"><h2 className="mb-3 flex items-center gap-2 font-display text-2xl"><Users size={20}/> World history</h2><ol className="space-y-3">{[...save.events].reverse().map((e,i) => <li key={i} className="border-l-2 pl-3 text-sm">{e}</li>)}</ol></div>
        <div className="rounded-xl border p-4"><h2 className="mb-2 font-display text-2xl">Persistent memories</h2>
          <p className="mb-3 text-xs text-muted-foreground">Anchors from your world and conversations. Existing facts cannot be silently overwritten by AI replies.</p>
          <ul className="space-y-2">{save.memories.map(m => <li key={m.key} className="rounded-lg bg-muted p-3 text-sm"><span className="mb-1 block text-xs text-muted-foreground">{m.key} · {m.visibility}</span>{m.summary}</li>)}</ul>
        </div>
        <button onClick={nextDay} className="rounded-full border px-5 py-3 text-sm">Advance one day</button>
        <details className="rounded-xl border p-3 text-xs"><summary className="cursor-pointer text-muted-foreground">Save management</summary><p className="my-3">Progress is stored in this browser, not your existing Tess database. Clearing site data will delete this prototype save.</p><button className="flex items-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-red-500" onClick={() => { if (window.confirm("Reset only World Order prototype progress?")) { setSave(structuredClone(INITIAL)); setTab("feed"); } }}><RotateCcw size={13}/> Reset World Order</button></details>
      </section>}
    </main>
  );
}
