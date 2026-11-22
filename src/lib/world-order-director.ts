/** Deterministic, low-cost World Order director. No model calls or hidden mutations.
 * A single game-day transition may generate at most one independent news event.
 * Real people aren't assigned fabricated private actions or beliefs.
 */
export type DirectorMode = "realistic" | "balanced" | "chaotic";
export type DirectorRoute = "undecided" | "reform" | "investment" | "diplomacy";
export type DirectorChapter = "rescue" | "interview" | "cuba";
export type DirectorEvent = {
  id: string;
  day: number;
  author: string;
  category: "Culture" | "Politics" | "World" | "Business" | "Community";
  summary: string;
  influenceDelta: number;
  supportDelta: number;
};
type Trigger = "public_post" | "activity" | "pass_day";
type Candidate = Omit<DirectorEvent, "id" | "day">;
const EVENT_POOL: Record<DirectorChapter, Candidate[]> = {
  rescue: [
    { author: "CultureBeat", category: "Culture", summary: "Entertainment outlets continue discussing the concert rescue and the unusually fast rise of its unlikely hero.", influenceDelta: 0, supportDelta: 0 },
    { author: "Maya Torres", category: "Culture", summary: "A fictional entertainment reporter asks witnesses what happened backstage and how the rescue has changed their lives.", influenceDelta: 0, supportDelta: 0 },
    { author: "The Public Square", category: "Community", summary: "Local communities debate whether sudden viral fame translates into lasting influence.", influenceDelta: 0, supportDelta: 0 },
  ],
  interview: [
    { author: "Nora Wells", category: "Politics", summary: "A fictional Washington reporter reviews reactions to the interview and requests a follow-up conversation.", influenceDelta: 1, supportDelta: 0 },
    { author: "WorldWire", category: "World", summary: "Commentators discuss the growing visibility of a new public figure amid international uncertainty.", influenceDelta: 1, supportDelta: 0 },
    { author: "CultureBeat", category: "Culture", summary: "The entertainment press wonders what the concert hero will do with national attention.", influenceDelta: 0, supportDelta: 0 },
  ],
  cuba: [
    { author: "Sofía Reyes", category: "World", summary: "In fictional Havana, local reporters ask how reform proposals would affect daily life and civil institutions.", influenceDelta: 0, supportDelta: 1 },
    { author: "WorldWire", category: "Politics", summary: "Regional governments seek assurances that any Cuban political transition will be peaceful and legitimate.", influenceDelta: 0, supportDelta: 0 },
    { author: "Lucía Herrera", category: "Business", summary: "Cuban entrepreneurs debate economic reforms, employee protections, and access to investment.", influenceDelta: 0, supportDelta: 1 },
    { author: "Rafael Morales", category: "Community", summary: "Residents in Havana organize a public discussion about stability, sovereignty, and accountability.", influenceDelta: 0, supportDelta: 1 },
  ],
};
const ROUTE_EVENTS: Record<Exclude<DirectorRoute, "undecided">, Candidate> = {
  reform: { author: "Elena Valdés", category: "Politics", summary: "A fictional civic coalition opens a public forum on the proposed transition and invites skeptical local groups.", influenceDelta: 1, supportDelta: 1 },
  investment: { author: "Lucía Herrera", category: "Business", summary: "A group of local business owners requests transparent terms for reconstruction funding and worker protections.", influenceDelta: 0, supportDelta: 1 },
  diplomacy: { author: "WorldWire", category: "World", summary: "Foreign diplomats signal cautious interest in exploratory talks; no treaty or recognition has been agreed.", influenceDelta: 1, supportDelta: 0 },
};
export function directorInterval(mode: DirectorMode): number {
  return mode === "realistic" ? 5 : mode === "chaotic" ? 1 : 2;
}
export function directorEvent(args: {
  day: number;
  mode: DirectorMode;
  chapter: DirectorChapter;
  route: DirectorRoute;
  trigger: Trigger;
  alreadyEmittedIds: readonly string[];
}): DirectorEvent | null {
  const { day, mode, chapter, route, trigger, alreadyEmittedIds } = args;
  if (!Number.isSafeInteger(day) || day < 2 || day > 100000) return null;
  if (day % directorInterval(mode) !== 0) return null;
  const id = `director:${day}`;
  if (alreadyEmittedIds.includes(id)) return null;
  const pool = EVENT_POOL[chapter];
  // Fixed selections are reproducible when reloading or replaying a save.
  const routeEvent = chapter === "cuba" && route !== "undecided" && day % 4 === 0
    ? ROUTE_EVENTS[route]
    : null;
  const selected = routeEvent ?? pool[(day + (trigger === "public_post" ? 1 : trigger === "activity" ? 2 : 0)) % pool.length];
  // A director event does not silently alter high-impact canon such as election
  // results, foreign recognition, relationships, pregnancies, or territorial control.
  return { ...selected, day, id };
}
