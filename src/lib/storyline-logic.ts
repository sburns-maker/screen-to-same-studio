import { CANON_NPCS, hashSeed, mulberry32, type PlannedEvent, type LinkRow } from "./social-logic";
import type { LifeEvent, TessActivity } from "./tess-life";
import { physicalStoryAllowed } from "./calendar-commitment";

export const STORY_LIMIT = 1; // per character, including shared involvement
export const STORY_STEPS_PER_TICK = 10;
export const STORY_COOLDOWN_DAYS = 3;
const DAY = 86_400_000;
export type StoryStage = "beginning" | "development" | "complication" | "decision" | "postponed" | "resolved" | "faded" | "continuing";
export type StoryState = {
  version: 1; template: string; owner: string; characters: string[]; npc: string;
  stage: StoryStage; step: number; startedAt: string; updatedAt: string; nextAt: string | null;
  summary: string; mood: LifeEvent["mood"]; availability: LifeEvent["availability"];
  materialized?: boolean;
};
type Template = { key: string; owner: string; npc: string; title: string; location: string; start: string; develop: string; complication: string; decision: string; outcomes: string[]; photo: string };
export const STORY_TEMPLATES: Template[] = [
  { key: "clinic_rota", owner: "tess", npc: "Sam", title: "Clinic rota review", location: "the veterinary practice", start: "Tess and Sam are reviewing uneven clinic shift coverage", develop: "they are trying a revised rota for a few days", complication: "the trial leaves an awkward lunchtime coverage gap", decision: "they are comparing a smaller adjustment with keeping the trial", outcomes: ["they kept a small rota adjustment that made handovers easier", "they returned to the old rota; the trial was not worth the extra work"], photo: "a handwritten rota beside a coffee, with no client details" },
  { key: "evan_plans", owner: "tess", npc: "Evan", title: "Helping Evan compare wedding plans", location: "home", start: "Evan has asked Tess to help compare a few wedding planning options", develop: "they have narrowed the practical options without settling anything", complication: "one option no longer fits the family budget", decision: "Evan is weighing the simpler options with Tess's practical input", outcomes: ["Evan picked a simpler option; Tess's part in comparing it is finished", "Evan decided to leave the choice for later; Tess is no longer actively helping"], photo: "a notebook of practical planning notes" },
  { key: "maya_event", owner: "maya", npc: "Tasha", title: "Venue preparation project", location: "the venue", start: "Maya and Tasha are testing a clearer setup checklist for upcoming venue work", develop: "they are trying the checklist during normal preparations", complication: "some supplier timings do not fit their first draft", decision: "they are deciding which parts to simplify", outcomes: ["they kept the useful checklist sections and dropped the rest", "they shelved the checklist; the existing routine worked better"], photo: "setup supplies and an ordinary checklist without customer details" },
  { key: "maya_visit", owner: "maya", npc: "Becca", title: "Making time for Becca", location: "home", start: "Maya and Becca are looking for a weekend when they can spend time together", develop: "they have compared calendars and a low-key visit looks possible", complication: "their work plans have shifted and the first dates no longer fit", decision: "they are considering a shorter visit instead of a whole weekend", outcomes: ["they managed a short, relaxed catch-up and enjoyed it", "they decided on a long phone catch-up rather than travel this time"], photo: "coffee and snacks ready for a quiet catch-up" },
  { key: "claire_library", owner: "claire", npc: "Mrs. Abernathy", title: "Library display project", location: "the school library", start: "Claire is discussing a small library display refresh with Mrs. Abernathy", develop: "Claire is testing a modest display using books already available", complication: "there is less shelf space than expected", decision: "Claire is weighing a smaller rotating selection", outcomes: ["Claire finished a smaller display that fits the space", "Claire kept the existing shelves and saved the idea for another term"], photo: "books and a small display, no pupils in frame" },
  { key: "claire_visit", owner: "claire", npc: "Natalie", title: "Planning time with Natalie", location: "Claire's home", start: "Claire and Natalie are planning some unhurried family time around their usual visits", develop: "Claire is fitting preparation and a simple meal around her library work", complication: "Natalie's family schedule makes the original plan awkward", decision: "they are considering a shorter visit with less preparation", outcomes: ["they had a relaxed meal together; keeping it simple helped", "they chose a short catch-up rather than the longer family plan"], photo: "ordinary meal preparation in the kitchen" },
  { key: "jordan_project", owner: "jordan", npc: "Patel", title: "Drafting review", location: "the engineering office", start: "Jordan and Patel are working through a non-urgent drafting review", develop: "Jordan has tried a more precise way to organize the review notes", complication: "one detail needs another pass before they can settle it", decision: "they are choosing between a small revision and the existing approach", outcomes: ["they accepted the small revision and closed the review", "they kept the original approach after checking the alternatives"], photo: "a notebook and pencils with no confidential drawings visible" },
  { key: "jordan_climb", owner: "jordan", npc: "Ruth", title: "Working on a climbing technique", location: "the climbing gym", start: "Jordan and Ruth are working patiently on a climbing technique during their normal sessions", develop: "they are making small adjustments rather than chasing a big milestone", complication: "the current approach is tiring without much improvement", decision: "they are considering an easier practice route for a while", outcomes: ["Jordan found a small technique adjustment useful and moved on", "Jordan set that technique aside and returned to comfortable routes"], photo: "chalk bag and climbing shoes at the gym" },
  { key: "ben_work", owner: "ben", npc: "Mikey", title: "Organizing the work van", location: "the work van", start: "Ben and Mikey are trying to make the van's tool storage less chaotic", develop: "they are testing a simpler arrangement between normal jobs", complication: "the first arrangement makes a frequently used tool awkward to reach", decision: "they are choosing a practical compromise", outcomes: ["they kept a simpler tool layout that saves some rummaging", "they restored most of the old layout and labeled a few boxes instead"], photo: "ordinary toolboxes, with no customer addresses visible" },
  { key: "ben_family", owner: "ben", npc: "Sarah", title: "Finding room for a family outing", location: "home", start: "Ben and Sarah are trying to fit a simple family outing around work and the kids' plans", develop: "they are comparing a few nearby, low-effort options", complication: "the first day conflicts with another family commitment", decision: "they are considering a shorter outing closer to home", outcomes: ["they enjoyed a short local family outing without making a big production of it", "they stayed home for a relaxed family afternoon instead"], photo: "packed snacks or an ordinary family picnic setting, no children in frame" },
];

