/**
 * Social-world simulation: independent social circles, shared events and
 * per-character knowledge. Pure and deterministic — every decision derives
 * from a seeded RNG keyed on stable IDs, so re-running a tick never creates
 * duplicates or contradictory facts. No AI calls live here; the server tick
 * (social.server.ts) persists what these functions plan.
 *
 * Design rules (spec §1–§8):
 * - Each character has their OWN social network; playable characters are not
 *   one friend group. Canon cross-links are minimal ("knows_of" at most).
 * - Background NPCs influence events without being AI agents or contacts.
 * - Shared events have deterministic IDs and objective facts; participants
 *   may remember different aspects but facts never contradict.
 * - Knowledge is per-character: witnessed / told / rumor. Attending the same
 *   event does not create a relationship, and nobody learns anything just
 *   because it exists in the database.
 * - Relationships evolve rarely, with recorded reasons, never on a timer.
 */

export type LinkLevel =
  | "stranger"
  | "knows_of"
  | "acquaintance"
  | "familiar"
  | "friend"
  | "close_friend"
  | "family";

/** Ordered for "at least this close" comparisons (family handled separately). */
const LEVEL_RANK: Record<LinkLevel, number> = {
  stranger: 0,
  knows_of: 1,
  acquaintance: 2,
  familiar: 3,
  friend: 4,
  close_friend: 5,
  family: 6,
};

