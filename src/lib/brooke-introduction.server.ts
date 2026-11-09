import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  BROOKE_OFFER_TEXT,
  OFFER_METADATA_KEY,
  shouldOffer,
  transition,
  type IntroductionStatus,
} from "./brooke-introduction";

type Client = SupabaseClient<Database>;
// The table is newer than the generated types; keep queries narrowly typed here.
const t = (db: Client) => (db as unknown as SupabaseClient).from("after_dark_introductions");

export type IntroductionRow = {
  user_id: string;
  status: IntroductionStatus;
  brooke_consented: boolean;
  offer_message_id: string | null;
  offered_at: string | null;
  responded_at: string | null;
  met_at: string | null;
};

export async function introductionRow(db: Client, user: string): Promise<IntroductionRow | null> {
  const r = await t(db).select("*").eq("user_id", user).maybeSingle();
  if (r.error) throw new Error("Introduction state unavailable");
  return (r.data as IntroductionRow | null) ?? null;
}

/** Conditional, idempotent state change; returns the new row only when this call made the transition. */
async function advance(
  admin: Client,
  user: string,
  from: IntroductionStatus,
  to: IntroductionStatus,
  patch: Record<string, unknown>,
): Promise<IntroductionRow | null> {
  const r = await t(admin)
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("user_id", user)
    .eq("status", from)
    .select("*")
    .maybeSingle();
  if (r.error) throw new Error("Introduction state update failed");
  return (r.data as IntroductionRow | null) ?? null;
}

async function characterKeyFor(db: Client, user: string, conversationId: string) {
  const r = await db.from("conversations").select("id,character:characters(key)")
    .eq("user_id", user).eq("id", conversationId).maybeSingle();
  return (r.data?.character as { key?: string } | null)?.key ?? null;
}

/**
 * After a Carly reply turn: offer Brooke's number exactly once when the first
 * meaningful conversation has a natural opening. Uses the service client.
 */
export async function maybeOfferBrookeIntroduction(
  admin: Client,
  user: string,
  conversationId: string,
  opts: { initiation: boolean },
): Promise<boolean> {
  if ((await characterKeyFor(admin, user, conversationId)) !== "carly") return false;
  const existing = await introductionRow(admin, user);
  if (existing && existing.status !== "not_mentioned") return false;
  const now = new Date().toISOString();
  const [users, carly, latest, lastCarly] = await Promise.all([
    admin.from("messages").select("id", { count: "exact", head: true })
      .eq("user_id", user).eq("conversation_id", conversationId).eq("sender", "user"),
    admin.from("messages").select("id", { count: "exact", head: true })
      .eq("user_id", user).eq("conversation_id", conversationId).eq("sender", "tess").lte("visible_at", now),
    admin.from("messages").select("body").eq("user_id", user).eq("conversation_id", conversationId)
      .eq("sender", "user").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("messages").select("visible_at").eq("user_id", user).eq("conversation_id", conversationId)
      .eq("sender", "tess").order("visible_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!shouldOffer({
    characterKey: "carly",
    status: existing?.status ?? null,
    userMessages: users.count ?? 0,
    carlyMessages: carly.count ?? 0,
    latestUserText: latest.data?.body ?? "",
    initiation: opts.initiation,
  })) return false;
  if (!existing) {
    const ins = await t(admin).insert({ user_id: user, status: "not_mentioned" });
    if (ins.error && ins.error.code !== "23505") throw new Error("Introduction state unavailable");
  }
  const next = transition("not_mentioned", "offer");
  if (!next) return false;
  const won = await advance(admin, user, "not_mentioned", next, {
    brooke_consented: true, // Brooke agreed in canon before Carly asks.
    offered_at: now,
  });
  if (!won) return false; // Another worker already offered.
  const after = Math.max(Date.now(), Date.parse(lastCarly.data?.visible_at ?? now)) + 75_000;
  const msg = await admin.from("messages").insert({
    user_id: user, conversation_id: conversationId, sender: "tess", body: BROOKE_OFFER_TEXT,
    visible_at: new Date(after).toISOString(),
    metadata: { [OFFER_METADATA_KEY]: "brooke_offer" },
  }).select("id").single();
  if (msg.error) {
    // Roll back so a later turn can retry the (unseen) offer instead of jamming.
    await advance(admin, user, "text_offered", "not_mentioned", { offered_at: null });
    throw new Error("Introduction message failed");
  }
  await t(admin).update({ offer_message_id: msg.data.id }).eq("user_id", user);
  return true;
}

/** Only the completed moving-help plan establishes Brooke's first meeting. */
export async function reconcileBrookeMeeting(admin: Client, user: string, conversationId?: string): Promise<boolean> {
  if (conversationId && (await characterKeyFor(admin, user, conversationId)) !== "brooke") return false;
  const row = await introductionRow(admin, user);
  if (row?.status !== "contact_accepted") return false;
  const ch = await admin.from("characters").select("id").eq("key", "brooke").maybeSingle();
  if (!ch.data) return false;
  const conv = await admin.from("conversations").select("id").eq("user_id", user).eq("character_id", ch.data.id).maybeSingle();
  if (!conv.data) return false;
  const done = await admin.from("living_experiences").select("id,plan_id,updated_at")
    .eq("user_id", user).eq("conversation_id", conv.data.id).eq("state", "completed")
    .order("updated_at", { ascending: true });
  if (done.error) throw new Error("Moving-help completion unavailable");
  for (const experience of done.data ?? []) {
    const plan = await admin.from("social_plans").select("id,title")
      .eq("user_id", user).eq("id", experience.plan_id).maybeSingle();
    if (plan.error) throw new Error("Moving-help plan unavailable");
    if (!/\b(?:moving(?:[- ]help)?|help(?:ing)?\s+(?:brooke\s+)?move|move\s+(?:boxes|furniture))\b/i.test(plan.data?.title ?? "")) continue;
    return !!(await advance(admin, user, "contact_accepted", "met", { met_at: experience.updated_at }));
  }
  return false;
}

export async function respondToBrookeIntroduction(
  admin: Client,
  user: string,
  accept: boolean,
): Promise<{ status: IntroductionStatus; changed: boolean }> {
  const row = await introductionRow(admin, user);
  if (!row) throw new Error("Carly hasn't offered an introduction");
  const to = transition(row.status, accept ? "accept" : "decline");
  if (!to) return { status: row.status, changed: false }; // idempotent re-click
  if (accept && !row.brooke_consented) throw new Error("Brooke hasn't agreed to share her number");
  // A claimed but uncommitted or future offer cannot authorize a contact unlock.
  const offer = row.offer_message_id ? await admin.from("messages").select("id,metadata")
    .eq("user_id", user).eq("id", row.offer_message_id).eq("sender", "tess")
    .lte("visible_at", new Date().toISOString()).maybeSingle() : null;
  const metadata = offer?.data?.metadata as Record<string, unknown> | null | undefined;
  if (!offer?.data || offer.error || metadata?.[OFFER_METADATA_KEY] !== "brooke_offer")
    throw new Error("Respond to Carly's visible offer first");
  const won = await advance(admin, user, row.status, to, { responded_at: new Date().toISOString() });
  const saved = won ?? await introductionRow(admin, user);
  if (!saved) throw new Error("Introduction state unavailable");
  return { status: saved.status, changed: !!won };
}