type Domain = "work" | "family" | "hobby" | "home" | "community";
const DOMAINS: Record<string, Domain[]> = { coworker: ["work"], family: ["family", "home"], hobby: ["hobby", "community"], friend: ["home", "community", "hobby"], acquaintance: ["community"] };
const PLACES: Record<Domain, string> = { work: "work", family: "a family member's home", hobby: "their usual hobby spot", home: "home", community: "around town near Altoona" };
type Incident = { key: string; title: string; start: string; develop: string; complication: string; decision: string; outcomes: [string, string]; photo: string };
const INCIDENTS: Record<Domain, Incident[]> = {
  work: [
    { key: "equipment", title: "a piece of equipment acting up", start: "a piece of equipment keeps acting up", develop: "they are working around it while waiting on a repair", complication: "the replacement part is backordered", decision: "they are weighing repair against replacing it", outcomes: ["it got repaired and works fine again", "they replaced it and stopped fighting the old one"], photo: "the workspace with the troublesome equipment" },
    { key: "rush", title: "a busy stretch", start: "work is heading into an unusually busy stretch", develop: "the days are running long but manageable", complication: "someone is out sick during the rush", decision: "they are deciding what can wait until it eases", outcomes: ["the busy stretch passed and things calmed down", "it eased off gradually without any big moment"], photo: "a cluttered desk or counter mid-shift" },
    { key: "training", title: "learning a new process", start: "there's a new process to learn", develop: "practice runs are going okay", complication: "the new process has a confusing step", decision: "they are choosing whether to adapt it or push back", outcomes: ["the new process stuck and feels normal now", "they kept parts of it and quietly dropped the rest"], photo: "printed instructions with a coffee" },
    { key: "disagreement", title: "a mild disagreement at work", start: "there's a mild disagreement about how to handle something at work", develop: "they each tried their own approach for a bit", complication: "the disagreement resurfaced over a small detail", decision: "they are looking for a reasonable middle ground", outcomes: ["they settled on a compromise and moved on", "it fizzled out without either side really winning"], photo: "an ordinary view of the workplace" },
    { key: "opportunity", title: "a small opportunity at work", start: "a small new responsibility was offered", develop: "they are trying it out alongside normal duties", complication: "it takes more time than expected", decision: "they are deciding whether to keep it", outcomes: ["they kept the new responsibility and like it", "they handed it back; it wasn't worth the extra time"], photo: "a notebook of ideas" },
  ],
  family: [
    { key: "visit", title: "a family visit", start: "a family visit is being talked about", develop: "dates are being compared", complication: "the first date stopped working", decision: "they are considering a shorter visit", outcomes: ["the visit happened and was pleasant", "it turned into a long phone call instead"], photo: "a tidied living room or a simple meal" },
    { key: "help", title: "helping family with a project", start: "family asked for help with a practical project", develop: "they spent a couple of evenings on it", complication: "the project turned out bigger than described", decision: "they are working out how much more to take on", outcomes: ["the project got finished together", "they helped with part and someone else finished it"], photo: "tools or boxes from the project" },
    { key: "health", title: "a family member's minor health worry", start: "a family member has a minor health worry", develop: "an appointment has been scheduled", complication: "the appointment got pushed back", decision: "they are waiting on what the doctor says", outcomes: ["it turned out to be nothing serious", "it's being managed with some small changes"], photo: "a mug of tea at home" },
    { key: "celebration", title: "planning a family celebration", start: "a small family celebration is coming up", develop: "plans are taking shape", complication: "people disagree about where to hold it", decision: "they are choosing a simple option", outcomes: ["the celebration went well", "it ended up smaller than planned, which was fine"], photo: "a card or a cake" },
  ],
  hobby: [
    { key: "goal", title: "a personal hobby goal", start: "there's a small personal goal in a hobby", develop: "progress is steady but slow", complication: "a plateau has been frustrating", decision: "they are deciding whether to change approach", outcomes: ["they hit the goal and moved on", "they relaxed the goal and enjoyed it more"], photo: "hobby gear laid out" },
    { key: "event", title: "a hobby event", start: "there's a hobby event coming up", develop: "they are casually preparing for it", complication: "the date conflicts with something else", decision: "they are deciding whether to go", outcomes: ["they went and had a good time", "they skipped it this time and didn't mind"], photo: "a flyer or the venue" },
    { key: "newperson", title: "someone new in a hobby group", start: "someone new joined their hobby group", develop: "they have chatted a few times", complication: "the newcomer has different expectations", decision: "they are seeing whether they click", outcomes: ["they became friendly acquaintances", "they stayed polite but never really connected"], photo: "the hobby space" },
  ],
  home: [
    { key: "repair", title: "a home repair", start: "something at home needs repairing", develop: "a fix has been scheduled", complication: "the first fix didn't fully work", decision: "they are deciding between patching and replacing", outcomes: ["it got properly fixed", "a patch is holding for now"], photo: "the spot that needed fixing" },
    { key: "declutter", title: "decluttering a room", start: "they started decluttering a room", develop: "a few bags are out the door", complication: "it stalled halfway", decision: "they are deciding what to keep", outcomes: ["the room is finally organized", "it stalled at good enough"], photo: "boxes and a half-sorted room" },
    { key: "rearrange", title: "rearranging the furniture", start: "they want to rearrange some furniture", develop: "they tried a new layout", complication: "the new layout blocks something", decision: "they are choosing between layouts", outcomes: ["the new layout stuck", "it went back mostly how it was"], photo: "a rearranged corner" },
  ],
  community: [
    { key: "fundraiser", title: "a local fundraiser", start: "a local fundraiser asked for volunteers", develop: "they signed up for a small shift", complication: "the schedule got shuffled", decision: "they are deciding whether to stay involved", outcomes: ["the fundraiser went well", "they helped once and stepped back"], photo: "a table of donated items" },
    { key: "street", title: "a neighborhood issue", start: "there's a minor neighborhood issue being discussed", develop: "neighbors are trading ideas", complication: "nobody agrees on a fix", decision: "they are waiting to see what happens", outcomes: ["it got sorted out", "it faded and nobody mentions it anymore"], photo: "an ordinary street view" },
  ],
};
// Twists vary the complication, so the same situation type unfolds differently.
const TWISTS: [string, (c: string) => string][] = [["a", c => c], ["b", () => "the timing clashed with another commitment"], ["c", () => "it ended up costing more time or money than expected"], ["d", () => "someone involved changed their mind partway through"]];
// Only established (canon) NPCs anchor storylines; exes are left out to avoid manufactured drama.
for (const n of CANON_NPCS) if (n.category !== "ex") for (const d of DOMAINS[n.category] ?? []) for (const i of INCIDENTS[d]) for (const [tk, twist] of TWISTS) {
  const who = n.name;
  STORY_TEMPLATES.push({ key: `gen:${n.characterKey}:${d}:${i.key}:${who.replace(/\W+/g, "_").toLowerCase()}:${tk}`, owner: n.characterKey, npc: who, title: `${i.title[0]!.toUpperCase()}${i.title.slice(1)} (with ${who})`, location: PLACES[d], start: `${i.start}; ${who} (${n.relation}) is involved`, develop: i.develop, complication: twist(i.complication), decision: i.decision, outcomes: [...i.outcomes], photo: `${i.photo}, ordinary, with private details hidden` });
}