export function atLeast(level: LinkLevel, min: LinkLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

export type KnowledgeType = "witnessed" | "told" | "rumor" | "interpretation";

export type NpcSeed = {
  characterKey: string;
  name: string;
  relation: string;
  category: "family" | "friend" | "coworker" | "neighbor" | "hobby" | "ex" | "acquaintance";
  blurb: string;
};

export type LinkSeed = {
  characterKey: string;
  otherType: "character" | "npc";
  otherKey: string;
  level: LinkLevel;
  opinion: string;
  reason: string;
};

// ---------------------------------------------------------------------------
// Canon social networks. Each character's circle is independent; NPCs are
// background people, never contacts. Playable cross-links stay at knows_of.
// ---------------------------------------------------------------------------

export const CANON_NPCS: NpcSeed[] = [
  { characterKey: "sienna", name: "Avery", relation: "photography friend", category: "friend", blurb: "Fictional independent friend who exchanges photography ideas with Sienna; respects client privacy." },
  { characterKey: "sienna", name: "Ellis", relation: "bartending coworker", category: "coworker", blurb: "Fictional cocktail-bar coworker with their own shifts and opinions." },
  // Tess — family, vet practice, trivia team (consistent companions).
  { characterKey: "tess", name: "Denise", relation: "mother", category: "family", blurb: "Retired school secretary; keeps trying to set Tess up. The one person who calls her Jessica." },
  { characterKey: "tess", name: "Mark", relation: "father", category: "family", blurb: "HVAC tech nearing retirement; affectionately bickers with Denise." },
  { characterKey: "tess", name: "Evan", relation: "younger brother", category: "family", blurb: "30, planning a wedding next spring; sends venue options to vote on." },
  { characterKey: "tess", name: "Ryan", relation: "ex-boyfriend", category: "ex", blurb: "Dated 27–32, lived together; ended amicably-flat. Minimal contact." },
  { characterKey: "tess", name: "Dr. Halloran", relation: "boss", category: "coworker", blurb: "Owner of the veterinary practice Tess manages." },
  { characterKey: "tess", name: "Sam", relation: "vet tech", category: "coworker", blurb: "Tech at the practice; the scheduling gap Tess covers when someone's out." },
  { characterKey: "tess", name: "Marcus", relation: "trivia teammate", category: "hobby", blurb: "Thursday trivia regular; strong on sports, hopeless on music rounds." },
  { characterKey: "tess", name: "Lena", relation: "trivia teammate", category: "hobby", blurb: "Thursday trivia regular; the team's literature and film anchor." },
  { characterKey: "tess", name: "Dev", relation: "trivia teammate", category: "hobby", blurb: "Thursday trivia regular; brings the terrible convenience-store snacks." },

  // Maya — venue coworkers and her wide event-industry circle.
  { characterKey: "maya", name: "Greg", relation: "boss", category: "coworker", blurb: "Runs the venue Maya coordinates events for." },
  { characterKey: "maya", name: "Tasha", relation: "coworker and close friend", category: "coworker", blurb: "Co-coordinator; Maya's partner in crime for after-work stories." },
  { characterKey: "maya", name: "Becca", relation: "college friend", category: "friend", blurb: "Oldest friend; lives in Pittsburgh now, visits for weekends." },
  { characterKey: "maya", name: "Andre", relation: "DJ acquaintance", category: "acquaintance", blurb: "Works a lot of the venue's events; always knows what's happening." },

  // Claire — book club, school, family.
  { characterKey: "claire", name: "Priya", relation: "close friend", category: "friend", blurb: "Hosts the dinner parties; the user met Claire at one of them." },
  { characterKey: "claire", name: "Natalie", relation: "sister", category: "family", blurb: "Lives two hours away; visits with her kids a few times a year." },
  { characterKey: "claire", name: "Tom", relation: "ex-husband", category: "ex", blurb: "Divorced two years, amicable; occasional logistics contact." },
  { characterKey: "claire", name: "Mrs. Abernathy", relation: "school principal", category: "coworker", blurb: "Principal at the school where Claire runs the library." },
  { characterKey: "claire", name: "June", relation: "book club regular", category: "hobby", blurb: "Wednesday book club; brings wine and strong opinions." },

  // Jordan — climbing partners, engineering firm.
  { characterKey: "jordan", name: "Ruth", relation: "climbing partner", category: "hobby", blurb: "Tuesday/Thursday gym regular; one of the few people Jordan actually calls." },
  { characterKey: "jordan", name: "Kyle", relation: "climbing partner", category: "hobby", blurb: "Weekend climbing trips; drives, thankfully." },
  { characterKey: "jordan", name: "Patel", relation: "senior engineer", category: "coworker", blurb: "Reviews Jordan's drafting work; respects her precision." },
  { characterKey: "jordan", name: "Mom", relation: "mother", category: "family", blurb: "Calls Sundays; Jordan answers about half the time." },

  // Ben — wife, kids, Dave, fantasy league.
  { characterKey: "ben", name: "Sarah", relation: "wife", category: "family", blurb: "Married eight years; runs the household schedule Ben pretends to know." },
  { characterKey: "ben", name: "Dave", relation: "old friend", category: "friend", blurb: "Trivia regular; gave Ben the user's number. Claims the user owes him $20." },
  { characterKey: "ben", name: "Mikey", relation: "coworker", category: "coworker", blurb: "HVAC install partner; the other half of every job-site story." },
  { characterKey: "ben", name: "Commissioner Rick", relation: "fantasy league commissioner", category: "hobby", blurb: "Runs the fantasy football league with an iron fist." },
];

/** Canon links. Family/coworker/hobby links to each character's own NPCs,
 * plus the minimal playable-character awareness the canon already implies. */
export const CANON_LINKS: LinkSeed[] = [
  { characterKey: "sienna", otherType: "npc", otherKey: "Avery", level: "friend", opinion: "Enjoys exchanging creative ideas without competition.", reason: "Sienna's independent photography circle." },
  { characterKey: "sienna", otherType: "npc", otherKey: "Ellis", level: "familiar", opinion: "Respects a dependable colleague.", reason: "Sienna's own bartending workplace." },
  // Tess
  { characterKey: "tess", otherType: "npc", otherKey: "Denise", level: "family", opinion: "Loves her; dreads the setups.", reason: "Canon: her mother." },
  { characterKey: "tess", otherType: "npc", otherKey: "Mark", level: "family", opinion: "Easy to be around.", reason: "Canon: her father." },
  { characterKey: "tess", otherType: "npc", otherKey: "Evan", level: "family", opinion: "Annoying, would do anything for him.", reason: "Canon: her brother." },
  { characterKey: "tess", otherType: "npc", otherKey: "Ryan", level: "familiar", opinion: "No hard feelings, no interest either.", reason: "Canon: ex, minimal contact." },
  { characterKey: "tess", otherType: "npc", otherKey: "Dr. Halloran", level: "familiar", opinion: "Respects him; wishes he'd hire another tech.", reason: "Canon: her boss." },
  { characterKey: "tess", otherType: "npc", otherKey: "Sam", level: "friend", opinion: "Reliable, funny, underpaid.", reason: "Canon: coworker." },
  { characterKey: "tess", otherType: "npc", otherKey: "Marcus", level: "friend", opinion: "Trivia muscle, terrible snacks.", reason: "Canon: Thursday trivia team." },
  { characterKey: "tess", otherType: "npc", otherKey: "Lena", level: "close_friend", opinion: "Her favorite person most weeks.", reason: "Canon: Thursday trivia team." },
  { characterKey: "tess", otherType: "npc", otherKey: "Dev", level: "friend", opinion: "Chaos agent, good heart.", reason: "Canon: Thursday trivia team." },

  // Maya
  { characterKey: "maya", otherType: "npc", otherKey: "Greg", level: "familiar", opinion: "Fine as bosses go.", reason: "Canon: her boss." },
  { characterKey: "maya", otherType: "npc", otherKey: "Tasha", level: "close_friend", opinion: "Would take a bullet, would also roast her.", reason: "Canon: coworker and close friend." },
  { characterKey: "maya", otherType: "npc", otherKey: "Becca", level: "close_friend", opinion: "Misses her constantly.", reason: "Canon: college friend." },
  { characterKey: "maya", otherType: "npc", otherKey: "Andre", level: "acquaintance", opinion: "Useful to know.", reason: "Canon: venue DJ." },
  // Canon-adjacent: Maya "met the user through the trivia crowd" — she knows
  // OF Tess as a Thursday regular. Awareness only, not friendship.
  { characterKey: "maya", otherType: "character", otherKey: "tess", level: "knows_of", opinion: "The blonde with the dry humor on the Thursday team.", reason: "Same trivia venue on Thursdays; never on the same team." },

  // Claire
  { characterKey: "claire", otherType: "npc", otherKey: "Priya", level: "close_friend", opinion: "Her person.", reason: "Canon: hosts the dinners." },
  { characterKey: "claire", otherType: "npc", otherKey: "Natalie", level: "family", opinion: "Chaotic visits, worth it.", reason: "Canon: her sister." },
  { characterKey: "claire", otherType: "npc", otherKey: "Tom", level: "familiar", opinion: "A good man, better as a friend.", reason: "Canon: amicable ex." },
  { characterKey: "claire", otherType: "npc", otherKey: "Mrs. Abernathy", level: "familiar", opinion: "Respects her; wishes she'd fund the library.", reason: "Canon: principal." },
  { characterKey: "claire", otherType: "npc", otherKey: "June", level: "friend", opinion: "Wrong about every book, delightful anyway.", reason: "Canon: book club." },

  // Jordan
  { characterKey: "jordan", otherType: "npc", otherKey: "Ruth", level: "friend", opinion: "Doesn't talk too much. Ideal.", reason: "Canon: climbing partner." },
  { characterKey: "jordan", otherType: "npc", otherKey: "Kyle", level: "friend", opinion: "Competent belayer, decent silence.", reason: "Canon: climbing trips." },
  { characterKey: "jordan", otherType: "npc", otherKey: "Patel", level: "familiar", opinion: "Fair reviewer.", reason: "Canon: senior engineer." },
  { characterKey: "jordan", otherType: "npc", otherKey: "Mom", level: "family", opinion: "Loves her; calls are a lot.", reason: "Canon: her mother." },

  // Ben
  { characterKey: "ben", otherType: "npc", otherKey: "Sarah", level: "family", opinion: "The boss.", reason: "Canon: his wife." },
  { characterKey: "ben", otherType: "npc", otherKey: "Dave", level: "close_friend", opinion: "Owes him $20, allegedly.", reason: "Canon: old friend, trivia." },
  { characterKey: "ben", otherType: "npc", otherKey: "Mikey", level: "friend", opinion: "Good worker, terrible music.", reason: "Canon: install partner." },
  { characterKey: "ben", otherType: "npc", otherKey: "Commissioner Rick", level: "acquaintance", opinion: "Takes the league way too seriously.", reason: "Canon: fantasy league." },
  // Canon-adjacent: Ben's friend Dave is a trivia regular — Ben has heard OF
  // Tess's team through Dave. Awareness only.
  { characterKey: "ben", otherType: "character", otherKey: "tess", level: "knows_of", opinion: "Dave says her team takes trivia too seriously.", reason: "Dave plays at the same Thursday venue." },
];

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO-style week id in Eastern time, e.g. "2026-W43". Stable per week. */
export function weekId(now: Date): string {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const jan1 = new Date(local.getFullYear(), 0, 1);
  const week = Math.ceil((((local.getTime() - jan1.getTime()) / 86_400_000) + jan1.getDay() + 1) / 7);
  return `${local.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Recurring weekly events per character (their own lives, not a shared group)
// ---------------------------------------------------------------------------

export type RecurringEvent = {
  kind: string;
  title: string;
  weekday: number; // 0=Sun
  hour: number; // Eastern
  location: string;
  /** NPC names from the character's own circle who usually attend. */
  usual: string[];
  /** Other playable characters who could PLAUSIBLY be there, with the
   * per-week probability they happen to attend (sparse overlap, spec §2). */
  overlap: { characterKey: string; chance: number; why: string }[];
};

export const RECURRING_EVENTS: Record<string, RecurringEvent[]> = {
  sienna: [{ kind: "photography", title: "Photography walk with Avery", weekday: 1, hour: 13, location: "Juniper Commons", usual: ["Avery"], overlap: [] }],
  tess: [
    {
      kind: "trivia", title: "Thursday trivia", weekday: 4, hour: 19,
      location: "the usual bar's trivia night",
      usual: ["Marcus", "Lena", "Dev"],
      overlap: [
        // Maya's crowd sometimes does the same trivia night — same venue,
        // different table. Ben shows up only rarely, with Dave.
        { characterKey: "maya", chance: 0.22, why: "Maya's coworker crew occasionally does Thursday trivia at the same venue" },
        { characterKey: "ben", chance: 0.08, why: "Ben sometimes tags along with Dave's trivia night" },
      ],
    },
    {
      kind: "family_dinner", title: "Sunday dinner at her parents'", weekday: 0, hour: 17,
      location: "her parents' place",
      usual: ["Denise", "Mark", "Evan"],
      overlap: [],
    },
  ],
  maya: [
    {
      kind: "work_event", title: "weekend event at the venue", weekday: 6, hour: 18,
      location: "the venue",
      usual: ["Greg", "Tasha", "Andre"],
      overlap: [],
    },
    {
      kind: "trivia", title: "trivia with the work crew", weekday: 4, hour: 19,
      location: "the usual bar's trivia night",
      usual: ["Tasha"],
      overlap: [
        { characterKey: "tess", chance: 0.22, why: "Tess's team plays the same Thursday trivia" },
      ],
    },
  ],
  claire: [
    {
      kind: "book_club", title: "Wednesday book club", weekday: 3, hour: 19,
      location: "Priya's place",
      usual: ["Priya", "June"],
      overlap: [],
    },
    {
      kind: "family_visit", title: "Natalie visiting", weekday: 6, hour: 14,
      location: "Claire's place",
      usual: ["Natalie"],
      overlap: [],
    },
  ],
  jordan: [
    {
      kind: "climbing", title: "climbing gym session", weekday: 2, hour: 18,
      location: "the climbing gym",
      usual: ["Ruth"],
      overlap: [],
    },
    {
      kind: "climbing", title: "climbing gym session", weekday: 4, hour: 18,
      location: "the climbing gym",
      usual: ["Ruth", "Kyle"],
      overlap: [],
    },
  ],
  ben: [
    {
      kind: "football", title: "Sunday football at Ben's", weekday: 0, hour: 13,
      location: "Ben's living room",
      usual: ["Sarah", "Dave"],
      overlap: [],
    },
  ],
};

export type PlannedEvent = {
  id: string;
  characterKey: string;
  title: string;
  kind: string;
  location: string;
  occursAt: Date;
  facts: Record<string, string | number | boolean>;
  participants: { type: "character" | "npc"; key: string; met: string[]; perspective: string }[];
};

/** Objective event outcomes — one deterministic roll per event id, so the
 * same event always has the same facts no matter how often the tick runs. */
function eventFacts(kind: string, rng: () => number): Record<string, string | number | boolean> {
  switch (kind) {
    case "trivia": {
      const place = 1 + Math.floor(rng() * 6);
      const won = place === 1;
      return { placement: place, won, notable: won ? "won the night" : place <= 3 ? "finished on the podium" : "mid-pack finish" };
    }
    case "book_club":
      return { book: rng() < 0.5 ? "a literary novel" : "a thriller", debate: rng() < 0.5 };
    case "climbing":
      return { sent_project: rng() < 0.35, new_route: rng() < 0.5 };
    case "football":
      return { team_won: rng() < 0.5, grilling: rng() < 0.4 };
    case "family_dinner":
      return { setup_attempt: rng() < 0.3, wedding_talk: rng() < 0.6 };
    case "family_visit":
      return { kids_came: rng() < 0.7, good_visit: rng() < 0.8 };
    case "work_event":
      return { smooth: rng() < 0.6, drama: rng() < 0.25 };
    default:
      return {};
  }
}

function perspectiveFor(kind: string, facts: Record<string, string | number | boolean>, rng: () => number): string {
  if (kind === "trivia") {
    return facts["won"] ? "Still riding the win." : rng() < 0.5 ? "Blames the music round." : "Had fun anyway.";
  }
  if (kind === "climbing") return facts["sent_project"] ? "Finally sent the project." : "Hands are wrecked.";
  if (kind === "football") return facts["team_won"] ? "Good Sunday." : "The refs were a disgrace.";
  return rng() < 0.5 ? "A good time." : "A long day.";
}

/**
 * Plan one character's week. Deterministic per (character, week): same inputs
 * → same event ids, facts and participants, so ticks are idempotent.
 */
export function planWeekEvents(characterKey: string, week: string): PlannedEvent[] {
  const templates = RECURRING_EVENTS[characterKey] ?? [];
  const events: PlannedEvent[] = [];
  for (const t of templates) {
    const id = `${characterKey}-${t.kind}-d${t.weekday}-${week}`;
    const rng = mulberry32(hashSeed(id));
    const facts = eventFacts(t.kind, rng);

    // Occurs-at: Eastern wall-clock on that weekday/hour of the week.
    const occursAt = easternOccurrence(week, t.weekday, t.hour);

    const participants: PlannedEvent["participants"] = [];
    // The character themselves always attends their own recurring event.
    const npcsHere = t.usual.filter(() => rng() < 0.85); // people skip weeks
    const metCharacters: string[] = [];
    for (const o of t.overlap) {
      if (rng() < o.chance) {
        // They attend — but attending is not meeting (spec §3).
        const actuallyMet = rng() < 0.5;
        if (actuallyMet) metCharacters.push(o.characterKey);
        participants.push({
          type: "character",
          key: o.characterKey,
          met: actuallyMet ? [characterKey] : [],
          perspective: actuallyMet ? `Ran into ${characterKey} — ${o.why}.` : "Was there with their own group.",
        });
      }
    }
    participants.unshift({
      type: "character",
      key: characterKey,
      met: metCharacters,
      perspective: perspectiveFor(t.kind, facts, rng),
    });
    for (const n of npcsHere) {
      participants.push({ type: "npc", key: n, met: [characterKey, ...metCharacters], perspective: "" });
    }
    events.push({ id, characterKey, title: t.title, kind: t.kind, location: t.location, occursAt, facts, participants });
  }
  return events;
}

/** Resolve a weekday/hour within a week id to an actual Date (Eastern). */
function easternOccurrence(week: string, weekday: number, hour: number): Date {
  const [y = 2026, w = 1] = week.split("-W").map(Number);
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const weekStart = new Date(jan1.getTime() + (w - 1) * 7 * 86_400_000 - jan1.getUTCDay() * 86_400_000);
  const day = new Date(weekStart.getTime() + weekday * 86_400_000);
  // Approximate Eastern offset (EST -5 / EDT -4 by rough date); good enough for
  // fictional scheduling — the display layer formats in America/New_York.
  const month = day.getUTCMonth();
  const offset = month >= 2 && month <= 10 ? 4 : 5;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + offset, 0, 0));
}

// ---------------------------------------------------------------------------
// Knowledge propagation (spec §5)
// ---------------------------------------------------------------------------

export type KnowledgeEntry = {
  characterKey: string;
  subjectType: "event" | "person";
  subjectId: string;
  knowledgeType: KnowledgeType;
  summary: string;
  source: string;
  acquiredAt: Date;
};

export type LinkRow = {
  characterKey: string;
  otherType: "character" | "npc";
  otherKey: string;
  level: LinkLevel;
};

/**
 * Who learns what from an event. Participants witness it. People they are
 * close to (friend+) MAY hear about it secondhand. Nobody else learns
 * anything. Deterministic per (event, hearer) so re-runs don't duplicate.
 */
export function knowledgeFromEvent(event: PlannedEvent, links: LinkRow[]): KnowledgeEntry[] {
  const out: KnowledgeEntry[] = [];
  const factLine = Object.entries(event.facts)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");
  const base = `${event.title} at ${event.location}${factLine ? ` — ${factLine}` : ""}`;

  const attendees = new Set(event.participants.map((p) => `${p.type}:${p.key}`));
  for (const p of event.participants) {
    if (p.type !== "character") continue; // NPCs don't need stored knowledge
    out.push({
      characterKey: p.key,
      subjectType: "event",
      subjectId: event.id,
      knowledgeType: "witnessed",
      summary: `${base}. ${p.perspective}`.trim(),
      source: "witnessed",
      acquiredAt: event.occursAt,
    });
  }

  // Secondhand propagation: close links of character attendees may be told.
  for (const p of event.participants) {
    if (p.type !== "character") continue;
    const rng = mulberry32(hashSeed(`${event.id}:told:${p.key}`));
    for (const l of links) {
      if (l.characterKey !== p.key || l.otherType !== "character") continue;
      if (attendees.has(`character:${l.otherKey}`)) continue; // they witnessed it
      if (!atLeast(l.level, "friend")) continue; // acquaintances don't get stories
      if (rng() < 0.35) {
        out.push({
          characterKey: l.otherKey,
          subjectType: "event",
          subjectId: event.id,
          knowledgeType: "told",
          summary: `${p.key} mentioned: ${base}`,
          source: `told by ${p.key}`,
          acquiredAt: new Date(event.occursAt.getTime() + 6 * 3_600_000),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Relationship evolution (spec §6) — rare, reasoned, never automatic
// ---------------------------------------------------------------------------

export type LinkChange = {
  characterKey: string;
  otherType: "character" | "npc";
  otherKey: string;
  from: LinkLevel;
  to: LinkLevel;
  reason: string;
};

/**
 * Meeting at an event can create an acquaintance link (never more). Existing
 * links can deepen only after repeated shared experiences, and only one step
 * at a time. Deterministic per (event, pair).
 */
export function linkChangesFromEvent(event: PlannedEvent, links: LinkRow[]): LinkChange[] {
  const changes: LinkChange[] = [];
  const characters = event.participants.filter((p) => p.type === "character");
  for (const a of characters) {
    for (const otherKey of a.met) {
      const rng = mulberry32(hashSeed(`${event.id}:link:${a.key}:${otherKey}`));
      const existing = links.find(
        (l) => l.characterKey === a.key && l.otherType === "character" && l.otherKey === otherKey,
      );
      const current = existing?.level ?? "stranger";
      if (current === "stranger" || current === "knows_of") {
        changes.push({
          characterKey: a.key,
          otherType: "character",
          otherKey,
          from: current,
          to: "acquaintance",
          reason: `Met properly at ${event.title} (${event.id}).`,
        });
      } else if (current === "acquaintance" && rng() < 0.25) {
        changes.push({
          characterKey: a.key,
          otherType: "character",
          otherKey,
          from: current,
          to: "familiar",
          reason: `Kept running into each other; ${event.title} went well.`,
        });
      }
      // friend+ deepening is deliberately NOT event-automatic.
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

export type KnowledgeRow = {
  subject_type: string;
  subject_id: string;
  knowledge_type: string;
  summary: string;
  source: string;
  acquired_at: string;
};

/**
 * Format a character's own knowledge for prompt injection. The caller must
 * query ONLY this character's rows — knowledge isolation is enforced by the
 * query, and this function never invents knowledge.
 */
export function knowledgePromptLines(rows: KnowledgeRow[], characterName: string): string[] {
  return rows.map((r) => {
    const how =
      r.knowledge_type === "witnessed"
        ? "she was there"
        : r.knowledge_type === "told"
          ? `heard secondhand (${r.source})`
          : r.knowledge_type === "rumor"
            ? "only a rumor, possibly wrong"
            : "her own interpretation";
    return `${r.summary} [${how}]`;
  });
}

export const KNOWLEDGE_RULES = `WORLD KNOWLEDGE RULES: The "WHAT SHE KNOWS LATELY" list is everything this character currently knows about recent events in her own life and social circle. She may reference or bring up these items naturally. She knows NOTHING else about the world: never reference events, people or conversations that are not in her memories or this list. She has no idea what the user discusses with anyone else — never hint at other people's private conversations. Secondhand items are incomplete; she only knows what she was told.`;
