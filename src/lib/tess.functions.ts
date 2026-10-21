import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DIFFICULTIES,
  SEED_STATE,
  STATE_KEYS,
  applyDelta,
  clampDelaySeconds,
  deriveStage,
  sanitizeDelta,
  type Difficulty,
  type TessState,
} from "./tess-logic";

const FIRST_MESSAGE =
  "Okay, important question. Did your team actually know any of those answers Friday or were you all confidently guessing?";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Sb = SupabaseClient<Database>;

function pickState(row: Record<string, unknown>): TessState {
  const s = {} as TessState;
  for (const k of STATE_KEYS) s[k] = Number(row[k] ?? SEED_STATE[k]);
  return s;
}

async function loadConversation(supabase: Sb, userId: string) {
  const { data: conv } = await supabase.from("conversations").select("*").eq("user_id", userId).maybeSingle();
  return conv;
}

async function seedConversation(supabase: Sb, userId: string) {
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("tess_state").insert({ conversation_id: conv.id, user_id: userId });
  await supabase.from("messages").insert({ conversation_id: conv.id, user_id: userId, sender: "tess", body: FIRST_MESSAGE });
  return conv;
}

export const ensureConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const conv = (await loadConversation(supabase, userId)) ?? (await seedConversation(supabase, userId));
    return { id: conv.id as string };
  });

async function runTurn(
  supabase: Sb,
  userId: string,
  tz: string,
  initiation?: { gapHours: number },
) {
  const { generateTessReply } = await import("./tess.server");
  const conv = await loadConversation(supabase, userId);
  if (!conv) throw new Error("No conversation");
  const nowIso = new Date().toISOString();

  // Tess hadn't actually "sent" pending replies yet — let her reconsider with the new context.
  if (!initiation) {
    await supabase.from("messages").delete().eq("conversation_id", conv.id).eq("sender", "tess").gt("visible_at", nowIso);
  }

  const [{ data: stateRow }, { data: msgs }, { data: mems }] = await Promise.all([
    supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
    supabase
      .from("messages")
      .select("sender, body, created_at")
      .eq("conversation_id", conv.id)
      .lte("visible_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("memories")
      .select("summary, memory_type")
      .eq("conversation_id", conv.id)
      .order("importance", { ascending: false })
      .limit(15),
  ]);

  const state = pickState(stateRow ?? {});
  const difficulty = (conv.difficulty as Difficulty) ?? "realistic";
  const reply = await generateTessReply({
    state,
    stage: deriveStage(state),
    difficulty,
    messages: (msgs ?? []).reverse(),
    memories: (mems ?? []).map((m: { memory_type: string; summary: string }) => `${m.memory_type}: ${m.summary}`),
    tz,
    initiation,
  });

  const delta = sanitizeDelta(reply.state_delta, difficulty);
  const next = applyDelta(state, delta);
  const stage = deriveStage(next);

  await supabase
    .from("tess_state")
    .update({ ...next, last_delta: { ...delta, tags: reply.event_tags }, last_tone: reply.tone, updated_at: nowIso })
    .eq("conversation_id", conv.id);
  await supabase.from("conversations").update({ relationship_stage: stage, updated_at: nowIso }).eq("id", conv.id);

  const bubbles = reply.messages.map((b) => b.trim()).filter(Boolean).slice(0, 3);
  let at = Date.now() + clampDelaySeconds(initiation ? 3 : reply.send_delay_seconds) * 1000;
  const rows = bubbles.map((body, i) => {
    if (i > 0) at += 1500 + Math.min(body.length * 60, 6000);
    return {
      conversation_id: conv.id,
      user_id: userId,
      sender: "tess",
      body,
      visible_at: new Date(at).toISOString(),
      created_at: new Date(at).toISOString(),
      metadata: { tone: reply.tone, tags: reply.event_tags, initiated: !!initiation },
    };
  });
  if (rows.length) await supabase.from("messages").insert(rows);

  const memRows = reply.memory_candidates
    .filter((m) => m.summary?.trim())
    .slice(0, 3)
    .map((m) => ({
      conversation_id: conv.id,
      user_id: userId,
      memory_type: m.memory_type || "fact",
      summary: m.summary.slice(0, 300),
      importance: Math.min(5, Math.max(1, Math.round(m.importance || 3))),
    }));
  if (memRows.length) await supabase.from("memories").insert(memRows);

  return { count: rows.length, lastVisibleAt: rows.length ? rows[rows.length - 1]!.visible_at : null };
}

export const tessRespond = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => runTurn(context.supabase, context.userId, data.tz));

export const tessMaybeInitiate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conv = await loadConversation(supabase, userId);
    if (!conv) return { count: 0 };
    const { data: last } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return { count: 0 };
    const gapHours = (Date.now() - new Date(last.created_at).getTime()) / 3_600_000;
    if (gapHours < 5) return { count: 0 };
    const chance = conv.difficulty === "chaos" ? 0.5 : 0.35;
    if (Math.random() > chance) return { count: 0 };
    return runTurn(supabase, userId, data.tz, { gapHours });
  });

export const runDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateDebrief } = await import("./tess.server");
    const conv = await loadConversation(supabase, userId);
    if (!conv) throw new Error("No conversation");
    const [{ data: msgs }, { data: stateRow }] = await Promise.all([
      supabase
        .from("messages")
        .select("sender, body, created_at")
        .eq("conversation_id", conv.id)
        .lte("visible_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
    ]);
    const list = (msgs ?? []).reverse();
    if (list.filter((m: { sender: string }) => m.sender === "user").length < 2) {
      throw new Error("Send a few more messages before asking for a debrief.");
    }
    const state = pickState(stateRow ?? {});
    const analysis = await generateDebrief({ messages: list, tz: data.tz, stage: deriveStage(state), state });
    const { data: row, error } = await supabase
      .from("debriefs")
      .insert({ conversation_id: conv.id, user_id: userId, analysis: { ...analysis, stage: deriveStage(state), state } })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const resetRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("conversations").delete().eq("user_id", userId);
    await seedConversation(supabase, userId);
    return { ok: true };
  });

export const deleteAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("conversations").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        difficulty: z.enum(DIFFICULTIES).optional(),
        typing_indicator: z.boolean().optional(),
        read_receipts: z.boolean().optional(),
        show_sim_data: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await context.supabase.from("conversations").update(patch).eq("user_id", context.userId);
    return { ok: true };
  });