export function readStory(value: unknown): StoryState | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<StoryState>;
  if (s.version !== 1 || !STORY_TEMPLATES.some(t => t.key === s.template && t.owner === s.owner) || !Array.isArray(s.characters) || typeof s.step !== "number" || typeof s.summary !== "string" || typeof s.updatedAt !== "string" || typeof s.startedAt !== "string") return null;
  return s as StoryState;
}
export function storyActive(s: StoryState): boolean { return s.nextAt !== null; }
/** Workplace milestones wait while any participant is off work or on a calendar outing. */
export function storyMayAdvance(s: StoryState, now: Date, committed: ReadonlySet<string>): boolean {
  const t = STORY_TEMPLATES.find(x => x.key === s.template);
  if (!t) return true;
  return s.characters.every(c => physicalStoryAllowed(t.location, t.start, now, committed.has(c)));
}

/** Tenant-specific, non-repeating topic selection; never reads user conversations. */
export function beginStories(userId: string, now: Date, existing: StoryState[], links: LinkRow[], committed: ReadonlySet<string> = new Set()): { id: string; state: StoryState }[] {
  const out: { id: string; state: StoryState }[] = [];
  for (const owner of ["tess", "maya", "claire", "jordan", "ben", "sienna"]) {
    const all = [...existing, ...out.map(x => x.state)];
    if (all.filter(s => storyActive(s) && s.characters.includes(owner)).length >= STORY_LIMIT) continue;
    const previous = all.filter(s => s.characters.includes(owner)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (previous && now.getTime() - Date.parse(previous.updatedAt) < STORY_COOLDOWN_DAYS * DAY) continue;
    const available = STORY_TEMPLATES.filter(t => t.owner === owner && !existing.some(s => s.template === t.key) && physicalStoryAllowed(t.location, t.start, now, committed.has(owner)));
    if (!available.length) continue;
    const rng = mulberry32(hashSeed(`${userId}:${owner}:${existing.filter(s => s.owner === owner).length}:${Math.floor(now.getTime()/DAY)}`));
    const t = available[Math.floor(rng() * available.length)];
    if (!t) continue;
    const characters = [owner];
    const friend = links.find(l => l.characterKey === owner && l.otherType === "character" && ["friend", "close_friend", "family"].includes(l.level) && !all.some(s => storyActive(s) && s.characters.includes(l.otherKey)));
    // An actual established friend can help with a practical project, not be retroactively made family.
    if (friend && !["evan_plans", "claire_visit", "ben_family"].includes(t.key) && rng() < 0.12) characters.push(friend.otherKey);
    const startedAt = now.toISOString();
    out.push({ id: `life-story:${userId}:${t.key}`, state: { version: 1, template: t.key, owner, characters, npc: t.npc, stage: "beginning", step: 0, startedAt, updatedAt: startedAt, nextAt: new Date(now.getTime() + (3 + Math.floor(rng()*3))*DAY).toISOString(), summary: t.start, mood: "neutral", availability: "normal" } });
  }
  return out;
}

/** One stable branch per milestone; catch-up proceeds chronologically, never rerolls. */
export function advanceStory(id: string, s: StoryState): StoryState {
  if (!s.nextAt) return s;
  const t = STORY_TEMPLATES.find(t => t.key === s.template);
  if (!t) return s;
  const step = s.step + 1;
  const rng = mulberry32(hashSeed(`${id}:${step}`));
  const roll = rng();
  let stage: StoryStage; let summary: string;
  if (step >= 6 || (s.stage === "decision" && roll < 0.75)) {
    stage = roll < 0.68 ? "resolved" : roll < 0.86 ? "faded" : "continuing";
    summary = stage === "resolved" ? (t.outcomes[Math.floor(rng()*t.outcomes.length)] ?? t.outcomes[0] ?? "the practical work is finished") : stage === "faded" ? "the plan has quietly fallen out of priority; no definite outcome was agreed" : "the matter remains open with no deadline or definite outcome; ordinary life continues";
  } else if (roll < 0.18 && s.stage !== "postponed") {
    stage = "postponed"; summary = "the next step has been postponed to fit ordinary work and family commitments; nothing has been settled";
  } else if (step === 1 || s.stage === "postponed") { stage = "development"; summary = t.develop;
  } else if (step <= 3 && roll < 0.55) { stage = "complication"; summary = t.complication;
  } else { stage = "decision"; summary = t.decision; }
  const terminal = ["resolved", "faded", "continuing"].includes(stage);
  return { ...s, stage, step, updatedAt: s.nextAt, nextAt: terminal ? null : new Date(Date.parse(s.nextAt) + (stage === "postponed" ? 7 : 3) * DAY + Math.floor(rng()*3)*DAY).toISOString(), summary: `${t.title}: ${summary}`, mood: terminal ? (stage === "resolved" ? "up" : "neutral") : stage === "complication" ? "stressed" : "neutral", availability: !terminal && ["development", "complication"].includes(stage) ? "busy" : "normal" };
}

export function storyEvent(id: string, s: StoryState): PlannedEvent {
  const t = STORY_TEMPLATES.find(t => t.key === s.template);
  return { id: `${id}:step:${s.step}`, characterKey: s.owner, title: t?.title ?? s.template, kind: "life_development", location: t?.location ?? "home", occursAt: new Date(s.updatedAt), facts: { story_id: id, step: s.step, stage: s.stage, development: s.summary }, participants: [...s.characters.map(key => ({ type: "character" as const, key, met: [] as string[], perspective: key === s.owner ? "Directly involved; may choose to keep this private." : "Helped with this practical matter; has their own perspective." })), { type: "npc", key: s.npc, met: [] as string[], perspective: "Involved in the practical situation." }] };
}

export function storyLifeEvent(s: StoryState, now: Date): LifeEvent | null {
  // A finished outcome remains memory, not a permanent mood/availability modifier.
  if (!storyActive(s) || now.getTime() - Date.parse(s.updatedAt) > 5*DAY) return null;
  return { id: `story:${s.template}`, summary: s.summary, mood: s.mood, availability: s.availability, days: 5 };
}
export function storySchedule(base: TessActivity, event: LifeEvent | null): TessActivity {
  if (!event || base.availability === "asleep") return base;
  // A clinic storyline may affect Tess emotionally on days off, but does not put her on shift.
  const offDay = /weekend/i.test(base.activity) || /weekend/i.test(base.detail);
  const clinicContext = /clinic|rota|shift coverage|staffing|vet practice|work schedule/i.test(event.summary);
  if (offDay && clinicContext) return { ...base, detail: `${base.detail}; off today` };
  return { ...base, availability: base.availability === "free" && event.availability === "busy" ? "limited" : base.availability, detail: `${base.detail}; ongoing situation: ${event.summary}` };
}
export function storyPrompt(s: StoryState): string {
  const t = STORY_TEMPLATES.find(t => t.key === s.template);
  return `[${s.updatedAt.slice(0,10)}; ${s.stage}] ${s.summary}. ${storyActive(s) ? `Current mood: ${s.mood}. Possible photo context only if actually doing it now: ${t?.photo ?? "ordinary surroundings"}.` : "This is remembered history, not something happening now."} Mention only if natural or relevant; privacy and unrelated conversation are valid. Never invent completion or demand user involvement.`;
}

/** Stable UUID for idempotent outcome memories, including recovery after partial writes. */
export function storyMemoryId(userId: string, character: string, id: string): string {
  const raw = [0,1,2,3].map(n => hashSeed(`${userId}:${character}:${id}:${n}`).toString(16).padStart(8,"0")).join("");
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-5${raw.slice(13,16)}-a${raw.slice(17,20)}-${raw.slice(20)}`;
}