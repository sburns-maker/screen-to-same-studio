import { describe, expect, it } from "vitest";
import { advanceStory, beginStories, storyActive, storyEvent, storyLifeEvent, storyMemoryId, storySchedule, STORY_STEPS_PER_TICK, type StoryState } from "@/lib/storyline-logic";
import { CANON_LINKS, knowledgeFromEvent } from "@/lib/social-logic";
import { decideLatency } from "@/lib/tess-life";
import { SEED_STATE } from "@/lib/tess-logic";
import { runStorylineTick, storylineContext } from "@/lib/storyline.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const START = new Date("2026-10-21T16:00:00Z");
const DAY = 86_400_000;
const links = CANON_LINKS.map(l => ({ ...l }));

/** Real persistence module, in-memory Data API transport with unique keys and failure injection. */
function database() {
  const tables: Record<string, Record<string, unknown>[]> = { conversations: ["tess","maya","claire","jordan","ben"].map(key => ({ id: `conv-${key}`, user_id: "alice", character: { key } })) };
  let failTable: string | null = null;
  const client = { from(table: string) {
    let action = "select"; let rows: Record<string, unknown>[] = []; let opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}; const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    const q = {
      select(_fields?: string) { return q; }, limit(_n: number) { return q; },
      eq(key: string, value: unknown) { filters.push(r => key === "facts->>step" ? String((r['facts'] as StoryState)['step']) === value : r[key] === value); return q; },
      upsert(input: Record<string, unknown> | Record<string, unknown>[], options: typeof opts) { action = "upsert"; rows = Array.isArray(input) ? input : [input]; opts = options; return q; },
      update(input: Record<string, unknown>) { action = "update"; rows = [input]; return q; },
      then(resolve: (result: unknown) => unknown) {
        if (table === failTable) { failTable = null; return Promise.resolve({ data: null, error: { message: "interrupted write" } }).then(resolve); }
        const stored = tables[table] ?? (tables[table] = []);
        let result = stored.filter(r => filters.every(f => f(r)));
        if (action === "upsert") {
          result = [];
          for (const input of rows) {
            const keys = (opts.onConflict ?? "id").split(",");
            const found = stored.find(r => keys.every(k => r[k] === input[k]));
            if (found) { if (!opts.ignoreDuplicates) Object.assign(found, structuredClone(input)); }
            else { const row = { id: `row-${stored.length}`, ...structuredClone(input) }; stored.push(row); result.push(row); }
          }
        } else if (action === "update") for (const row of result) Object.assign(row, structuredClone(rows[0]));
        return Promise.resolve({ data: structuredClone(result), error: null }).then(resolve);
      },
    };
    return q;
  } } as unknown as SupabaseClient<Database>;
  return { client, tables, fail(table: string) { failTable = table; } };
}

