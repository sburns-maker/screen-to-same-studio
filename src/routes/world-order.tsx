import { createInterviewScene, restoreInterviewScene, appendInterviewExchange, appendInterviewGuests, interviewNeedsGuestReply, interviewSuggestedReplies, closeInterviewScene, type InterviewScene } from "@/lib/world-order-interview";
import { openBackstageScene, restoreBackstageScene, appendBackstageTurn, finishBackstageScene, deriveLiveSceneContinuity, type BackstageScene } from "@/lib/world-order-backstage";
import { empireTotals, empireDailyIncome } from "@/lib/world-order-empire";
import { COUNTRY_NAMES, COUNTRY_RECORDS, COUNTRY_REGIONS, type WorldRegion } from "@/lib/world-order-countries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { worldOrderReply, worldOrderRescueAction, worldOrderCampaignAction, worldOrderBackstageReply, worldOrderInterviewReply, worldOrderInterviewGuestReply } from "@/lib/world-order.functions";
import { newConquestWorld, restoreConquestWorld, beginConquestCampaign, campaignMove, consolidateControl, governOccupation, activeCampaign, type ConquestWorld, type CampaignMethod, type CampaignMove } from "@/lib/world-order-conquest";
import { newGlobalPower, restoreGlobalPower, nationalAction, FOREIGN_LEADERS, canMessageOfficial, type GlobalPower, type NationalAction, type ForeignCountry } from "@/lib/world-order-global-power";
import { applyOpenWorldAction, createOpenWorld, restoreOpenWorld, ventureIncome, ventureValue, CITIES, VENTURES, CONTACTS, type OpenWorld, type WorldAction, type City } from "@/lib/world-order-open-world";
import { SOCIAL_CAST, SOCIAL_CONTACTS, createSocialLife, restoreSocialLife, incomingSocialWave, unreadFrom, arrangeMeetup, completeMeetup, type SocialLife, type MeetupApproach } from "@/lib/world-order-social-life";
import { applyCampaignChoice, currentCampaignScene, initialCampaign, normalizeCampaign, type CampaignState } from "@/lib/world-order-campaign";
import { socialReactionWave, appendMissingReactions, addCommentToPost, type SocialPost } from "@/lib/world-order-social";
import { RESCUE_BEATS, rescueChoice, rescueAdvancePhase, rescueOutcome, type RescueChoice, type RescuePhase, type RescueRecord } from "@/lib/world-order-rescue";
import { directorEvent, type DirectorMode } from "@/lib/world-order-director";
import { appendCharacterMemories, memoriesForContact, nextGameDay, type WorldContact, type WorldMemory } from "@/lib/world-order-rules";
import { ArrowLeft, Globe2, Heart, Landmark, MessageCircle, Newspaper, RotateCcw, Send, Repeat2, UsersRound } from "lucide-react";

export const Route = createFileRoute("/world-order")({
  head: () => ({ meta: [{ title: "World Order — The Accidental King" }, { name: "description", content: "A fictional modern-Earth political and social life simulation." }] }),
  component: WorldOrder,
});

