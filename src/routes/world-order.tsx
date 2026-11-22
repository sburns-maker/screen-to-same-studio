import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { worldOrderReply, worldOrderRescueAction, worldOrderCampaignAction } from "@/lib/world-order.functions";
import { applyCampaignChoice, currentCampaignScene, initialCampaign, normalizeCampaign, type CampaignState } from "@/lib/world-order-campaign";
import { socialReactionWave, appendMissingReactions, addCommentToPost, type SocialPost } from "@/lib/world-order-social";
import { RESCUE_BEATS, rescueChoice, rescueAdvancePhase, rescueOutcome, type RescueChoice, type RescuePhase, type RescueRecord } from "@/lib/world-order-rescue";
import { directorEvent, type DirectorMode } from "@/lib/world-order-director";
import { appendCharacterMemories, memoriesForContact, nextGameDay, type WorldContact, type WorldMemory } from "@/lib/world-order-rules";
import { ArrowLeft, Globe2, Heart, Landmark, MessageCircle, Newspaper, RotateCcw, Send, Repeat2 } from "lucide-react";

export const Route = createFileRoute("/world-order")({
  head: () => ({ meta: [{ title: "World Order — The Accidental King" }, { name: "description", content: "A fictional modern-Earth political and social life simulation." }] }),
  component: WorldOrder,
});

