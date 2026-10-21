/**
 * Social-world persistence: seeds each user's canon social networks and runs
 * a bounded, idempotent social tick inside the world tick. No AI calls — the
 * simulation is structured (social-logic.ts plans; this file persists).
 *
 * Isolation: every row is scoped by user_id, so separate users get fully
 * separate fictional worlds from the same character templates. User
 * conversations are never read here and never leak into another character's
 * knowledge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runStorylineTick } from "./storyline.server";
import {
  CANON_LINKS,
  CANON_NPCS,
  knowledgeFromEvent,
  linkChangesFromEvent,
  planWeekEvents,
  weekId,
  type LinkRow,
  type LinkLevel,
} from "./social-logic";

type Admin = SupabaseClient<Database>;

export const SOCIAL_MAX_EVENTS_PER_USER = 12;

/** Insert canon NPCs and links once per user (on conflict = already seeded). */
export async function ensureSocialSeed(admin: Admin, userId: string): Promise<{ npcs: number; links: number }> {
  const { count } = await admin
    .from("npcs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return { npcs: 0, links: 0 };

  const npcRows = CANON_NPCS.map((n) => ({
    user_id: userId,
    character_key: n.characterKey,
    name: n.name,
    relation: n.relation,
    category: n.category,
    blurb: n.blurb,
    canon: true,
  }));
  const linkRows = CANON_LINKS.map((l) => ({
    user_id: userId,
    character_key: l.characterKey,
    other_type: l.otherType,
    other_key: l.otherKey,
    level: l.level,
    opinion: l.opinion,
    reason: l.reason,
    canon: true,
  }));
  const { error: e1 } = await admin.from("npcs").upsert(npcRows, { onConflict: "user_id,character_key,name", ignoreDuplicates: true });
  const { error: e2 } = await admin
    .from("social_links")
    .upsert(linkRows, { onConflict: "user_id,character_key,other_type,other_key", ignoreDuplicates: true });
  if (e1 || e2) throw new Error(`social seed failed: ${e1?.message ?? ""} ${e2?.message ?? ""}`.trim());
  return { npcs: npcRows.length, links: linkRows.length };
}

export type SocialTickReport = {
  seeded: boolean;
  eventsPlanned: number;
  eventsNew: number;
  knowledgeAdded: number;
  linkChanges: number;
  storylinesStarted: number;
  storylinesAdvanced: number;
};

/**
 * Advance the social world for one user. Idempotent: event ids are
 * deterministic per (character, kind, weekday, week), knowledge and
 * participant rows upsert on their natural keys, and link changes only apply
 * when the stored level still matches the expected "from" level.
 */
export async function runSocialTick(admin: Admin, userId: string, now: Date): Promise<SocialTickReport> {
  const report: SocialTickReport = { seeded: false, eventsPlanned: 0, eventsNew: 0, knowledgeAdded: 0, linkChanges: 0, storylinesStarted: 0, storylinesAdvanced: 0 };

  const seed = await ensureSocialSeed(admin, userId);
  report.seeded = seed.npcs > 0;

  const { data: linkRows } = await admin
    .from("social_links")
    .select("character_key, other_type, other_key, level")
    .eq("user_id", userId);
  const links: LinkRow[] = (linkRows ?? []).map((l) => ({
    characterKey: l.character_key,
    otherType: l.other_type as "character" | "npc",
    otherKey: l.other_key,
    level: l.level as LinkLevel,
  }));

  const week = weekId(now);
  const characterKeys = ["tess", "maya", "claire", "jordan", "ben"];
  const planned = characterKeys.flatMap((k) => planWeekEvents(k, week)).slice(0, SOCIAL_MAX_EVENTS_PER_USER);
  report.eventsPlanned = planned.length;

  for (const ev of planned) {
    // Upsert by deterministic id: a re-run updates nothing meaningful and
    // never duplicates or rewrites facts.
    const { data: existing } = await admin
      .from("shared_events")
      .select("id")
      .eq("user_id", userId)
      .eq("id", ev.id)
      .maybeSingle();
    if (!existing) {
      const { error } = await admin.from("shared_events").insert({
        id: ev.id,
        user_id: userId,
        title: ev.title,
        kind: ev.kind,
        location: ev.location,
        occurs_at: ev.occursAt.toISOString(),
        facts: ev.facts,
        source: "simulated",
      });
      if (error) continue; // unique race with another tick — treat as existing
      report.eventsNew++;
    }

    await admin.from("event_participants").upsert(
      ev.participants.map((p) => ({
        event_id: ev.id,
        user_id: userId,
        participant_type: p.type,
        participant_key: p.key,
        met: p.met,
        perspective: p.perspective,
      })),
      { onConflict: "user_id,event_id,participant_type,participant_key", ignoreDuplicates: true },
    );

    // Knowledge: only write rows that don't exist yet (unique key ignores
    // duplicates), so told/witnessed facts never multiply.
    const knowledge = knowledgeFromEvent(ev, links).filter(k => k.acquiredAt <= now);
    if (knowledge.length) {
      const { data: inserted } = await admin
        .from("character_knowledge")
        .upsert(
          knowledge.map((k) => ({
            user_id: userId,
            character_key: k.characterKey,
            subject_type: k.subjectType,
            subject_id: k.subjectId,
            knowledge_type: k.knowledgeType,
            summary: k.summary,
            source: k.source,
            acquired_at: k.acquiredAt.toISOString(),
          })),
          { onConflict: "user_id,character_key,subject_type,subject_id,knowledge_type", ignoreDuplicates: true },
        )
        .select("id");
      report.knowledgeAdded += inserted?.length ?? 0;
    }

    // Relationship evolution: apply only when the stored level still matches
    // the expected starting level (guards against double-application).
    for (const change of ev.occursAt <= now ? linkChangesFromEvent(ev, links) : []) {
      const { data: updated } = await admin
        .from("social_links")
        .update({ level: change.to, reason: change.reason, canon: false, updated_at: now.toISOString() })
        .eq("user_id", userId)
        .eq("character_key", change.characterKey)
        .eq("other_type", change.otherType)
        .eq("other_key", change.otherKey)
        .eq("level", change.from)
        .select("id");
      if (updated?.length) report.linkChanges++;
    }
  }

  const stories = await runStorylineTick(admin, userId, now, links);
  report.storylinesStarted = stories.started;
  report.storylinesAdvanced = stories.advanced;
  return report;
}

/** Recent knowledge one character holds — for prompt injection. Caller must
 * pass the character key; rows for other characters are never selected. */
export async function knowledgeForCharacter(
  admin: Admin,
  userId: string,
  characterKey: string,
  limit = 8,
): Promise<{ subject_type: string; subject_id: string; knowledge_type: string; summary: string; source: string; acquired_at: string }[]> {
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const { data } = await admin
    .from("character_knowledge")
    .select("subject_type, subject_id, knowledge_type, summary, source, acquired_at")
    .eq("user_id", userId)
    .eq("character_key", characterKey)
    .gte("acquired_at", since)
    .lte("acquired_at", new Date().toISOString())
    .order("acquired_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