type Chapter = "rescue" | "interview" | "cuba";
type Tab = "feed" | "messages" | "activities" | "world" | "life";
type Post = SocialPost;
type Chat = { id: number; from: "player" | WorldContact; body: string; day: number };
type Memory = WorldMemory;
type Save = {
  day: number; chapter: Chapter; route: "undecided" | "reform" | "investment" | "diplomacy";
  followers: number; reputation: number; influence: number; cubaSupport: number;
  posts: Post[]; chat: Chat[]; events: string[]; playerName: string; completed: string[]; memories: Memory[];
  directorMode: DirectorMode; directorEventIds: string[];
  rescuePhase: RescuePhase; rescueLog: RescueRecord[]; backstage: BackstageScene | null; interviewScene: InterviewScene | null;
  campaign: CampaignState; openWorld: OpenWorld; socialLife: SocialLife; globalPower: GlobalPower; conquest: ConquestWorld;
};
const KEY = "world-order-v1";
const REPLAY_BACKUP_KEY = "world-order-v1-last-replay-backup";
const INITIAL: Save = {
  day: 1, chapter: "rescue", route: "undecided", followers: 0, reputation: 50, influence: 0, cubaSupport: 0,
  playerName: "You", completed: [], directorMode: "balanced", directorEventIds: [], rescuePhase: 0, rescueLog: [], backstage: null, interviewScene: null, memories: [], campaign: initialCampaign(), openWorld: createOpenWorld(), socialLife: createSocialLife(), globalPower: newGlobalPower(), conquest: newConquestWorld(),
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
    return { ...structuredClone(INITIAL), ...migrated, posts: cleanPosts, campaign: normalizeCampaign(v.campaign), openWorld: restoreOpenWorld(v.openWorld), socialLife: restoreSocialLife(v.socialLife), globalPower: restoreGlobalPower(v.globalPower), conquest: restoreConquestWorld(v.conquest),
      rescuePhase: rescuedBefore ? 3 : [0, 1, 2].includes(migrated.rescuePhase) ? migrated.rescuePhase : 0,
      rescueLog: Array.isArray(migrated.rescueLog) ? migrated.rescueLog : [],
      backstage: restoreBackstageScene(v.backstage, rescuedBefore && v.chapter === "interview" && v.day <= 2, Array.isArray(v.completed) && v.completed.includes("interview")),
      interviewScene: restoreInterviewScene(v.interviewScene, v.chapter),
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
  const narrateBackstage = useServerFn(worldOrderBackstageReply);
  const narrateInterview = useServerFn(worldOrderInterviewReply);
  const narrateInterviewGuest = useServerFn(worldOrderInterviewGuestReply);
  const narrateCampaign = useServerFn(worldOrderCampaignAction);
  const [campaignDraft, setCampaignDraft] = useState("");
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [rescueDraft, setRescueDraft] = useState("");
  const [sceneBusy, setSceneBusy] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [backstageDraft,setBackstageDraft] = useState("");
  const [backstageBusy,setBackstageBusy] = useState(false);
  const [backstageError,setBackstageError] = useState("");
  const [interviewDraft,setInterviewDraft] = useState("");
  const [interviewBusy,setInterviewBusy] = useState(false);
  const [interviewError,setInterviewError] = useState("");
  const interviewGuestRequestKey = useRef("");
  const [tab, setTab] = useState<Tab>("feed");
  const [draft, setDraft] = useState("");
  const [expandedComments, setExpandedComments] = useState<number[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [dm, setDm] = useState("");
  const [selectedContact, setSelectedContact] = useState<WorldContact>("Sabrina");
  const [contactSearch, setContactSearch] = useState("");
  const [socialNotice, setSocialNotice] = useState("");
  const [countrySearch,setCountrySearch]=useState("");
  const [regionFilter,setRegionFilter]=useState<WorldRegion | "All">("All");
  const [countryPage,setCountryPage]=useState(0);
  const [meetupFocus, setMeetupFocus] = useState<WorldContact | null>(null);
  const [replayNotice,setReplayNotice]=useState("");
  useEffect(() => {
    const loaded = readSave();
    // Populate a modest inbox for existing high-follower worlds, without
    // changing game day or replaying the rescue. No AI calls happen here.
    if (loaded.backstage?.status==="open") setTab("activities");
    const incoming = incomingSocialWave(loaded.day, loaded.followers, loaded.chapter, loaded.socialLife.incomingIds);
    setSave(incoming.length ? {
      ...loaded,
      socialLife: { ...loaded.socialLife, incomingIds: [...loaded.socialLife.incomingIds, ...incoming.map(m=>m.id)] },
      chat: [...loaded.chat, ...incoming.map((m,i)=>({ id: Date.now()+i+Math.random(), from:m.contact, day:loaded.day, body:m.body }))],
    } : loaded);
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(save)); }, [save, ready]);
  // When the host addresses Sabrina, let her answer before Sean takes his next turn.
  // The pending key prevents duplicate AI calls during React rerenders and saves.
  useEffect(() => {
    if (!ready || save.chapter !== "interview" || save.backstage?.status === "open" || save.completed.includes("interview") || interviewBusy) return;
    const scene = save.interviewScene ?? createInterviewScene();
    if (!interviewNeedsGuestReply(scene)) return;
    const key = scene.turns.length + ":" + scene.turns.at(-1)?.text;
    if (interviewGuestRequestKey.current === key) return;
    interviewGuestRequestKey.current = key;
    setInterviewBusy(true);
    setInterviewError("");
    void (async () => {
      try {
        const response = await narrateInterviewGuest({data:{history:scene.turns.slice(-24)}});
        setSave(current => {
          if (current.chapter !== "interview" || current.completed.includes("interview") || current.backstage?.status === "open") return current;
          const latest = current.interviewScene ?? createInterviewScene();
          if (!interviewNeedsGuestReply(latest) || latest.turns.length !== scene.turns.length || latest.turns.at(-1)?.text !== scene.turns.at(-1)?.text) return current;
          return {...current, interviewScene:appendInterviewGuests(latest,[
            {speaker:"Sabrina",text:response.sabrinaReply},
            {speaker:"host",text:response.hostFollowUp},
          ],response.suggestedReplies)};
        });
      } catch (error) {
        setInterviewError(error instanceof Error ? error.message : "Sabrina could not respond. Refresh to retry.");
      } finally {
        setInterviewBusy(false);
      }
    })();
  }, [ready, save.chapter, save.backstage?.status, save.completed, save.interviewScene, interviewBusy, narrateInterviewGuest]);
  function mutate(transform: (s: Save) => Save) { setSave(prev => transform(prev)); }
  function newPost(author: string, body: string, day: number, category = "Social"): Post { return { id: Date.now() + Math.random(), author, body, day, category }; }
  function advance(s: Save, headline: string, trigger: "activity" | "public_post" | "pass_day" = "activity"): Save {
    const day = nextGameDay(s.day, trigger === "public_post" ? "post" : "activity");
    const event = directorEvent({
      day, mode: s.directorMode, chapter: s.chapter, route: s.route,
      trigger, alreadyEmittedIds: s.directorEventIds,
    });
    const dmWave = incomingSocialWave(day, s.followers, s.chapter, s.socialLife.incomingIds);
    const additions = [
      ...(trigger === "activity" && s.chapter !== "cuba" ? [newPost("WorldWire", headline, day, "Update")] : []),
      ...(event ? [newPost(event.author, event.summary, day, event.category)] : []),
    ];
    return {
      ...s, day,
      openWorld: { ...s.openWorld, cash: s.openWorld.cash + ventureIncome(s.openWorld) + empireDailyIncome(s.conquest) },
      chat: [...s.chat, ...dmWave.map((m, i) => ({ id: Date.now() + i + Math.random(), from: m.contact, body: m.body, day: m.day }))].slice(-500),
      socialLife: { ...s.socialLife, incomingIds: [...s.socialLife.incomingIds, ...dmWave.map(m => m.id)].slice(-500) },
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
      ...s, rescuePhase: 3, rescueLog: log, backstage: openBackstageScene(), chapter: "interview",
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
    if (ending) setTab("activities");
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
      if (phase === 2) setTab("activities");
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : "The narrator could not continue. Retry or choose an action.");
    } finally { setSceneBusy(false); }
  }
  async function continueBackstage() {
    const action=backstageDraft.trim();
    const scene=save.backstage;
    if(!ready||!scene||scene.status!=="open"||!action||action.length>700||backstageBusy)return;
    setBackstageBusy(true);setBackstageError("");
    try {
      const result=await narrateBackstage({data:{action,history:scene.turns.slice(-40),sceneContinuity:scene.continuity??deriveLiveSceneContinuity(scene.turns)}});
      mutate(s=>{
        if(s.backstage?.status!=="open")return s;
        const withPlayer=appendBackstageTurn(s.backstage,"player",action);
        return {...s,backstage:appendBackstageTurn(withPlayer,result.speaker,result.reply)};
      });
      setBackstageDraft("");
    } catch(e){setBackstageError(e instanceof Error?e.message:"The conversation couldn't continue. Please try again.");}
    finally{setBackstageBusy(false);}
  }
  function leaveBackstage() {
    if(save.backstage?.status!=="open"||backstageBusy)return;
    mutate(s=>{
      if(s.backstage?.status!=="open")return s;
      const scene=finishBackstageScene(s.backstage);
      const personal=scene.turns.filter(t=>t.speaker==="player"||t.speaker==="Sabrina").slice(-8)
        .map(t=>t.speaker+": "+t.text).join(" ").slice(0,600);
      return {...s,backstage:scene,
        memories:personal?[...s.memories.filter(m=>m.key!=="Sabrina:backstage-conversation"),
          {key:"Sabrina:backstage-conversation",summary:personal,visibility:"private" as const}].slice(-60):s.memories,
        events:[...s.events,"Day "+s.day+": You and Sabrina completed a live scene; final location: "+(scene.continuity??deriveLiveSceneContinuity(scene.turns)).location+"."].slice(-100),
      };
    });
  }
  async function continueInterview() {
    const action=interviewDraft.trim();
    if(!ready||save.chapter!=="interview"||save.backstage?.status==="open"||save.completed.includes("interview")||!action||action.length>700||interviewBusy)return;
    setInterviewBusy(true);setInterviewError("");
    try{
      const scene=save.interviewScene??createInterviewScene();
      const response=await narrateInterview({data:{action,history:scene.turns.slice(-24)}});
      mutate(s=>s.chapter!=="interview"||s.backstage?.status==="open"||s.completed.includes("interview")?s:{
        ...s,interviewScene:appendInterviewExchange(s.interviewScene??createInterviewScene(),action,response.turns,response.suggestedReplies),
      });
      setInterviewDraft("");
    }catch(e){setInterviewError(e instanceof Error?e.message:"The interview could not continue.");}
    finally{setInterviewBusy(false);}
  }
  function completeInterview() {
    if(interviewBusy||save.backstage?.status==="open")return;
    mutate(s=>{
      if(s.completed.includes("interview")||s.backstage?.status==="open")return s;
      const scene=closeInterviewScene(s.interviewScene??createInterviewScene());
      const spoken=scene.turns.filter(t=>t.speaker==="player").map(t=>t.text).join(" ").slice(0,800);
      const summary=spoken?"The interview concludes after your remarks: "+spoken:"The televised interview concludes after the concert rescue.";
      const next=advance({...s,interviewScene:scene,chapter:"cuba",followers:s.followers+(scene.tone==="joke"?2700000:1800000),
        reputation:Math.min(100,s.reputation+(scene.tone==="facts"?12:4)),
        influence:s.influence+25,completed:[...s.completed,"interview"],
        memories:spoken?[...s.memories.filter(m=>m.key!=="world:televised-interview"),
          {key:"world:televised-interview",summary:spoken.slice(0,650),visibility:"shared" as const}].slice(-60):s.memories,
      },summary);
      return {...next,posts:appendMissingReactions([
        newPost("Political Dispatch","Reform organizers in Havana have invited the concert hero to a conversation about Cuba's political future.",next.day,"World"),
        ...next.posts,
      ],socialReactionWave("interview",next.day)),chat:[...next.chat,{id:Date.now(),from:"Elena",day:next.day,body:"My name is Elena. I help organize a reform coalition in Havana. Would you hear us out?"}]};
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
    if (!body || body.length > 800 || replying || !ready || save.chapter === "rescue" || !canMessageOfficial(save.globalPower,selectedContact)) return;
    const contact = selectedContact;
    const playerMessage: Chat = { id: Date.now() + Math.random(), from: "player", day: save.day, body: `To ${contact}: ${body}` };
    const current: Save = { ...save, chat: [...save.chat, playerMessage] };
    setSave(current); setDm(""); setReplying(true); setReplyError("");
    try {
      const answer = await generateReply({ data: {
        contact, day: current.day, chapter: current.chapter, route: current.route,
        reputation: current.reputation, influence: current.influence,
        worldEvents: current.events.slice(-30).map(e => e.slice(0, 400)),
        memories: memoriesForContact(current.memories, contact).map(memory => ({...memory,summary:memory.summary.slice(0,700),key:memory.key.slice(0,80)})),
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
  function openContact(contact: WorldContact) {
    if(!canMessageOfficial(save.globalPower,contact)){setSocialNotice("Open a formal diplomatic channel in World → International power first.");setTab("world");return;}
    setSelectedContact(contact); setSocialNotice(""); setTab("messages");
    mutate(s => ({ ...s, socialLife: { ...s.socialLife, seenByContact: {
      ...s.socialLife.seenByContact,
      [contact]: Math.max(0, ...s.chat.filter(m => m.from === contact).map(m => m.id)),
    } } }));
  }
  function planMeetup(contact: WorldContact) {
    if (save.chapter === "rescue" || !canMessageOfficial(save.globalPower,contact)) return;
    const result = arrangeMeetup(save.socialLife, contact, save.day, save.openWorld.city);
    setSocialNotice(result.message);
    if (!result.visit || save.socialLife.visits.some(v=>v.contact===contact&&v.status==="planned")) return;
    mutate(s => ({ ...s, socialLife: result.life,
      chat: [...s.chat, { id: Date.now() + Math.random(), from: contact, day: s.day, body: result.message }],
      events: [...s.events, "Day " + s.day + ": " + result.message].slice(-100),
    }));
  }
  function meetContact(contact: WorldContact, approach: MeetupApproach) {
    const visit = save.socialLife.visits.find(v => v.contact === contact && v.status === "planned");
    if (!visit) return;
    if (save.openWorld.city !== visit.city) {
      setSocialNotice("Travel to " + visit.city + " first using Life → Travel.");
      setTab("life"); return;
    }
    if (save.day < visit.day) {
      setSocialNotice("The meetup is booked for Day " + visit.day + ". Advance time or enjoy another activity."); return;
    }
    const outcome = completeMeetup(save.socialLife, contact, save.day, save.openWorld.city, approach);
    if (!outcome) return;
    mutate(s => {
      const next = advance(s, outcome.message);
      return { ...next, socialLife: outcome.life,
        chat: [...next.chat, { id: Date.now() + Math.random(), from: contact, day: next.day, body: "I had a really good time. We should do something again soon." }],
        memories: [...next.memories, { key: contact.toLowerCase() + ":meetup-" + s.day, summary: outcome.message.slice(0, 500), visibility: "private" as const }].slice(-60),
      };
    });
    setSocialNotice(outcome.message);
    setMeetupFocus(null);
  }
  function takeWorldAction(action: WorldAction) {
    if (save.chapter === "rescue") return;
    const result = applyOpenWorldAction(save.openWorld, action, save.day + 1);
    if (!result) { setSocialNotice("Not available. Check your cash, city, ownership or existing contacts."); return; }
    mutate(s => {
      const applied = applyOpenWorldAction(s.openWorld, action, s.day + 1);
      if (!applied) return s;
      const next = advance(s, applied.headline);
      return {
        ...next, openWorld: { ...applied.state, cash: applied.state.cash + ventureIncome(applied.state) + empireDailyIncome(s.conquest) },
        influence: Math.max(0, next.influence + applied.influenceChange),
        reputation: Math.max(0, Math.min(100, next.reputation + applied.reputationChange)),
        cubaSupport: Math.max(0, Math.min(100, next.cubaSupport + applied.supportChange)),
        posts: [newPost(applied.who, applied.headline, next.day, applied.category), ...next.posts].slice(0, 160),
        memories: [...next.memories.filter(m => m.key !== "world:assets"), {
          key: "world:assets", summary: "Owned assets: " + applied.state.ventures.map(v => VENTURES[v.id].name + " level " + v.level).join(", ") +
          ". Current city: " + applied.state.city, visibility: "shared" as const,
        }].slice(-60),
      };
    });
    setSocialNotice(result.headline);
  }
  function takeNationalAction(action: NationalAction) {
    const preview = nationalAction(save.globalPower, action, {
      president: save.campaign.position === "president", influence:save.influence,
      cash:save.openWorld.cash, day:save.day+1,
    });
    if (!preview || save.chapter !== "cuba") {
      setSocialNotice("This action isn't available yet. Check political standing, diplomatic trust or cash.");
      return;
    }
    mutate(s => {
      const result = nationalAction(s.globalPower,action,{
        president:s.campaign.position==="president",influence:s.influence,cash:s.openWorld.cash,day:s.day+1,
      });
      if(!result)return s;
      const next=advance(s,result.summary);
      return {
        ...next,globalPower:result.state,
        openWorld:{...next.openWorld,cash:Math.max(0,next.openWorld.cash-result.cashCost)},
        influence:next.influence+result.influenceDelta,
        cubaSupport:Math.max(0,Math.min(100,next.cubaSupport+result.supportDelta)),
        posts:result.publicEvent?[newPost(result.source,result.summary,next.day,"International"),...next.posts].slice(0,160):next.posts,
      };
    });
    setSocialNotice(preview.summary);setTab("world");
  }
  function startInternationalCampaign(country: ForeignCountry, method: CampaignMethod) {
    const result=beginConquestCampaign(save.conquest,country,method,save.day+1,{
      president:save.campaign.position==="president", influence:save.influence+empireTotals(save.conquest).influence+Math.floor(empireTotals(save.conquest).power/2),
      cash:save.openWorld.cash,trust:save.globalPower.relations[country].trust,
      militaryCapacity:save.globalPower.capacity+empireTotals(save.conquest).militaryStrength,
    });
    if(!result){setSocialNotice("You need to be Cuba's president, have enough funds, and meet the diplomatic or defense prerequisites.");return;}
    mutate(s=>{
      const actual=beginConquestCampaign(s.conquest,country,method,s.day+1,{
        president:s.campaign.position==="president",influence:s.influence+empireTotals(s.conquest).influence+Math.floor(empireTotals(s.conquest).power/2),cash:s.openWorld.cash,
        trust:s.globalPower.relations[country].trust,militaryCapacity:s.globalPower.capacity+empireTotals(s.conquest).militaryStrength,
      });
      if(!actual)return s;
      const next=advance(s,actual.summary);
      return {...next,conquest:actual.state,
        influence:Math.max(0,next.influence+actual.influenceDelta),
        cubaSupport:Math.max(0,Math.min(100,next.cubaSupport+actual.supportDelta)),
        openWorld:{...next.openWorld,cash:Math.max(0,next.openWorld.cash-actual.cost)},
        posts:[newPost("Global Affairs",actual.summary,next.day,"International"),...next.posts].slice(0,160)};
    });
    setSocialNotice(result.summary);
  }
  function chooseInternationalMove(id:string,move:CampaignMove) {
    const trial=campaignMove(save.conquest,id,move,save.day+1,{
      cash:save.openWorld.cash,defense:save.globalPower.defense+empireTotals(save.conquest).militaryStrength,
      trust:save.globalPower.relations[save.conquest.campaigns.find(c=>c.id===id)!.country].trust,
      legitimacy:save.globalPower.legitimacy,
    });
    if(!trial){setSocialNotice("You cannot take that step yet. Check available resources and campaign status.");return;}
    mutate(s=>{
      const selected=s.conquest.campaigns.find(c=>c.id===id);
      if(!selected)return s;
      const outcome=campaignMove(s.conquest,id,move,s.day+1,{
        cash:s.openWorld.cash,defense:s.globalPower.defense+empireTotals(s.conquest).militaryStrength,
        trust:s.globalPower.relations[selected.country].trust,legitimacy:s.globalPower.legitimacy,
      });
      if(!outcome)return s;
      const next=advance(s,outcome.summary);
      return {...next,conquest:outcome.state,
        openWorld:{...next.openWorld,cash:Math.max(0,next.openWorld.cash-outcome.cost)},
        influence:Math.max(0,next.influence+outcome.influenceDelta),
        cubaSupport:Math.max(0,Math.min(100,next.cubaSupport+outcome.supportDelta)),
        posts:[newPost("Global Affairs",outcome.summary,next.day,"International"),...next.posts].slice(0,160)};
    });
    setSocialNotice(trial.summary);
  }
  function handleOccupation(country:ForeignCountry,action:"services"|"autonomy"|"security"){
    const preview=governOccupation(save.conquest,country,save.day+1,action,{cash:save.openWorld.cash});
    if(!preview){setSocialNotice("Occupation action unavailable. Check cash and game-day progression.");return;}
    mutate(s=>{
      const result=governOccupation(s.conquest,country,s.day+1,action,{cash:s.openWorld.cash});
      if(!result)return s;
      const next=advance(s,result.summary);
      return {...next,conquest:result.state,openWorld:{...next.openWorld,cash:Math.max(0,next.openWorld.cash-result.cost)},
        cubaSupport:Math.max(0,Math.min(100,next.cubaSupport+result.supportDelta)),
        posts:[newPost("Global Affairs",result.summary,next.day,"International"),...next.posts].slice(0,160)};
    });
    setSocialNotice(preview.summary);
  }
  function integrateCountry(country:ForeignCountry) {
    const preview=consolidateControl(save.conquest,country,save.day+1,{
      president:save.campaign.position==="president",cash:save.openWorld.cash,legitimacy:save.globalPower.legitimacy,
    });
    if(!preview){setSocialNotice("Control requires a completed campaign, adequate legitimacy and funds, and time for integration.");return;}
    mutate(s=>{
      const actual=consolidateControl(s.conquest,country,s.day+1,{
        president:s.campaign.position==="president",cash:s.openWorld.cash,legitimacy:s.globalPower.legitimacy,
      });
      if(!actual)return s;
      const next=advance(s,actual.summary);
      return {...next,conquest:actual.state,
        openWorld:{...next.openWorld,cash:Math.max(0,next.openWorld.cash-actual.cost)},
        influence:next.influence+actual.influenceDelta,
        posts:[newPost("Global Affairs",actual.summary,next.day,"International"),...next.posts].slice(0,160)};
    });
    setSocialNotice(preview.summary);
  }
  function replayFromBeginning() {
    if(!window.confirm("Start World Order again at Day 1? Your current world will be saved as a local backup in this browser."))return;
    try {
      // Keep the old game in a separate key so an accidental restart can be reversed.
      localStorage.setItem(REPLAY_BACKUP_KEY,JSON.stringify(save));
      setSave(structuredClone(INITIAL));
      setSelectedContact("Sabrina");setSocialNotice("");setReplayNotice("New Day 1 world started. Your previous game was backed up in this browser.");
      setTab("feed");
    }catch {setReplayNotice("Couldn't save the backup. No progress was reset.");}
  }
  function restoreReplayBackup() {
    const backup=localStorage.getItem(REPLAY_BACKUP_KEY);
    if(!backup){setReplayNotice("No previous replay backup exists in this browser.");return;}
    if(!window.confirm("Restore your previous World Order game? This replaces the current replay progress."))return;
    try{
      const data=JSON.parse(backup);
      if(!data || typeof data.day!=="number" || !Array.isArray(data.posts) || !Array.isArray(data.chat))throw Error("Invalid backup");
      // Migration runs through the existing readSave parser, just as on page load.
      const current=localStorage.getItem(KEY);
      localStorage.setItem(KEY,backup);
      const restored=readSave();
      if(current!==null)localStorage.setItem(KEY,current); else localStorage.removeItem(KEY);
      setSave(restored);setTab("world");setReplayNotice("Your previous World Order game has been restored.");
    }catch{setReplayNotice("Backup could not be restored. Your current world is unchanged.");}
  }
  function nextDay() {
    if (save.chapter === "rescue") return;
    mutate(s => advance(s, "Time passes. Unresolved decisions remain on the table.", "pass_day"));
    if (save.chapter === "cuba" && save.route !== "undecided") setTab("activities");
  }
  const liveSceneLocation = save.backstage?.status==="open" ? (save.backstage.continuity??deriveLiveSceneContinuity(save.backstage.turns)).location : "backstage";
  const activity = save.chapter === "rescue" ? "The concert" : save.chapter === "interview" ? save.backstage?.status==="open" ? "With Sabrina · "+liveSceneLocation : "The televised interview" : save.route === "undecided" ? "The Cuban crossroads" : "The next confrontation";
  const empire = empireTotals(save.conquest);
  const campaignScene = save.chapter === "cuba" && save.route !== "undecided" ? currentCampaignScene(save.route, save.campaign) : null;
  const beat = save.chapter === "rescue" ? RESCUE_BEATS[save.rescuePhase] : undefined;
  const unreadTotal = SOCIAL_CONTACTS.reduce((sum,c)=>sum+unreadFrom(save.chat,save.socialLife.seenByContact,c),0);
  const nav = [["feed", Newspaper, "Feed"], ["messages", MessageCircle, "DMs"], ["activities", Heart, "Story"], ["life", UsersRound, "Life"], ["world", Globe2, "World"]] as const;
  const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join("").toUpperCase();
  const avatar = (name: string, highlighted = false) => <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-extrabold " + (highlighted ? "bg-amber-300 text-slate-950" : "bg-[#34465f] text-slate-100")}>{initials(name)}</span>;
  const chapterTag = save.chapter === "rescue" ? "CHAPTER 01 · THE CONCERT" : save.chapter === "interview" && save.backstage?.status==="open" ? "CHAPTER 01 · LIVE ESCAPE" : save.chapter === "interview" ? "CHAPTER 02 · LIVE TELEVISION" : save.route === "undecided" ? "CHAPTER 03 · THE CUBA CRISIS" : "OPEN WORLD · YOUR LEGACY";
  const title = save.chapter === "rescue" ? "One night changes everything." : save.chapter === "interview" && save.backstage?.status==="open" ? "Your story with Sabrina continues." : save.chapter === "interview" ? "The whole world is watching." : save.route === "undecided" ? "A country at a crossroads." : "Your power has consequences.";
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
          <p className="relative mt-3 max-w-md text-sm leading-6 text-slate-300">{save.chapter === "rescue" ? "You're at Sabrina Carpenter's concert. You notice something security hasn't seen. The next move is yours." : save.chapter === "interview" && save.backstage?.status==="open" ? "Current location: "+liveSceneLocation+". The scene follows your decisions and preserves events as they unfold." : save.chapter === "interview" ? "Your rescue went viral. Now a televised interview puts you in the political spotlight." : save.route === "undecided" ? "A crisis in Cuba opens unexpected doors. You'll have to earn influence." : "The next decision is waiting in Havana. Powerful people are watching."}</p>
          <button onClick={() => setTab("activities")} className="relative mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-200">Continue story <span aria-hidden="true">→</span></button>
        </section>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { label: "Followers", value: Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(save.followers) },
            { label: "Reputation", value: String(save.reputation) + "%" },
            { label: "Influence", value: String(save.influence) },
          ].map(item => <div key={item.label} className="rounded-2xl border border-slate-800 bg-[#172236] px-2 py-3 text-center"><p className="text-xl font-bold tabular-nums">{item.value}</p><p className="mt-1 text-[11px] text-slate-400">{item.label}</p></div>)}
        </div>
        <nav aria-label="World Order navigation" className="mb-5 grid grid-cols-5 rounded-2xl border border-slate-800 bg-[#172236] p-1">
          {nav.map(([name, Icon, label]) => <button key={name} onClick={() => name === "messages" ? openContact(selectedContact) : setTab(name)} aria-current={tab === name ? "page" : undefined}
            className={"flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition " + (tab === name ? "bg-amber-300 text-slate-950" : "text-slate-400 hover:bg-slate-800")}><Icon size={19}/><span>{label}{name==="messages" && unreadTotal>0 ? " · "+unreadTotal : ""}</span></button>)}
        </nav>
        {tab === "feed" && <section className="space-y-3">
          {save.backstage?.status==="open" && <div className="rounded-2xl border border-amber-300/60 bg-[#26354b] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Live scene · {liveSceneLocation}</p>
            <h3 className="mt-2 font-display text-2xl">Sabrina is waiting for your answer.</h3>
            <p className="mt-2 text-sm leading-6 text-slate-200">Your ongoing scene with Sabrina is waiting. Resume where you left off before continuing to the interview.</p>
            <button onClick={()=>setTab("activities")} className="mt-3 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950">Return backstage →</button>
          </div>}
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
          <div className="border-b border-slate-800 p-3">
            <input aria-label="Search contacts" value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder="Search celebrities, press, friends…" className="mb-3 w-full rounded-xl border border-slate-700 bg-[#0c1524] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"/>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {SOCIAL_CONTACTS.filter(c => SOCIAL_CAST[c].name.toLowerCase().includes(contactSearch.toLowerCase()) || SOCIAL_CAST[c].role.toLowerCase().includes(contactSearch.toLowerCase())).map(c => {
                const last = [...save.chat].reverse().find(m=>m.from===c||m.body.startsWith("To "+c+":"));
                const unread = unreadFrom(save.chat,save.socialLife.seenByContact,c);
                const locked=!canMessageOfficial(save.globalPower,c);
                return <button key={c} onClick={()=>openContact(c)} className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left "+(selectedContact===c?"bg-amber-300 text-slate-950":"hover:bg-[#26364d]")}>
                  <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold "+(selectedContact===c?"bg-slate-950 text-amber-300":"bg-slate-700 text-slate-100")}>{c[0]}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{SOCIAL_CAST[c].name}</span><span className={"block truncate text-[11px] "+(selectedContact===c?"text-slate-700":"text-slate-400")}>{locked?"Diplomatic channel required":last?.body.replace(/^To [^:]+: /,"")??SOCIAL_CAST[c].role}</span></span>
                  {unread>0&&<span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span>}
                </button>;
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 bg-[#213047] px-4 py-3">
            <div><p className="text-sm font-semibold">{SOCIAL_CAST[selectedContact].name}</p><p className="text-xs text-slate-400">{SOCIAL_CAST[selectedContact].role} · {SOCIAL_CAST[selectedContact].city}</p></div>
            <button disabled={save.chapter==="rescue"} onClick={()=>planMeetup(selectedContact)} className="rounded-full border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-40">Invite to meet</button>
          </div>
          {socialNotice&&<p role="status" className="border-b border-slate-800 px-4 py-3 text-xs text-amber-200">{socialNotice}</p>}
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
            {save.chapter === "interview" && save.backstage?.status==="open" && <>
              <p className="text-sm leading-7 text-slate-300">Current location: {liveSceneLocation}. Keep acting and talking with Sabrina wherever the story takes you. No game day passes until you end this scene.</p>
              <div className="space-y-3">
                {save.backstage.turns.map((turn,i)=><div key={i} className={"rounded-xl p-3 text-sm leading-7 "+(turn.speaker==="player"?"ml-5 bg-amber-300 text-slate-950":"mr-5 bg-[#0c1524] text-slate-200")}>
                  <p className={"mb-1 text-xs font-bold "+(turn.speaker==="player"?"text-slate-700":"text-amber-300")}>{turn.speaker==="player"?"You":turn.speaker}</p>
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                </div>)}
              </div>
              <label htmlFor="backstage-action" className="block text-xs font-bold uppercase tracking-widest text-amber-300">What do you say or do?</label>
              <textarea id="backstage-action" rows={4} maxLength={700} value={backstageDraft} onChange={e=>setBackstageDraft(e.target.value)} placeholder="I sit beside Sabrina and ask if she's hurt…" className="w-full resize-y rounded-xl border border-slate-700 bg-[#0c1524] p-3 text-sm text-slate-100 placeholder:text-slate-500"/>
              <button onClick={()=>void continueBackstage()} disabled={!backstageDraft.trim()||backstageBusy} className="w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{backstageBusy?"Sabrina is responding…":"Continue conversation"}</button>
              {backstageError&&<p role="alert" className="text-sm text-red-300">{backstageError}</p>}
              <div className="border-t border-slate-700 pt-4">
                <button onClick={leaveBackstage} disabled={backstageBusy} className="rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40">Finish this scene and continue story →</button>
                <p className="mt-2 text-xs text-slate-400">You decide when this scene ends. Your conversation is saved, with important personal details retained in Sabrina's private memory.</p>
              </div>
            </>}
            {save.chapter === "interview" && save.backstage?.status!=="open" && <>
              <p className="text-sm leading-7 text-slate-300">You're joining the live interview from Havana, with Sabrina appearing remotely from New York. The host and guests can address one another; you decide every word you say and when to finish.</p>
              <div className="space-y-3">{(save.interviewScene??createInterviewScene()).turns.map((turn,i)=><div key={i} className={"rounded-xl p-3 text-sm leading-7 "+(turn.speaker==="player"?"ml-4 bg-amber-300 text-slate-950":"mr-4 bg-[#0c1524] text-slate-200")}>
                <p className={"mb-1 text-xs font-bold "+(turn.speaker==="player"?"text-slate-700":"text-amber-300")}>{turn.speaker==="player"?"You":turn.speaker==="host"?"The host":turn.speaker}</p>
                <p className="whitespace-pre-wrap">{turn.text}</p></div>)}</div>
              {interviewBusy && <p className="text-xs text-amber-200">Interview guests are speaking…</p>}
              <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Suggested replies</p>
              <div className="space-y-2">{interviewSuggestedReplies(save.interviewScene??createInterviewScene()).map((line,i)=><button key={i} onClick={()=>setInterviewDraft(line)} className="block w-full rounded-xl border border-slate-700 bg-[#0c1524] p-3 text-left text-xs leading-5 text-slate-200 hover:border-amber-300">{line}</button>)}</div>
              <label htmlFor="interview-action" className="block text-xs font-bold uppercase tracking-widest text-amber-300">Or speak in your own words</label>
              <textarea id="interview-action" rows={4} maxLength={700} value={interviewDraft} onChange={e=>setInterviewDraft(e.target.value)} placeholder="I turn toward the cameras and say…" className="w-full resize-y rounded-xl border border-slate-700 bg-[#0c1524] p-3 text-sm text-slate-100 placeholder:text-slate-500"/>
              <button onClick={()=>void continueInterview()} disabled={!interviewDraft.trim()||interviewBusy} className="w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{interviewBusy?"The guests are responding…":"Say it · Continue live interview"}</button>
              {interviewError&&<p role="alert" className="text-sm text-red-300">{interviewError}</p>}
              <div className="border-t border-slate-700 pt-4">
                <button onClick={completeInterview} disabled={interviewBusy} className="rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40">End interview and continue the story →</button>
                <p className="mt-2 text-xs text-slate-400">Your remarks are saved. The game advances when you end the interview.</p>
              </div>
            </>}
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

        {tab === "life" && <section className="space-y-4">
          <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-[#30435b] to-[#172236] p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Your life, your choices</p>
            <h2 className="mt-2 font-display text-3xl">Make your own moves.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Travel, meet celebrities, buy businesses, organize parties, and pursue your own ambitions outside the campaign.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([["Cash",save.openWorld.cash],["Asset value",ventureValue(save.openWorld)],["Daily income",ventureIncome(save.openWorld)]] as [string,number][]).map(([label,value])=>
                <div key={label} className="rounded-xl bg-[#09111f] p-3"><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-amber-200">{"$"}{value.toLocaleString()}</p></div>)}
              <div className="rounded-xl bg-[#09111f] p-3"><p className="text-xs text-slate-400">Current city</p><p className="text-lg font-bold text-amber-200">{save.openWorld.city}</p></div>
            </div>
          </div>
          {socialNotice && <p role="status" className="rounded-xl border border-amber-300/30 bg-[#1e2a3a] p-3 text-sm text-amber-200">{socialNotice}</p>}
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-4">
            <h3 className="font-display text-2xl">Upcoming meetups</h3>
            <p className="my-2 text-xs text-slate-400">Travel to the planned city and attend on or after the scheduled game day.</p>
            {save.socialLife.visits.filter(v=>v.status==="planned").length===0 && <p className="rounded-xl bg-[#0c1524] p-3 text-sm">Nothing booked. Invite somebody from DMs!</p>}
            {save.socialLife.visits.filter(v=>v.status==="planned").map(v=><div key={v.contact + v.day} className="mt-2 rounded-xl bg-[#0c1524] p-3">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{SOCIAL_CAST[v.contact].name}</p><p className="text-xs text-slate-400">{v.kind} · {v.city} · Day {v.day}</p></div><button onClick={()=>setMeetupFocus(meetupFocus===v.contact?null:v.contact)} className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">Meet →</button></div>
              {meetupFocus===v.contact && <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
                <p className="text-xs leading-relaxed text-slate-300">You're going to meet {SOCIAL_CAST[v.contact].name}. How would you like to spend your time?</p>
                {([["personal","Have a real personal conversation"],["career","Talk business, careers and ambitions"],["fun","Enjoy the night and have some fun"]] as [MeetupApproach,string][]).map(([approach,label])=><button key={approach} onClick={()=>meetContact(v.contact,approach)} className="block w-full rounded-xl border border-slate-700 p-3 text-left text-xs text-amber-200">{label} →</button>)}
              </div>}
            </div>)}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-4">
            <h3 className="font-display text-2xl">Travel</h3>
            <p className="my-2 text-xs text-slate-400">Tickets cost {"$"}2,500 · Traveling advances one day.</p>
            <div className="grid grid-cols-2 gap-2">{CITIES.map(city=><button key={city} disabled={city===save.openWorld.city||save.chapter==="rescue"} onClick={()=>takeWorldAction({type:"travel",city})} className={"rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50 "+(city===save.openWorld.city?"border-amber-300 text-amber-200":"border-slate-700 bg-[#0c1524]")}>{city===save.openWorld.city?"📍 ":""}{city}</button>)}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-4">
            <h3 className="font-display text-2xl">Businesses and property</h3>
            <p className="my-2 text-xs text-slate-400">Own, operate, and expand assets that generate game-day income.</p>
            <div className="space-y-3">{(Object.entries(VENTURES) as [keyof typeof VENTURES,typeof VENTURES.nightclub][]).map(([id,v])=>{
              const owned=save.openWorld.ventures.find(o=>o.id===id);
              return <div key={id} className="rounded-xl border border-slate-700 bg-[#0c1524] p-3">
                <p className="font-semibold text-amber-200">{v.name}</p><p className="mt-1 text-xs text-slate-300">{v.description}</p><p className="mt-1 text-xs text-slate-500">{v.city} · {owned?"Level "+owned.level:"Not owned"}</p>
                {owned && <p className="mt-1 text-xs text-emerald-300">Income: {"$"}{(v.income*owned.level).toLocaleString()}/day</p>}
                <div className="mt-3 flex flex-wrap gap-2">{!owned?
                  <button disabled={save.chapter==="rescue"||save.openWorld.cash<v.cost} onClick={()=>takeWorldAction({type:"buy",venture:id})} className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">Buy · {"$"}{v.cost.toLocaleString()}</button>:
                  <><button disabled={owned.level>=5||save.openWorld.cash<v.upgrade*owned.level} onClick={()=>takeWorldAction({type:"upgrade",venture:id})} className="rounded-full border border-amber-300 px-4 py-2 text-xs text-amber-200 disabled:opacity-40">Upgrade · {"$"}{(v.upgrade*owned.level).toLocaleString()}</button>
                  <button onClick={()=>takeWorldAction({type:"work",venture:id})} className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">Manage</button></>}
                </div>
              </div>;
            })}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-4">
            <h3 className="font-display text-2xl">Social and political moves</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">{([
              [{type:"host",kind:"party"} as WorldAction,"Host party · $15k"],
              [{type:"host",kind:"fundraiser"} as WorldAction,"Fundraiser · $8k"],
              [{type:"host",kind:"townhall"} as WorldAction,"Public town hall · $4k"],
              [{type:"negotiate",target:"local"} as WorldAction,"Meet locals"],
              [{type:"negotiate",target:"international"} as WorldAction,"Diplomatic talks"],
              [{type:"negotiate",target:"opposition"} as WorldAction,"Meet opposition"],
            ] as [WorldAction,string][]).map(([action,label])=><button key={label} disabled={save.chapter==="rescue"} onClick={()=>takeWorldAction(action)} className="rounded-xl border border-slate-700 bg-[#0c1524] p-3 text-xs font-semibold disabled:opacity-40">{label}</button>)}</div>
          </div>
        </section>}
        {tab === "world" && <section className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5"><h2 className="flex items-center gap-2 font-display text-2xl"><Landmark className="text-amber-300" size={20}/> Political influence</h2><p className="mt-2 text-sm text-slate-300">{save.route === "undecided" ? "Your global ambitions have barely begun." : ENDINGS[save.route].title}</p><p className="mt-2 text-xs text-slate-400">Cuban support: {save.cubaSupport} · Stability: {save.campaign.stability} · Influence: {save.influence+empire.influence} · Power: {save.influence+save.globalPower.capacity+empire.power}</p>{campaignScene && <p className="mt-2 rounded-xl bg-[#0c1524] p-3 text-sm font-semibold text-amber-200">Political standing: {save.campaign.position === "outsider" ? "Independent outsider" : save.campaign.position === "delegate" ? "Transition delegate" : save.campaign.position === "candidate" ? "Presidential candidate" : "President of Cuba"}</p>}
            <p className="mt-2 text-xs text-amber-200">{campaignScene ? "Current objective: " + campaignScene.objective : "Complete the guided opening to unlock political missions."}</p>
            {campaignScene && <button onClick={() => setTab("activities")} className="mt-3 rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">Continue mission →</button>}
            <p className="mt-3 text-[11px] text-slate-500">National governance and international expansion are evolving; occupations and uprisings now have persistent consequences.</p></div>
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5">
            <h2 className="font-display text-2xl">Global campaigns · {COUNTRY_NAMES.length} countries</h2>
            <div className="mt-3 rounded-xl border border-amber-300/30 bg-[#0c1524] p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Your empire's contributions</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><p className="text-[11px] text-slate-400">Income per day</p><p className="text-lg font-bold text-amber-200">${empire.incomePerDay.toLocaleString()}</p></div>
                <div><p className="text-[11px] text-slate-400">Military reinforcements</p><p className="text-lg font-bold text-amber-200">+{empire.militaryStrength}</p></div>
                <div><p className="text-[11px] text-slate-400">Influence gained</p><p className="text-lg font-bold text-amber-200">+{empire.influence}</p></div>
                <div><p className="text-[11px] text-slate-400">Global power</p><p className="text-lg font-bold text-amber-200">+{empire.power}</p></div>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Controlled countries contribute the most. Partners and protectorates contribute less. Income is paid automatically when each game day advances.</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">Build influence through diplomacy, trade, armed conflict, or covertly funded uprisings. Military victories create contested occupations that require governing and consolidation; opponents react over multiple days.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#0c1524] p-3"><p className="text-xs text-slate-400">Global tension</p><p className="text-xl font-bold text-amber-300">{save.conquest.worldTension}%</p></div>
              <div className="rounded-xl bg-[#0c1524] p-3"><p className="text-xs text-slate-400">International prestige</p><p className="text-xl font-bold text-amber-300">{save.conquest.prestige}</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#0c1524] p-3"><p className="text-xs text-slate-400">Under your control</p><p className="text-xl font-bold text-amber-300">{COUNTRY_NAMES.filter(c=>save.conquest.territory[c]==="controlled").length}</p></div>
              <div className="rounded-xl bg-[#0c1524] p-3"><p className="text-xs text-slate-400">Allies and protectorates</p><p className="text-xl font-bold text-amber-300">{COUNTRY_NAMES.filter(c=>["partner","protectorate"].includes(save.conquest.territory[c]??"")).length}</p></div>
            </div>
            <p className="mt-3 text-xs text-amber-200">Available treasury: $ {save.openWorld.cash.toLocaleString()} · Integration requires $25,000, legitimacy 45+, and a day after settlement.</p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input aria-label="Search countries" value={countrySearch} onChange={e=>{setCountrySearch(e.target.value);setCountryPage(0);}} placeholder="Search 82 countries…" className="min-w-0 rounded-xl border border-slate-700 bg-[#0c1524] px-3 py-2 text-sm text-white"/>
              <select aria-label="Filter by region" value={regionFilter} onChange={e=>{setRegionFilter(e.target.value as WorldRegion | "All");setCountryPage(0);}} className="rounded-xl border border-slate-700 bg-[#0c1524] px-3 py-2 text-sm text-white">
                <option value="All">All regions</option>
                {COUNTRY_REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="mt-3 space-y-3">{COUNTRY_NAMES.filter(c=>(regionFilter==="All"||COUNTRY_RECORDS[c].region===regionFilter)&&c.toLowerCase().includes(countrySearch.trim().toLowerCase()))
              .slice(countryPage*12,countryPage*12+12).map(country=>{
              const active=activeCampaign(save.conquest,country);
              const last=[...save.conquest.campaigns].reverse().find(c=>c.country===country);
              const lastWon=[...save.conquest.campaigns].reverse().find(c=>c.country===country&&c.status==="won");
              const canIntegrate=save.campaign.position==="president"&&save.openWorld.cash>=25000&&save.globalPower.legitimacy>=45&&!!lastWon&&(save.conquest.territory[country]!=="occupied"||(lastWon.resistance<=40&&(lastWon.occupationSteps||0)>=2))&&save.day+1>lastWon.lastDecisionDay+1;
              const integrateReason=save.openWorld.cash<25000?"Need $25,000 cash (available: $"+save.openWorld.cash.toLocaleString()+").":save.globalPower.legitimacy<45?"Need at least 45 legitimacy (current: "+save.globalPower.legitimacy+").":lastWon&&save.conquest.territory[country]==="occupied"&&(lastWon.resistance>40||(lastWon.occupationSteps||0)<2)?"Occupation needs two civilian governance decisions and resistance at 40% or less (current: "+lastWon.resistance+"%, steps: "+(lastWon.occupationSteps||0)+"/2).":lastWon&&save.day+1<=lastWon.lastDecisionDay+1?"Wait one more game day after the agreement.":save.campaign.position!=="president"?"Presidential authority is required.":"Complete an international campaign first.";
              return <div key={country} className="rounded-xl border border-slate-700 bg-[#0c1524] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-bold text-amber-200">{country}</p><p className="text-xs text-slate-400">{(FOREIGN_LEADERS as Partial<Record<ForeignCountry,{name:string}>>)[country]?.name??COUNTRY_RECORDS[country].region+" · Government"}</p></div>
                  <span className="text-xs text-slate-300">{save.conquest.territory[country]==="controlled"?"Under your control":save.conquest.territory[country]==="partner"?"Cooperation partner":save.conquest.territory[country]==="protectorate"?"Protectorate":save.conquest.territory[country]==="occupied"?"Occupied territory":active?"Campaign active":last?"Last: "+last.status:"Independent"}</span>
                </div>
                {active?<div className="mt-3 space-y-2">
                  <p className="text-xs text-slate-300">{active.method} · Stage {active.stage+1} · Momentum {active.progress}% · Resistance {active.resistance}%</p>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-amber-300" style={{width:active.progress+"%"}}/></div>
                   {active.progress===100 && <p className="mt-2 text-xs text-amber-200">Maximum momentum reached. This is not yet a victory: {active.method==="military"?"a surprise offensive, six stages, 90% momentum, resistance 55% or less, and defense 65+ can establish occupation; alternatively, compromise needs resistance 35% or less and tension below 65.":active.method==="uprising"?"two funding actions, six stages, and resistance 45% or less are required for the uprising coalition to prevail.":"political resistance must fall to 60% or less for a ratified agreement."} Your campaign will not automatically expire while momentum is maxed.</p>}
                  {active.log.length>0&&<p className="rounded-lg bg-[#19283b] p-2 text-xs leading-5 text-slate-300">{active.log[active.log.length-1]?.text}</p>}
                  <div className="grid grid-cols-2 gap-2">{([
                    ["negotiate","Negotiations"],["invest","Invest"],["persuade","Win public support"],["pressure","Apply pressure"],
                    ["defend","Strategic defense"],["surprise","Surprise offensive · $28k"],["fund","Finance uprising · $16k"],["compromise","Offer compromise"],["withdraw","Withdraw"],
                  ] as [CampaignMove,string][]).filter(([m])=>active.method==="military"?m!=="invest"&&m!=="fund"&&(m!=="surprise"||!active.surpriseUsed):active.method==="uprising"?m!=="defend"&&m!=="invest"&&m!=="surprise":m!=="defend"&&m!=="surprise"&&m!=="fund").map(([move,label])=>
                    <button key={move} onClick={()=>chooseInternationalMove(active.id,move)} className="rounded-lg border border-slate-600 p-2 text-left text-xs text-slate-200 hover:border-amber-300">{label}</button>)}</div>
                </div>:save.conquest.territory[country]==="independent"?
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-400">{COUNTRY_RECORDS[country].region} · Resistance {COUNTRY_RECORDS[country].resistance}% · Diplomatic trust {save.globalPower.relations[country].trust}</p>
                    {save.globalPower.relations[country].trust<40 && <div className="space-y-1"><button disabled={save.openWorld.cash<2500} onClick={()=>takeNationalAction({type:"diplomacy",country,mode:"contact"})} className="rounded-full border border-amber-300/60 px-3 py-2 text-xs text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">Open diplomatic channel · $2,500</button>{save.openWorld.cash<2500&&<p className="text-xs text-amber-200">Need $2,500 cash. Available: $ {save.openWorld.cash.toLocaleString()}. Earn income by advancing game days or expanding your businesses.</p>}</div>}
                    <div className="flex flex-wrap gap-2">{([
                    ["diplomacy","Diplomatic campaign"],["economic","Economic expansion"],["military","Open military campaign"],["uprising","Finance an uprising"]
                  ] as [CampaignMethod,string][]).map(([method,label])=><button key={method}
                    disabled={save.campaign.position!=="president"|| (method==="diplomacy"&&save.globalPower.relations[country].trust<40) || (method==="military"&&save.globalPower.capacity+empireTotals(save.conquest).militaryStrength<55) || (method==="uprising"&&save.influence+empireTotals(save.conquest).influence+Math.floor(empireTotals(save.conquest).power/2)<60)}
                    onClick={()=>startInternationalCampaign(country,method)}
                    className="rounded-full border border-amber-300/40 px-3 py-2 text-xs text-amber-100 disabled:opacity-30">{label}</button>)}</div></div>:
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-emerald-300">{save.conquest.territory[country]==="controlled"?"Part of your international union.":save.conquest.territory[country]==="occupied"?"Occupied: rebuild services, grant civilian autonomy, or strengthen security before integration.":"An earned agreement is in place."}</p>
                    {save.conquest.territory[country]==="occupied"&&<div className="grid grid-cols-2 gap-2">{([
                       ["services","Rebuild services · $18k"],["autonomy","Grant local autonomy · $7k"],["security","Strengthen security · $12k"]
                     ] as ["services"|"autonomy"|"security",string][]).map(([action,label])=><button key={action} disabled={save.openWorld.cash<(action==="services"?18000:action==="autonomy"?7000:12000)} onClick={()=>handleOccupation(country,action)} className="rounded-lg border border-slate-600 p-2 text-xs text-slate-200 disabled:opacity-30">{label}</button>)}</div>}
                     {save.conquest.territory[country]!=="controlled"&&<div className="space-y-2"><button disabled={!canIntegrate} onClick={()=>integrateCountry(country)} className="rounded-full border border-amber-300/70 px-3 py-2 text-xs font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">Negotiate direct control · $25k</button>{!canIntegrate&&<p className="text-xs text-amber-200">{integrateReason}</p>}</div>}
                  </div>}
              </div>;
            })}</div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button disabled={countryPage===0} onClick={()=>setCountryPage(p=>Math.max(0,p-1))} className="rounded-full border border-slate-700 px-4 py-2 text-xs disabled:opacity-30">Previous</button>
              <span className="text-xs text-slate-400">Page {countryPage+1} of {Math.max(1,Math.ceil(COUNTRY_NAMES.filter(c=>(regionFilter==="All"||COUNTRY_RECORDS[c].region===regionFilter)&&c.toLowerCase().includes(countrySearch.trim().toLowerCase())).length/12))}</span>
              <button disabled={(countryPage+1)*12>=COUNTRY_NAMES.filter(c=>(regionFilter==="All"||COUNTRY_RECORDS[c].region===regionFilter)&&c.toLowerCase().includes(countrySearch.trim().toLowerCase())).length} onClick={()=>setCountryPage(p=>p+1)} className="rounded-full border border-slate-700 px-4 py-2 text-xs disabled:opacity-30">Next</button>
            </div>
            <p className="mt-3 text-xs text-slate-400">You need the Cuban presidency to launch state-level campaigns. The world continues to react even when plans fail.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#172236] p-5">
            <h2 className="font-display text-2xl">International power</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Build relations with other governments, strengthen Cuba's defensive capabilities, and turn influence into actual international negotiations.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {([["Defense readiness",save.globalPower.defense],["Military capacity",save.globalPower.capacity+empire.militaryStrength],["Legitimacy",save.globalPower.legitimacy]] as [string,number][]).map(([name,n])=><div key={name} className="rounded-xl bg-[#0c1524] p-3"><p className="text-lg font-bold text-amber-200">{n}%</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{name}</p></div>)}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-amber-300">Your strategic ambition</p>
            <p className="mt-1 text-xs text-slate-300">{save.globalPower.strategy==="private"?"Private. No one knows you have ambitions beyond your public political work.":"Public. You have announced a wider international ambition and foreign leaders can respond."}</p>
            {save.globalPower.strategy==="private" ? <button onClick={()=>takeNationalAction({type:"strategy",mode:"disclosed"})} className="mt-3 rounded-full border border-amber-300/70 px-4 py-2 text-xs text-amber-200">Reveal ambition publicly (permanent)</button> : <p className="mt-2 text-xs text-amber-200">This public declaration is now part of the world’s history.</p>}
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-amber-300">Diplomatic relationships</p>
            <div className="mt-2 space-y-3">{(Object.entries(FOREIGN_LEADERS) as [keyof typeof FOREIGN_LEADERS,(typeof FOREIGN_LEADERS)[keyof typeof FOREIGN_LEADERS]][]).map(([country,leader])=>{
              const rel=save.globalPower.relations[country];
              return <div key={country} className="rounded-xl border border-slate-700 bg-[#0c1524] p-3">
                <div className="flex justify-between gap-2"><div><p className="text-sm font-semibold">{country}</p><p className="text-xs text-slate-400">{leader.name} · {rel.status}</p></div><p className="text-xs text-amber-200">Trust {rel.trust}</p></div>
                <div className="mt-3 flex flex-wrap gap-2">{([
                  ["contact","Open channel"],["summit","Hold summit"],["trade","Trade talks"],["treaty","Cooperation treaty"],["pressure","Apply pressure"],
                ] as const).map(([mode,label])=><button key={mode} onClick={()=>takeNationalAction({type:"diplomacy",country,mode})}
                  disabled={save.chapter!=="cuba"||(save.campaign.position!=="president"&&save.influence<30)||(mode==="treaty"&&rel.trust<55)}
                  className="rounded-full border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-30">{label}</button>)}</div>
                <div className="mt-2 flex flex-wrap gap-2">{([
                  ["show-force","Show of force"],["intervene","Military intervention"],["deescalate","Seek de-escalation"],
                ] as const).map(([mode,label])=><button key={mode} onClick={()=>takeNationalAction({type:"military",country,mode})}
                  disabled={save.campaign.position!=="president"||(mode==="intervene"&&(save.globalPower.defense<55||save.globalPower.capacity<40))}
                  className="rounded-full border border-rose-800/70 px-3 py-2 text-xs text-rose-200 disabled:opacity-30">{label}</button>)}</div>
              </div>;
            })}</div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-amber-300">Defense ministry</p>
            <p className="mt-1 text-xs text-slate-400">Strategic posture, training and defensive readiness; no tactical operational targeting.</p>
            <div className="mt-3 flex flex-wrap gap-2">{([
              ["readiness","Readiness review"],["training","Train forces"],["modernize","Modernize"],["mobilize","Raise alert"],["standdown","Stand down"],
            ] as const).map(([mode,label])=><button key={mode} onClick={()=>takeNationalAction({type:"defense",mode})}
              disabled={save.chapter!=="cuba"||(save.campaign.position!=="president"&&save.influence<30)}
              className="rounded-full border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-30">{label}</button>)}</div>
            {save.globalPower.lastEvent && <p className="mt-3 rounded-xl bg-[#0c1524] p-3 text-sm text-slate-300">{save.globalPower.lastEvent}</p>}
          </div>
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
          <div className="flex flex-wrap items-start gap-2"><button onClick={nextDay} disabled={save.chapter === "rescue"} className="rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">Advance one day</button><details className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-slate-400"><summary className="cursor-pointer">Save options</summary><p className="mt-3 max-w-xs">Progress saves in this browser, not to Tess's database. Clearing website data erases it.</p><div className="mt-3 space-y-2">
              <button className="flex items-center gap-2 rounded-full border border-amber-300/50 px-3 py-2 text-xs text-amber-200" onClick={replayFromBeginning}><RotateCcw size={13}/> Start fresh playthrough (backs up current world)</button>
              <button className="block rounded-full border border-slate-600 px-3 py-2 text-xs text-slate-200" onClick={restoreReplayBackup}>Restore previous playthrough</button>
              <p className="text-[11px] text-slate-500">The backup is stored in this same browser only. Clearing site data or switching devices can erase it.</p>
              {replayNotice&&<p role="status" className="text-xs text-amber-200">{replayNotice}</p>}
            </div></details></div>
        </section>}
        <p className="mt-7 text-center text-[11px] leading-5 text-slate-500">WORLD ORDER · ALTERNATE-HISTORY GAME · PREVIEW</p>
      </div>
    </main>
  );
}
