import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
export type DeliveryResult = {
  count: number;
  lastVisibleAt: string | null;
  replayed?: boolean;
  reason?: string;
  notificationGroup?: string;
};
export async function photoActionId(key: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`photo-action:v1:${key}`),
  );
  const h = Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function existingPhotoAction(admin: Admin, key: string): Promise<string | null> {
  const { data, error } = await admin
    .from("job_runs")
    .select("status")
    .eq("id", await photoActionId(key))
    .maybeSingle();
  if (error) throw new Error("Character action history unavailable");
  return data?.status ?? null;
}

export async function recoverPhotoDelivery(
  admin: Admin,
  conversationId: string,
  userId: string,
): Promise<DeliveryResult | null> {
  const { data, error } = await admin
    .from("job_runs")
    .select("id, detail, started_at")
    .eq("job", `photo-turn:${conversationId}`)
    .eq("status", "running")
    .maybeSingle();
  if (error) throw new Error("Photo delivery status unavailable");
  if (!data) return null;
  const detail = data.detail as { userId?: string; phase?: string };
  if (detail.userId !== userId) throw new Error("Photo delivery owner mismatch");
  if (detail.phase !== "prepared") {
    // A lost provider response is ambiguous. Release the conversation after five minutes,
    // but retain this action's primary key forever so retries cannot charge it again.
    if (Date.now() - Date.parse(data.started_at) > 300_000) {
      await failPhotoAction(admin, data.id);
      return null;
    }
    return { count: 0, lastVisibleAt: null, reason: "photo generation already reserved" };
  }
  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .select("difficulty, character:characters(key)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (convError || !conversation) throw new Error("Photo recovery conversation unavailable");
  const { characterFor } = await import("./characters");
  const { currentActivity } = await import("./world-continuity");
  const def = characterFor(conversation.character?.key);
  const schedule = currentActivity(def, new Date(), conversation.difficulty === "chaos" ? 2 : 1);
  if (schedule.availability === "asleep" || schedule.availability === "busy")
    return { count: 0, lastVisibleAt: null, reason: "photo recovery waits for availability" };
  return deliverPhotoTurn(admin, data.id);
}

export async function reservePhotoAction(
  admin: Admin,
  args: { key: string; conversationId: string; userId: string },
): Promise<string | null> {
  // Probe the migration before any paid image request. Missing RPC fails closed.
  const { error: unsupported } = await admin.rpc("deliver_photo_turn", { p_job_id: null as unknown as string });
  if (unsupported) throw new Error("Photo delivery migration is not installed");
  const id = await photoActionId(args.key);
  const { error } = await admin.from("job_runs").insert({
    id,
    job: `photo-turn:${args.conversationId}`,
    status: "running",
    detail: { userId: args.userId, conversationId: args.conversationId, phase: "generating" },
  });
  if (error?.code === "23505") return null; // Primary key = same action; partial unique index = another action in flight.
  if (error) throw new Error("Cannot reserve photo action");
  return id;
}

export async function failPhotoAction(admin: Admin, id: string) {
  const { error } = await admin
    .from("job_runs")
    .update({ status: "failed", finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Photo action remains reserved; inspect before retrying");
}

export async function preparePhotoDelivery(
  admin: Admin,
  id: string,
  userId: string,
  conversationId: string,
  plan: Json,
): Promise<DeliveryResult> {
  const { error } = await admin
    .from("job_runs")
    .update({ detail: { phase: "prepared", userId, conversationId, plan } })
    .eq("id", id)
    .eq("status", "running");
  if (error)
    throw new Error("Photo was generated but delivery could not be prepared; do not regenerate");
  return deliverPhotoTurn(admin, id);
}

async function deliverPhotoTurn(admin: Admin, id: string): Promise<DeliveryResult> {
  const { data, error } = await admin.rpc("deliver_photo_turn", { p_job_id: id });
  if (error) throw new Error("Photo delivery deferred; retry delivery without regenerating");
  return data as unknown as DeliveryResult;
}
