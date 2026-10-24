import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { knowledgeFromEvent, type LinkRow } from "./social-logic";
import { storyMayAdvance, advanceStory, beginStories, readStory, storyActive, storyEvent, storyLifeEvent, storyMemoryId, storyPrompt, STORY_STEPS_PER_TICK, type StoryState } from "./storyline-logic";

type Client = SupabaseClient<Database>;
type Root = { id: string; state: StoryState };
async function loadStories(db: Client, userId: string): Promise<Root[]> {
  const { data, error } = await db.from("shared_events").select("id, facts").eq("user_id", userId).eq("kind", "life_storyline").limit(1000);
  if (error) throw error;
  return (data ?? []).flatMap(r => { const state = readStory(r.facts); return state ? [{ id: r.id, state }] : []; });
}
function checked(result: { error: { message: string } | null }) { if (result.error) throw new Error(result.error.message); }

/** Write milestone projections before the root checkpoint. Retrying repairs any partial writes. */
async function persistMilestone(db: Client, userId: string, root: Root, links: LinkRow[], now: Date) {
  const { id, state } = root;
  const event = storyEvent(id, state);
  checked(await db.from("shared_events").upsert({ id: event.id, user_id: userId, title: event.title, kind: event.kind, location: event.location, occurs_at: state.updatedAt, facts: event.facts, source: "simulated" }, { onConflict: "user_id,id", ignoreDuplicates: true }));
  checked(await db.from("event_participants").upsert(event.participants.map(p => ({ user_id: userId, event_id: event.id, participant_type: p.type, participant_key: p.key, met: p.met, perspective: p.perspective })), { onConflict: "user_id,event_id,participant_type,participant_key", ignoreDuplicates: true }));
  const knowledge = knowledgeFromEvent(event, links);
  if (knowledge.length) checked(await db.from("character_knowledge").upsert(knowledge.map(k => ({ user_id: userId, character_key: k.characterKey, subject_type: k.subjectType, subject_id: k.subjectId, knowledge_type: k.knowledgeType, summary: k.summary, source: k.source, acquired_at: k.acquiredAt.toISOString() })), { onConflict: "user_id,character_key,subject_type,subject_id,knowledge_type", ignoreDuplicates: true }));
  // Only direct participants receive current situation context; outsiders keep just what they were told.
  checked(await db.from("character_knowledge").upsert(state.characters.map(key => ({ user_id: userId, character_key: key, subject_type: "storyline", subject_id: id, knowledge_type: "witnessed", summary: storyPrompt(state), source: "direct involvement", acquired_at: state.updatedAt })), { onConflict: "user_id,character_key,subject_type,subject_id,knowledge_type" }));
  if (!storyActive(state)) {
    const { data: convs, error } = await db.from("conversations").select("id, character:characters(key)").eq("user_id", userId);
    if (error) throw error;
    const memories = (convs ?? []).flatMap(c => {
      const key = c.character?.key;
      return key && state.characters.includes(key) ? [{ id: storyMemoryId(userId, key, id), user_id: userId, conversation_id: c.id, memory_type: "personal", summary: storyPrompt(state), importance: 4, created_at: state.updatedAt }] : [];
    });
    if (memories.length) checked(await db.from("memories").upsert(memories, { onConflict: "id", ignoreDuplicates: true }));
  }
}

export async function runStorylineTick(db: Client, userId: string, now: Date, links: LinkRow[], committed?: ReadonlySet<string>) {
  let roots = await loadStories(db, userId);
  const busy = committed ?? (await (await import("./calendar-commitment.server")).committedCharacters(db, userId, now));
  const started = beginStories(userId, now, roots.map(r => r.state), links, busy);
  for (const r of started) {
    const event = storyEvent(r.id, r.state);
    checked(await db.from("shared_events").upsert({ id: r.id, user_id: userId, title: event.title, kind: "life_storyline", location: event.location, occurs_at: r.state.startedAt, facts: r.state, source: "simulated" }, { onConflict: "user_id,id", ignoreDuplicates: true }));
  }
  if (started.length) roots = await loadStories(db, userId);
  // Only an initial root can be unprojected: subsequent checkpoints are written last.
  for (const root of roots.filter(r => !r.state.materialized)) {
    await persistMilestone(db, userId, root, links, now);
    root.state = { ...root.state, materialized: true };
    checked(await db.from("shared_events").update({ facts: root.state }).eq("user_id", userId).eq("id", root.id));
  }
  let advanced = 0;
  while (advanced < STORY_STEPS_PER_TICK) {
    const due = roots.filter(r => r.state.nextAt && Date.parse(r.state.nextAt) <= now.getTime() && storyMayAdvance(r.state, now, busy)).sort((a,b) => (a.state.nextAt ?? "").localeCompare(b.state.nextAt ?? ""))[0];
    if (!due) break;
    const next = advanceStory(due.id, due.state);
    await persistMilestone(db, userId, { id: due.id, state: next }, links, now);
    // Existing world-tick lease owns progression; conditional checkpoint protects stale retries too.
    const { data, error } = await db.from("shared_events").update({ facts: next }).eq("user_id", userId).eq("id", due.id).eq("facts->>step", String(due.state.step)).select("id");
    if (error) throw error;
    if (!data?.length) break;
    due.state = next;
    advanced++;
  }
  return { started: started.length, advanced };
}

/** Read-only, owner-scoped context: never advances the world during a reply. */
export async function storylineContext(db: Client, userId: string, characterKey: string, now: Date) {
  const roots = (await loadStories(db, userId)).filter(r => r.state.characters.includes(characterKey));
  const current = roots.filter(r => storyActive(r.state)).sort((a,b) => b.state.updatedAt.localeCompare(a.state.updatedAt))[0];
  return { event: current ? storyLifeEvent(current.state, now) : null, lines: roots.sort((a,b) => b.state.updatedAt.localeCompare(a.state.updatedAt)).slice(0, 8).map(r => storyPrompt(r.state)) };
}