type Chapter = "rescue" | "interview" | "cuba";
type Tab = "feed" | "messages" | "activities" | "world";
type Post = SocialPost;
type Chat = { id: number; from: "player" | WorldContact; body: string; day: number };
type Memory = WorldMemory;
type Save = {
  day: number; chapter: Chapter; route: "undecided" | "reform" | "investment" | "diplomacy";
  followers: number; reputation: number; influence: number; cubaSupport: number;
  posts: Post[]; chat: Chat[]; events: string[]; playerName: string; completed: string[]; memories: Memory[];
  directorMode: DirectorMode; directorEventIds: string[];
  rescuePhase: RescuePhase; rescueLog: RescueRecord[];
  campaign: CampaignState;
};
const KEY = "world-order-v1";
const INITIAL: Save = {
  day: 1, chapter: "rescue", route: "undecided", followers: 0, reputation: 50, influence: 0, cubaSupport: 0,
  playerName: "You", completed: [], directorMode: "balanced", directorEventIds: [], rescuePhase: 0, rescueLog: [], memories: [], campaign: initialCampaign(),
  posts: [{ id: 1, author: "Backstage Live", category: "Live", day: 1, body: "Sabrina Carpenter is onstage. The crowd is roaring and the lights are blazing. Something unsettling is unfolding near the barricade." }],
  chat: [],
  events: ["Day 1: You are attending Sabrina Carpenter's concert."],
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
    const alreadyReactions = (migrated.posts as Post[]).some(p => p.handle === "@julesatshows");
    // Existing test saves keep their choices and chat history while gaining the missing reaction wave.
    const legacyWall = rescuedBefore ? (migrated.posts as Post[]).filter(p =>
      !(p.author === "WorldWire" && p.day === 2 && (
        p.body.startsWith("You helped protect Sabrina Carpenter during a fictional concert attack.") ||
        p.body.startsWith("Sabrina survived the fictional concert attack.")))
    ) : migrated.posts as Post[];
    const upgradedPosts = rescuedBefore && !alreadyReactions
      ? appendMissingReactions([
          { id: -202, day: 2, author: "WorldWire", category: "Breaking",
            body: "Sabrina Carpenter is safe after a concert emergency. Video of a bystander's intervention is spreading fast as reactions pour in." },
          ...legacyWall,
        ], socialReactionWave("rescue", 2, {
          tone: (migrated.rescueLog as RescueRecord[] | undefined)?.[2]?.approach ?? "care",
        }))
      : legacyWall;
    const cleanPosts = upgradedPosts.filter(p =>
      !(p.author === "WorldWire" && p.category === "Update" &&
        (p.body.startsWith("Another day passes.") || p.body.startsWith("Time passes. Unresolved decisions"))));
    return { ...structuredClone(INITIAL), ...migrated, posts: cleanPosts, campaign: normalizeCampaign(v.campaign),
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
  const narrateCampaign = useServerFn(worldOrderCampaignAction);
  const [campaignDraft, setCampaignDraft] = useState("");
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [rescueDraft, setRescueDraft] = useState("");
  const [sceneBusy, setSceneBusy] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [tab, setTab] = useState<Tab>("feed");
  const [draft, setDraft] = useState("");
  const [expandedComments, setExpandedComments] = useState<number[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [dm, setDm] = useState("");
  const [selectedContact, setSelectedContact] = useState<WorldContact>("Sabrina");
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
      ...(trigger === "activity" && s.chapter !== "cuba" ? [newPost("WorldWire", headline, day, "Update")] : []),
      ...(event ? [newPost(event.author, event.summary, day, event.category)] : []),
    ];
    return {
      ...s, day,
      influence: Math.max(0, s.influence + (event?.influenceDelta ?? 0)),
      cubaSupport: Math.max(0, s.cubaSupport + (event?.supportDelta ?? 0)),
      directorEventIds: event ? [...s.directorEventIds, event.id].slice(-120) : s.directorEventIds,
      posts: [...additions, ...s.posts].slice(0, 160),
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
    }, "Concert attack stopped. Sabrina Carpenter safe after an audience member helps security.");
    const reactions = socialReactionWave("rescue", finished.day, { tone: log[2]?.approach ?? "care" });
    return { ...finished, posts: appendMissingReactions([
        newPost("WorldWire", "The concert emergency is over, and Sabrina is safe. A bystander's intervention is being shared across social media as fans and reporters react.", finished.day, "Breaking"),
        ...finished.posts.filter(p => !(p.author === "WorldWire" && p.category === "Update" && p.day === finished.day)),
      ], reactions),
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
        question: "During a televised interview beside Sabrina, you ask the president a pointed question about public accountability. The president's response backfires.",
        joke: "A sharp, spontaneous joke about the president's remarks goes viral. Supporters cheer; opponents are furious.",
        facts: "You calmly challenge the president's claims with documented contradictions. The interview becomes a national talking point.",
      };
      const next = advance({ ...s, chapter: "cuba", followers: s.followers + (choice === "joke" ? 2700000 : 1800000), reputation: Math.min(100, s.reputation + (choice === "facts" ? 12 : 4)), influence: s.influence + 25, completed: [...s.completed, "interview"] }, lines[choice]);
      return { ...next, posts: appendMissingReactions([
        newPost("Political Dispatch", "Reform organizers in Havana have invited the concert hero to a conversation about Cuba's political future.", next.day, "World"),
        ...next.posts,
      ], socialReactionWave("interview", next.day)), chat: [...next.chat, { id: Date.now(), from: "Elena", day: next.day, body: "My name is Elena. I help organize a reform coalition in Havana. Would you hear us out?" }] };
    });
    setTab("feed");
  }
  function chooseCuba(route: "reform" | "investment" | "diplomacy") {
    mutate(s => {
      if (s.route !== "undecided") return s;
      const next = advance({ ...s, route, influence: s.influence + 20, cubaSupport: route === "reform" ? 18 : 10, completed: [...s.completed, "cuba-opening"], campaign: initialCampaign() }, ENDINGS[route].event);
      return { ...next, posts: appendMissingReactions(next.posts, socialReactionWave("cuba", next.day, { route })), chat: [...next.chat, { id: Date.now(), from: "Elena", day: next.day, body: "The path you've chosen will have consequences. Cuba isn't a prize to be handed over—people here will decide whether to trust you." }] };
    });
    setTab("activities");
  }
  function publish() {
    const body = draft.trim();
    if (!body || body.length > 1200 || save.chapter === "rescue") return;
    mutate(s => {
      const next = advance(s, "Your public post is circulating across the network.", "public_post");
      const aboutCuba = /cuba|havana|reform|government|politic/i.test(body);
      const reaction = aboutCuba
        ? "There are competing views about your latest statement. Residents, organizers, and journalists want specifics."
        : "Some people are cheering your latest post. Others wonder what you will do with all this attention.";
      const playerPost: Post = { ...newPost(s.playerName, body, next.day), likes: 12000, reposts: 1800,
        comments: [
          { id: Date.now() + 1, author: "Jules Moreno", body: "Okay, now I am curious where this goes.", likes: 128 },
          { id: Date.now() + 2, author: "Ravi Mehta", body: "I am going to need more than a viral statement.", likes: 97 },
        ] };
      return { ...next, followers: s.followers + 12000,
        posts: [playerPost, newPost(aboutCuba ? "Sofía Reyes" : "Carmen Lee", reaction, next.day, "Reaction"), ...next.posts].slice(0, 160) };
    });
    setDraft(""); setTab("feed");
  }
  function likePost(id: number) {
    mutate(s => ({ ...s, posts: s.posts.map(p => p.id === id ? {
      ...p, liked: !p.liked, likes: Math.max(0, (p.likes ?? 0) + (p.liked ? -1 : 1)),
    } : p) }));
  }
  function commentOnPost(postId: number) {
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body || body.length > 350) return;
    mutate(s => ({ ...s, posts: addCommentToPost(s.posts, postId, s.playerName, body, s.day) }));
    setCommentDrafts(previous => ({ ...previous, [postId]: "" }));
  }
  async function sendDm() {
    const body = dm.trim();
    if (!body || body.length > 800 || replying || !ready || save.chapter === "rescue") return;
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
          from: m.from, day: m.day, body: m.body.replace(/^To [^:]+: /, "").slice(0, 800),
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
  function completeCampaignDecision(choiceId: string, customNarration?: string) {
    if (save.chapter !== "cuba" || save.route === "undecided") return;
    mutate(s => {
      if (s.route === "undecided" || s.chapter !== "cuba") return s;
      const result = applyCampaignChoice(s.route, s.campaign, choiceId, s.day + 1);
      if (!result) return s;
      const next = advance({ ...s, campaign: result.state,
        influence: Math.max(0, s.influence + result.choice.influence),
        cubaSupport: result.state.support,
        reputation: Math.max(0, Math.min(100, s.reputation + Math.sign(result.choice.support) * 2)),
      }, result.choice.outcome);
      const actorName: Record<string, string> = {
        Elena: "Elena Valdés", Sofía: "Sofía Reyes", Lucía: "Lucía Herrera",
        Rafael: "Rafael Morales", Mercer: "Daniel Mercer", Nora: "Nora Wells",
      };
      const lead = actorName[result.choice.actor] ?? result.choice.actor;
      const reaction = newPost(lead, result.choice.outcome, next.day, "Politics");
      const completeOutcome = customNarration ? customNarration + " " + result.choice.outcome : result.choice.outcome;
      const privateReply = {
        id: Date.now() + Math.random(), from: result.choice.actor as WorldContact, day: next.day,
        body: result.choice.trust >= 0
          ? "I saw how you handled that meeting. We have more to discuss—and I'll be watching what happens next."
          : "I strongly disagree with that decision. If you want my trust, you'll need to explain yourself.",
      };
      return { ...next,
        posts: [reaction, ...next.posts.filter(p => !(p.author === "WorldWire" && p.day === next.day && p.category === "Update"))].slice(0, 160),
        events: [...next.events, ...(customNarration ? ["Day " + next.day + " · Your words: " + customNarration] : [])].slice(-100),
        chat: [...next.chat, privateReply],
        memories: [...next.memories.filter(m => m.key !== "world:campaign-latest"), {
          key: "world:campaign-latest", summary: completeOutcome.slice(0, 650), visibility: "shared" as const,
        }],
      };
    });
    setTab("activities");
  }
  async function takeFreeformCampaignAction() {
    const action = campaignDraft.trim();
    if (!action || action.length > 700 || campaignBusy || !ready || !campaignScene || save.route === "undecided" || save.chapter !== "cuba") return;
    setCampaignBusy(true); setCampaignError("");
    try {
      const result = await narrateCampaign({ data: {
        route: save.route, sceneTitle: campaignScene.title, sceneSetup: campaignScene.setup,
        choices: campaignScene.choices.map(c => ({ id: c.id, title: c.title })),
        action, recentEvents: save.events.slice(-8).map(e => e.slice(0, 400)),
      } });
      completeCampaignDecision(result.choiceId, result.narration);
      setCampaignDraft("");
    } catch(error) {
      setCampaignError(error instanceof Error ? error.message : "Could not continue that scene. Try another action.");
    } finally { setCampaignBusy(false); }
  }
  function nextDay() {
    if (save.chapter === "rescue") return;
    mutate(s => advance(s, "Time passes. Unresolved decisions remain on the table.", "pass_day"));
    if (save.chapter === "cuba" && save.route !== "undecided") setTab("activities");
  }
  const activity = save.chapter === "rescue" ? "The concert" : save.chapter === "interview" ? "The televised interview" : save.route === "undecided" ? "The Cuban crossroads" : "The next confrontation";
  const campaignScene = save.chapter === "cuba" && save.route !== "undecided" ? currentCampaignScene(save.route, save.campaign) : null;
  const beat = save.chapter === "rescue" ? RESCUE_BEATS[save.rescuePhase] : undefined;
  const nav = [["feed", Newspaper, "Feed"], ["messages", MessageCircle, "DMs"], ["activities", Heart, "Story"], ["world", Globe2, "World"]] as const;
  const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join("").toUpperCase();
  const avatar = (name: string, highlighted = false) => <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-extrabold " + (highlighted ? "bg-amber-300 text-slate-950" : "bg-[#34465f] text-slate-100")}>{initials(name)}</span>;
  const chapterTag = save.chapter === "rescue" ? "CHAPTER 01 · THE CONCERT" : save.chapter === "interview" ? "CHAPTER 02 · LIVE TELEVISION" : save.route === "undecided" ? "CHAPTER 03 · THE CUBA CRISIS" : "OPEN WORLD · YOUR LEGACY";
  const title = save.chapter === "rescue" ? "One night changes everything." : save.chapter === "interview" ? "The whole world is watching." : save.route === "undecided" ? "A country at a crossroads." : "Your power has consequences.";
  return (
    <main className="min-h-dvh bg-[#09111f] text-slate-100 selection:bg-amber-300/30">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-5 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to="/" className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400"><ArrowLeft size={13}/> Back to AI Town</Link>
            <h1 className="font-display text-3xl leading-none tracking-tight text-amber-200 sm:text-4xl">WORLD ORDER</h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400">The Accidental King</p>
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
          <p className="relative mt-3 max-w-md text-sm leading-6 text-slate-300">{save.chapter === "rescue" ? "You're at Sabrina Carpenter's concert. You notice something security hasn't seen. The next move is yours." : save.chapter === "interview" ? "Your rescue went viral. Now a televised interview puts you in the political spotlight." : save.route === "undecided" ? "A crisis in Cuba opens unexpected doors. You'll have to earn influence." : "The next decision is waiting in Havana. Powerful people are watching."}</p>
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
          {campaignScene && <div className="rounded-2xl border border-amber-300/40 bg-gradient-to-r from-[#273952] to-[#172236] p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Your next mission · {campaignScene.location}</p>
            <h3 className="mt-2 font-display text-2xl">{campaignScene.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{campaignScene.character} is waiting for your decision. {campaignScene.objective}.</p>
            <button onClick={() => setTab("activities")} className="mt-3 rounded-full bg-amber-300 px-5 py-2.5 text-xs font-bold text-slate-950">Enter scene →</button>
          </div>}
          <div className="rounded-2xl border border-slate-700 bg-[#172236] p-4">
            <div className="mb-3 flex items-center gap-3">{avatar("You", true)}<div><p className="text-sm font-bold">Your story</p><p className="text-xs text-slate-400">Public post · +1 game day</p></div></div>
            <textarea id="wo-post" aria-label="Your social post" disabled={save.chapter === "rescue"} maxLength={1200} rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's happening in your world?" className="w-full resize-y rounded-xl border border-slate-700 bg-[#0b1423] p-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"/>
            <div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{draft.length}/1200</span><button disabled={!draft.trim() || save.chapter === "rescue"} onClick={publish} className="rounded-full bg-amber-300 px-5 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">Publish · +1 day</button></div>
          </div>
          {save.chapter === "rescue" && <p className="rounded-xl border border-amber-300/30 p-3 text-xs text-amber-200">Finish the concert scene to unlock public posting and move the world forward.</p>}
          {save.posts.map(p => <article key={p.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-[#172236] p-4">
            <div className="mb-3 flex items-center gap-3">{avatar(p.author)}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{p.author}</p><p className="truncate text-[11px] text-slate-400">{p.handle ?? p.category} · Day {p.day}</p></div><span className="rounded-full bg-[#26364d] px-2 py-1 text-[10px] text-slate-300">{p.category}</span></div>
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-slate-200">{p.body}</p>
            <div className="mt-4 flex items-center gap-6 border-t border-slate-700/70 pt-3 text-xs text-slate-400">
              <button aria-label={p.liked ? "Unlike post" : "Like post"} onClick={() => likePost(p.id)} className={"inline-flex items-center gap-1.5 " + (p.liked ? "text-rose-400" : "hover:text-rose-400")}><Heart size={17} fill={p.liked ? "currentColor" : "none"}/>{(p.likes ?? 0).toLocaleString()}</button>
              <button aria-label="Show comments" onClick={() => setExpandedComments(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])} className="inline-flex items-center gap-1.5 hover:text-amber-300"><MessageCircle size={17}/>{(p.comments?.length ?? 0).toLocaleString()}</button>
              <span className="inline-flex items-center gap-1.5"><Repeat2 size={16}/>{(p.reposts ?? 0).toLocaleString()}</span>
            </div>
            {expandedComments.includes(p.id) && <div className="mt-3 space-y-2 border-t border-slate-700/70 pt-3">
              {(p.comments ?? []).map(c => <div key={c.id} className="rounded-xl bg-[#0c1524] px-3 py-2"><p className="text-xs font-bold text-amber-200">{c.author}</p><p className="mt-1 text-xs leading-relaxed text-slate-300">{c.body}</p></div>)}
              <div className="flex gap-2"><input aria-label={"Comment on " + p.author + " post"} maxLength={350} value={commentDrafts[p.id] ?? ""} onChange={e => setCommentDrafts(v => ({ ...v, [p.id]: e.target.value }))} placeholder="Add your reply…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#0c1524] px-3 py-2 text-xs text-white"/><button disabled={!(commentDrafts[p.id] ?? "").trim()} onClick={() => commentOnPost(p.id)} className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">Reply</button></div>
            </div>}
          </article>)}
        </section>}
        {tab === "messages" && <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#172236]">
          <div className="border-b border-slate-800 px-4 py-4"><h2 className="font-display text-2xl">Private messages</h2><p className="mt-1 text-xs text-slate-400">Conversations do not advance time</p></div>
          <div className="flex gap-2 overflow-x-auto p-3">{(["Sabrina", "Maya", "Elena", ...(save.chapter === "cuba" ? ["Sofía", "Lucía", "Rafael", "Mercer", "Nora"] as const : [])] as WorldContact[]).map(c => <button key={c} onClick={() => setSelectedContact(c)} className={"shrink-0 rounded-full border px-4 py-2 text-sm " + (selectedContact === c ? "border-amber-300 bg-amber-300 font-semibold text-slate-950" : "border-slate-700 text-slate-300")}>{c}</button>)}</div>
          <div className="flex min-h-48 flex-col gap-3 border-y border-slate-800 bg-[#0c1524] p-4">
            {save.chat.filter(m => m.from === selectedContact || (m.from === "player" && m.body.startsWith("To " + selectedContact + ":"))).map(m => <div key={m.id} className={"max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed " + (m.from === "player" ? "ml-auto rounded-br-sm bg-amber-300 text-slate-950" : "mr-auto rounded-bl-sm bg-[#34445e] text-slate-100")}><span className="mb-1 block text-[10px] font-bold opacity-60">{m.from === "player" ? "You" : m.from} · Day {m.day}</span>{m.body.replace(/^To [^:]+: /, "")}</div>)}
            {!save.chat.some(m => m.from === selectedContact || m.body.startsWith("To " + selectedContact + ":")) && <p className="my-auto text-center text-xs text-slate-500">{selectedContact === "Sabrina" && save.chapter === "rescue" ? "Sabrina hasn't met you yet. Your story begins at the concert." : "No conversation yet. Say hello."}</p>}
            {replying && <p role="status" className="text-xs text-amber-300">{selectedContact} is typing…</p>}
            {replyError && <p role="alert" className="text-xs text-red-300">{replyError}</p>}
          </div>
          <div className="flex gap-2 p-3"><input aria-label="Message" disabled={save.chapter === "rescue"} maxLength={800} value={dm} onChange={e => setDm(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void sendDm(); }} placeholder={"Message " + selectedContact} className="min-w-0 flex-1 rounded-full border border-slate-700 bg-[#0c1524] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"/><button onClick={() => void sendDm()} disabled={!dm.trim() || replying || save.chapter === "rescue"} aria-label="Send message" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-300 text-slate-950 disabled:opacity-30"><Send size={18}/></button></div>
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
            {save.chapter === "interview" && <><p className="text-sm leading-7 text-slate-300">You're on national television alongside Sabrina. The host asks about the president's public response to the attack. Millions of people are watching.</p><div className="space-y-2">{([["question", "Ask a pointed question about accountability"],["joke", "Deliver a perfectly timed joke"],["facts", "Challenge the statement with specific facts"]] as const).map(([id,label]) => <button key={id} onClick={() => completeInterview(id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#0c1524] px-4 py-4 text-left text-sm hover:border-amber-300">{label}<span className="text-amber-300">→</span></button>)}</div></>}
            {save.chapter === "cuba" && save.route === "undecided" && <><p className="text-sm leading-7 text-slate-300">A constitutional crisis unfolds in Cuba. Reformers, investors, and diplomats are competing to shape the future. You have influence, but no guaranteed path to power.</p><div className="space-y-2">{(Object.entries(ENDINGS) as [keyof typeof ENDINGS, typeof ENDINGS.reform][]).map(([id,v]) => <button key={id} onClick={() => chooseCuba(id)} className="w-full rounded-xl border border-slate-700 bg-[#0c1524] px-4 py-4 text-left hover:border-amber-300"><strong className="text-sm text-amber-200">{v.title} →</strong><span className="mt-1 block text-xs leading-relaxed text-slate-400">{v.summary}</span></button>)}</div></>}
            {save.chapter === "cuba" && save.route !== "undecided" && campaignScene && <>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                <span className="rounded-full border border-amber-300/40 px-3 py-1.5 text-amber-200">Mission {save.campaign.stage + 1}</span>
                <span className="rounded-full border border-slate-700 px-3 py-1.5">{campaignScene.location}</span>
              </div>
              {save.campaign.lastOutcome && <div className="rounded-xl border-l-2 border-amber-300 bg-[#0c1524] p-3"><p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Previously</p><p className="mt-1 text-sm leading-6 text-slate-300">{save.campaign.lastOutcome}</p></div>}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-300">In the room · {campaignScene.character}</p>
                <button onClick={() => { setSelectedContact(
                  campaignScene.character.startsWith("Rafael") ? "Rafael" :
                  campaignScene.character.startsWith("Sofía") ? "Sofía" :
                  campaignScene.character.startsWith("Lucía") ? "Lucía" :
                  campaignScene.character.startsWith("Daniel") ? "Mercer" : "Elena"
                ); setTab("messages"); }} className="rounded-full border border-amber-300/50 px-3 py-2 text-xs text-amber-200">Message →</button>
              </div>
              <p className="text-sm leading-7 text-slate-200">{campaignScene.setup}</p>
              <div className="rounded-xl bg-[#0c1524] p-3 text-sm text-slate-300"><strong className="text-amber-200">Your objective:</strong> {campaignScene.objective}</div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">How do you respond?</p>
              <div className="space-y-2">{campaignScene.choices.map(choice => <button key={campaignScene.id + choice.id} onClick={() => completeCampaignDecision(choice.id)}
                className="block w-full rounded-xl border border-slate-700 bg-[#0c1524] px-4 py-4 text-left hover:border-amber-300">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-100"><span>{choice.title}</span><span className="text-amber-300">→</span></span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">{choice.detail}</span>
              </button>)}</div>
              <div className="border-t border-slate-700 pt-4"><label htmlFor="campaign-freeform" className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Or speak in your own words</label>
                <textarea id="campaign-freeform" maxLength={700} rows={3} value={campaignDraft} onChange={e=>setCampaignDraft(e.target.value)} placeholder="I turn to the delegates and tell them…" className="w-full resize-y rounded-xl border border-slate-700 bg-[#0c1524] p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"/>
                <button disabled={!campaignDraft.trim() || campaignBusy} onClick={()=>void takeFreeformCampaignAction()} className="mt-2 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{campaignBusy ? "The room is reacting…" : "Speak · Continue scene"}</button>
                {campaignError && <p role="alert" className="mt-2 text-xs text-red-300">{campaignError}</p>}
              </div>
              <p className="text-[11px] text-slate-500">Each decision advances one day and changes public support, stability, relationships or influence. Nobody automatically hands you power.</p>
            </>}
          </div>
        </section>}
        {tab === "world" && <section className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><h2 className="flex items-center gap-2 font-display text-2xl"><Landmark className="text-amber-300" size={20}/> Political influence</h2><p className="mt-2 text-sm text-slate-300">{save.route === "undecided" ? "Your global ambitions have barely begun." : ENDINGS[save.route].title}</p><p className="mt-2 text-xs text-slate-400">Cuban support: {save.cubaSupport} · Stability: {save.campaign.stability} · Influence: {save.influence}</p>{campaignScene && <p className="mt-2 rounded-xl bg-[#0c1524] p-3 text-sm font-semibold text-amber-200">Political standing: {save.campaign.position === "outsider" ? "Independent outsider" : save.campaign.position === "delegate" ? "Transition delegate" : save.campaign.position === "candidate" ? "Presidential candidate" : "President of Cuba"}</p>}
            <p className="mt-2 text-xs text-amber-200">{campaignScene ? "Current objective: " + campaignScene.objective : "Complete the guided opening to unlock political missions."}</p>
            {campaignScene && <button onClick={() => setTab("activities")} className="mt-3 rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">Continue mission →</button>}
            <p className="mt-3 text-[11px] text-slate-500">Nationwide and global conquest mechanics remain under development.</p></div>
          {campaignScene && <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5">
            <h2 className="font-display text-2xl">People & alliances</h2>
            <p className="mt-1 text-xs text-slate-400">Characters respond to your decisions. Trust starts neutral and changes with the story.</p>
            <div className="mt-3 space-y-3">{([
              ["Elena", "Elena Valdés"], ["Rafael", "Rafael Morales"], ["Sofía", "Sofía Reyes"],
              ["Lucía", "Lucía Herrera"], ["Mercer", "Daniel Mercer"]
            ] as const).map(([key,name]) => {
              const trust = save.campaign.relations[key] ?? 50;
              return <div key={key}><div className="mb-1 flex justify-between text-xs"><span>{name}</span><span className={trust >= 65 ? "text-emerald-300" : trust <= 35 ? "text-rose-300" : "text-slate-400"}>{trust >= 65 ? "Supportive" : trust <= 35 ? "Skeptical" : "Undecided"} · {trust}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-amber-300" style={{ width: Math.min(100,Math.max(0,trust)) + "%" }}/></div>
              </div>;
            })}</div>
          </div>}
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><h2 className="font-display text-2xl">World Director</h2><p className="mt-1 text-xs text-slate-400">Balanced by default. Background developments appear every two game days.</p><label htmlFor="world-director-mode" className="mt-4 block text-xs font-bold uppercase tracking-widest text-slate-400">Simulation pace</label><select id="world-director-mode" value={save.directorMode} onChange={e => mutate(s => ({ ...s, directorMode: e.target.value as DirectorMode }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0c1524] px-3 py-3 text-sm text-slate-100"><option value="realistic">Realistic · Every 5 days</option><option value="balanced">Balanced · Every 2 days</option><option value="chaotic">Chaotic · Every day</option></select></div>
          <details className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><summary className="cursor-pointer font-display text-xl">World history <span className="ml-2 text-xs text-slate-400">({save.events.length})</span></summary><ol className="mt-4 space-y-3">{[...save.events].reverse().map((e,i) => <li key={i} className="border-l-2 border-amber-300/40 pl-3 text-sm leading-6 text-slate-300">{e}</li>)}</ol></details>
          <details className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><summary className="cursor-pointer font-display text-xl">Memory archive <span className="ml-2 text-xs text-slate-400">({save.memories.length})</span></summary><p className="mt-2 text-xs text-slate-400">Currently stored in this browser only.</p><ul className="mt-3 space-y-2">{save.memories.map(m => <li key={m.key} className="rounded-xl bg-[#0c1524] p-3 text-sm leading-relaxed text-slate-300"><span className="mb-1 block text-[11px] text-amber-300">{m.key} · {m.visibility}</span>{m.summary}</li>)}</ul></details>
          <div className="flex flex-wrap items-start gap-2"><button onClick={nextDay} disabled={save.chapter === "rescue"} className="rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">Advance one day</button><details className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-slate-400"><summary className="cursor-pointer">Save options</summary><p className="mt-3 max-w-xs">Progress saves in this browser, not to Tess's database. Clearing website data erases it.</p><button className="mt-3 inline-flex items-center gap-2 text-red-300" onClick={() => { if (window.confirm("Reset World Order only?")) { setSave(structuredClone(INITIAL)); setTab("feed"); } }}><RotateCcw size={13}/> Reset World Order</button></details></div>
        </section>}
        <p className="mt-7 text-center text-[11px] leading-5 text-slate-500">WORLD ORDER · ALTERNATE-HISTORY GAME · PREVIEW</p>
      </div>
    </main>
  );
}
