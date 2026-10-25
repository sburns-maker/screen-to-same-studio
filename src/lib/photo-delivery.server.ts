import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
export type DeliveryResult = {
  count: number;
  lastVisibleAt: string | null;
  replayed?: boolean;
  reason?: string;
  notificationGroup?: string;
  preparedActionId?: string;
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
  if (detail.phase === "voice_prepared")
    return { count: 0, lastVisibleAt: null, reason: "Phone playback acknowledgement pending" };
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
  // A prepared response has already been generated and paid for. Replaying its
  // atomic delivery must not depend on what the character is doing *now*:
  // a later shift/sleep transition is irrelevant to an earlier prepared turn.
  // The database RPC still verifies ownership and rejects stale turns.
  return deliverPhotoTurn(admin, data.id);
}

export async function reservePhotoAction(
  admin: Admin,
  args: { key: string; conversationId: string; userId: string },
): Promise<string | null> {
  // Probe the migration before any paid image request. Missing RPC fails closed.
  const { error: unsupported } = await admin.rpc("deliver_photo_turn", {
    p_job_id: null as unknown as string,
  });
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
  deferVoice?: { callId: string; turnId: string },
): Promise<DeliveryResult> {
  const { error } = await admin
    .from("job_runs")
    .update({
      detail: {
        phase: deferVoice ? "voice_prepared" : "prepared",
        userId,
        conversationId,
        plan,
        ...(deferVoice ? { callId: deferVoice.callId, callTurnId: deferVoice.turnId } : {}),
      },
    })
    .eq("id", id)
    .eq("status", "running");
  if (error)
    throw new Error("Photo was generated but delivery could not be prepared; do not regenerate");
  if (deferVoice) return { count: 0, lastVisibleAt: null, preparedActionId: id };
  return deliverPhotoTurn(admin, id);
}

type HistoryDetail = {
  userId?: string;
  conversationId?: string;
  plan?: {
    rows?: Array<{ id: string; body?: string }>;
    relationshipHistory?: {
      before: unknown; after: unknown; delta: unknown; previousStage: string; stage: string;
      tone?: string | null; tags?: string[]; sourceKind?: string; contextSummary?: string;
      perspective?: string | null; evaluatedAt?: string;
    };
  };
};

/** Pure: build the evaluation row from the job detail captured before delivery. */
export function evaluationFromDetail(detail: HistoryDetail | null | undefined, delivered: number) {
  const h = detail?.plan?.relationshipHistory;
  const messageId = detail?.plan?.rows?.[0]?.id;
  if (!(delivered > 0) || !detail?.userId || !detail.conversationId || !messageId || !h) return null;
  return {
    user_id: detail.userId, conversation_id: detail.conversationId, message_id: messageId,
    ...(h.evaluatedAt ? { evaluated_at: h.evaluatedAt } : {}),
    source_kind: h.sourceKind ?? "photo_delivery",
    state_before: h.before, state_after: h.after, delta: h.delta,
    stage_before: h.previousStage, stage_after: h.stage,
    observed_tone: h.tone ?? null, event_tags: h.tags ?? [],
    context_summary: (h.contextSummary ?? "Photo and associated character response delivered").slice(0, 300),
    character_perspective: h.perspective?.trim().slice(0, 700) || null,
  };
}

async function deliverPhotoTurn(admin: Admin, id: string): Promise<DeliveryResult> {
  // The delivery RPC replaces job detail with its result, so capture the
  // evaluation plan first. Reading it afterwards always found nothing.
  let detail: HistoryDetail | undefined;
  try {
    const { data: job } = await admin.from("job_runs").select("detail").eq("id", id).maybeSingle();
    detail = job?.detail as HistoryDetail | undefined;
  } catch (e) { console.warn("[relationship-history] Could not read pending evaluation:", e); }
  const { data, error } = await admin.rpc("deliver_photo_turn", { p_job_id: id });
  if (error) {
    // Keep the prepared outbox intact so the same paid image can be retried.
    // Log structured PostgreSQL diagnostics, never SQL details or message contents.
    console.error("[photo-delivery] deliver_photo_turn failed", {
      jobId: id,
      code: error.code ?? "unknown",
      message: error.message ?? "unknown",
      hint: error.hint ?? null,
    });
    throw new Error("Photo delivery deferred; retry delivery without regenerating");
  }
  const result=data as unknown as DeliveryResult;
  // Only record after the delivery RPC has committed. A missing history
  // migration must never cause image regeneration or block its delivery.
  try {
    const row = evaluationFromDetail(detail, result.count);
    if (row) {
      const {error:historyError}=await admin.from("relationship_evaluations" as "memories").upsert(row as never,{onConflict:"conversation_id,message_id"});
      if(historyError)console.warn("[relationship-history] Photo history pending:",historyError.message);
    } else if (result.count > 0) {
      console.warn("[relationship-history] Delivered turn had no evaluation plan:", id);
    }
  }catch(e){console.warn("[relationship-history] Photo history pending:",e);}
  return result;
}