describe("multi-week life developments", () => {
  it("supports existing characters and Sienna without joining their circles", () => {
    const roots = beginStories("alice", START, [], links);
    // Kendra is Ben's established friend, so she may join his practical project.
    expect(roots.map(r => r.state.owner)).toEqual(["tess","maya","claire","jordan","ben","sienna"]);
    expect(roots.find(r => r.state.owner === "ben")?.state.characters).toEqual(["ben","kendra"]);
    expect(roots.filter(r => r.state.owner !== "ben").every(r => r.state.characters.length === 1)).toBe(true);
    for (const r of roots) expect(CANON_LINKS.some(l => l.characterKey === r.state.owner && l.otherKey === r.state.npc)).toBe(true);
  });
  it("limits each character to one active situation", () => {
    const roots = beginStories("alice", START, [], links);
    expect(beginStories("alice", new Date(START.getTime()+DAY), roots.map(r=>r.state), links)).toEqual([]);
  });
  it("branches reproducibly and includes postponement, fading and unresolved continuation", () => {
    const stages = new Set<string>();
    for (let n=0;n<50;n++) for (const root of beginStories(`seed-${n}`, START, [], links)) {
      let state = root.state;
      while (storyActive(state)) {
        const next = advanceStory(root['id'], state);
        expect(next).toEqual(advanceStory(root['id'], state));
        expect(Date.parse(next.updatedAt)).toBeGreaterThan(Date.parse(state.updatedAt));
        stages.add(next.stage); state = next;
      }
      expect(advanceStory(root['id'],state)).toEqual(state);
    }
    for (const stage of ["postponed","resolved","faded","continuing"]) expect(stages.has(stage)).toBe(true);
  });
  it("shared participants receive the same facts, not other characters' private knowledge", () => {
    const root = beginStories("alice", START, [], links)[0];
    if (!root) throw new Error("missing Tess situation");
    const ev = storyEvent(root['id'], { ...root.state, characters: ["tess","maya"] });
    const knowledge = knowledgeFromEvent(ev, []);
    expect(knowledge.map(k=>k.characterKey)).toEqual(["tess","maya"]);
    for (const k of knowledge) expect(k.summary).toContain(root.state.summary);
    expect(knowledge.some(k=>["claire","jordan","ben"].includes(k.characterKey))).toBe(false);
    expect(ev.participants.every(p=>p.met.length===0)).toBe(true);
  });
  it("busy developments affect real-time latency but never wake a sleeping contact", () => {
    const root = beginStories("alice", START, [], links)[0];
    if (!root) throw new Error("missing situation");
    const state = { ...root.state, availability: "busy" as const };
    const event = storyLifeEvent(state, START);
    const base = { activity: "home", detail: "at home", availability: "free" as const };
    const schedule = storySchedule(base,event);
    expect(schedule.availability).toBe("limited");
    expect(decideLatency({ realTimeMode:true, schedule, lifeEvent:event, state:SEED_STATE, activelyChatting:true, baseSeconds:3 }, ()=>0).seconds).toBe(180);
    expect(storySchedule({ ...base, availability:"asleep" },event).availability).toBe("asleep");
    expect(decideLatency({ realTimeMode:false, schedule, lifeEvent:event, state:SEED_STATE, activelyChatting:true, baseSeconds:3 }, ()=>0).seconds).toBe(3);
  });
  it("a 30-day closed-app simulation is bounded, consistent and duplicate-free", async () => {
    const db = database();
    let transitions = 0;
    for (let day=0;day<30;day++) {
      const now = new Date(START.getTime()+day*DAY);
      const report = await runStorylineTick(db.client,"alice",now,links,new Set());
      expect(report.advanced).toBeLessThanOrEqual(STORY_STEPS_PER_TICK);
      transitions += report.advanced;
      const before = JSON.stringify(db.tables);
      expect(await runStorylineTick(db.client,"alice",now,links,new Set())).toEqual({ started:0, advanced:0 });
      expect(JSON.stringify(db.tables)).toBe(before);
    }
    expect(transitions).toBeGreaterThanOrEqual(15);
    const events = db.tables['shared_events'] ?? [];
    const milestones = events.filter(r=>r['kind']==="life_development");
    expect(milestones.length).toBeLessThanOrEqual(45);
    expect(new Set(events.map(r=>r['id'])).size).toBe(events.length);
    for (const root of events.filter(r=>r['kind']==="life_storyline")) {
      const state = root['facts'] as StoryState;
      const beats = milestones.filter(r=>(r['facts'] as Record<string,unknown>)['story_id']===root['id']).sort((a,b)=>Number((a['facts'] as Record<string,unknown>)['step'])-Number((b['facts'] as Record<string,unknown>)['step']));
      expect(beats.map(b=>(b['facts'] as Record<string,unknown>)['step'])).toEqual(Array.from({length:state['step']+1},(_,i)=>i));
      expect((beats.at(-1)?.['facts'] as Record<string,unknown>)['development']).toBe(state.summary);
    }
    console.info("30-day simulation", { roots:events.length-milestones.length, milestones:milestones.length, transitions, outcomes:(db.tables['memories']??[]).length });
  });
  it("recovers interrupted milestone writes without duplicating facts or outcomes", async () => {
    const db = database();
    await runStorylineTick(db.client,"alice",START,links,new Set());
    db.fail("character_knowledge");
    const later = new Date(START.getTime()+40*DAY);
    await expect(runStorylineTick(db.client,"alice",later,links,new Set())).rejects.toThrow("interrupted write");
    for(let i=0;i<4;i++) await runStorylineTick(db.client,"alice",later,links,new Set());
    const before = JSON.stringify(db.tables);
    await runStorylineTick(db.client,"alice",later,links,new Set());
    expect(JSON.stringify(db.tables)).toBe(before);
    const memories = db.tables['memories'] ?? [];
    expect(memories.length).toBe(5);
    expect(new Set(memories.map(r=>r['id'])).size).toBe(5);
  });
  it("preserves outcome context weeks later and isolates application users", async () => {
    const db = database();
    await runStorylineTick(db.client,"alice",START,links,new Set());
    const later = new Date(START.getTime()+80*DAY);
    for(let i=0;i<4;i++) await runStorylineTick(db.client,"alice",later,links,new Set());
    await runStorylineTick(db.client,"bob",later,links,new Set());
    const context = await storylineContext(db.client,"alice","tess",later);
    expect(context.lines.some(l=>l.includes("remembered history"))).toBe(true);
    const alice = (db.tables['shared_events']??[]).filter(r=>r['user_id']==="alice").map(r=>r['id']);
    const bob = (db.tables['shared_events']??[]).filter(r=>r['user_id']==="bob").map(r=>r['id']);
    expect(bob.some(id=>alice.includes(id))).toBe(false);
    expect((db.tables['memories']??[]).every(r=>r['user_id']==="alice")).toBe(true);
    expect(storyMemoryId("alice","tess","story")).not.toBe(storyMemoryId("bob","tess","story"));
  });
  it("does not repeat a finished topic, respects cooldown and permits quiet periods", () => {
    const roots = beginStories("alice",START,[],links);
    const closed = roots.map(r=>{ let s=r.state; while(storyActive(s)) s=advanceStory(r['id'],s); return s; });
    const latest = Math.max(...closed.map(s=>Date.parse(s.updatedAt)));
    for (const state of closed) expect(beginStories("alice",new Date(Date.parse(state.updatedAt)+DAY),[state],links).some(r=>r.state.owner===state.owner)).toBe(false);
    const next = beginStories("alice",new Date(latest+20*DAY),closed,links);
    expect(next).toHaveLength(7);
    expect(next.some(r=>closed.some(s=>s.template===r.state.template))).toBe(false);
  });
});
import { STORY_TEMPLATES as ALL_TEMPLATES } from "@/lib/storyline-logic";
describe("procedural storyline variety", () => {
  it("gives every character well over 50 distinct storylines", () => {
    for (const c of ["tess", "maya", "claire", "jordan", "ben"]) {
      expect(ALL_TEMPLATES.filter(t => t.owner === c).length).toBeGreaterThan(50);
    }
    expect(new Set(ALL_TEMPLATES.map(t => t.key)).size).toBe(ALL_TEMPLATES.length);
  });
});

it("exposes topic milestones only to the owning user's involved character without advancing stories", async () => {
  const db = database();
  const base = beginStories("alice", START, [], links).find(r => r.state.owner === "maya")!;
  const state = { ...base.state, template: "maya_visit", npc: "Becca", characters: ["maya"], summary: "Maya and Becca are looking for a free weekend" };
  db.tables["shared_events"] = [
    { id: "alice-maya-visit", user_id: "alice", kind: "life_storyline", facts: state },
    { id: "bob-maya-visit", user_id: "bob", kind: "life_storyline", facts: { ...state, summary: "Bob's private story" } },
    { id: "alice-claire-visit", user_id: "alice", kind: "life_storyline", facts: { ...state, owner: "claire", characters: ["claire"], npc: "Natalie" } },
  ];
  const before = structuredClone(db.tables);
  const context = await storylineContext(db.client, "alice", "maya", START);
  expect(context.topics).toEqual([{ id: "alice-maya-visit", title: "Making time for Becca", summary: state.summary, person: "Becca", changedAt: state.updatedAt, active: true }]);
  expect(JSON.stringify(context)).not.toContain("Bob's private");
  expect(JSON.stringify(context)).not.toContain("Natalie");
  expect(db.tables).toEqual(before);
});
