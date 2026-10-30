import { createServerOnlyFn } from "@tanstack/react-start";
import { deliveredRomanticPhotoMemory } from "./photo-mature-personality";
import { CHARACTERS } from "./characters";
import { keepAlive } from "./request-context.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { CharacterKey } from "./characters";
import type { PhotoStyle } from "./tess-photos";
import type { PhotographyPlan } from "./photo-personality";
import {
  spicyConfiguration,
  buildSpicyRequest,
  spicyRequest,
  quoteSpicyRequest,
  downloadSpicyOutput,
  PendingPhotoTask,
  SpicyHttpFailure,
  SpicyQuoteFailure,
} from "./spicy-image.server";
import { currentCanonical, portraitHash } from "./profile-media.server";
import { screenPhotoVisuals } from "./photo-identity-qc.server";
type Client = SupabaseClient<Database>;
export type SpicyContext = {
  scene: string;
  expression: string | null;
  type?: "mature_romantic" | "suggestive";
  style?: PhotoStyle | null;
  photography?: PhotographyPlan;
  delivery?: "chat" | "lab";
};
type Job = {
  action_id: string;
  user_id: string;
  conversation_id: string;
  character_key: CharacterKey;
  task_id: string | null;
  stored_sha256: string | null;
  model: string;
  status: string;
  lease_token: string;
  poll_count: number;
  created_at: string;
  payload: SpicyContext & { canonicalSha256: string };
};
export const submitSpicyPhoto = createServerOnlyFn(async function submitSpicyPhoto(
  db: Client,
  user: string,
  conversation: string,
  character: CharacterKey,
  action: string,
  prompt: string,
  urls: string[],
  canonicalSha256: string,
  context: SpicyContext,
): Promise<never> {
  const config = spicyConfiguration(character);
  if (!config.ready) throw new Error("spicy_configuration_incomplete");
  const body = buildSpicyRequest(config.model, prompt, urls);
  // Never persist signed URLs or keys. No automatic POST retry, even within the
  // provider's 24-hour idempotency window; a lost submission stays conservative.
  const hash = await portraitHash(
    new TextEncoder().encode(
      JSON.stringify({ model: config.model, prompt, canonicalSha256, context }),
    ),
  );
  // Free quote first: a rejected quote (schema, balance, spend cap, model
  // permission) costs nothing and creates no reservation.
  // Structured quote failures (SpicyHttpFailure / SpicyQuoteFailure) propagate
  // unchanged so diagnostics keep stage, status, provider code and request id.
  const quote = await quoteSpicyRequest(body);
  if (quote.cents > config.jobCents) throw new SpicyQuoteFailure("spicy_quote_budget_exceeded");
  const reserved = await db.rpc(
    "spicy_photo_reserve" as never,
    {
      p_user: user,
      p_action: action,
      p_conversation: conversation,
      p_character: character,
      p_hash: hash,
      p_model: config.model,
      p_payload: {
        ...context,
        canonicalSha256,
        quote: { quoteId: quote.quoteId, expectedCost: quote.expectedCost },
      },
      p_cents: quote.cents,
      p_daily: config.dailyCents,
      p_monthly: config.monthlyCents,
    } as never,
  );
  if (reserved.error) throw new Error("spicy_budget_or_action_unavailable");
  const claim = reserved.data as unknown as {
    fresh: boolean;
    record: Job & { idempotency_key: string };
  };
  if (!claim?.record || typeof claim.fresh !== "boolean")
    throw new Error("spicy_reservation_invalid");
  if (!claim.fresh) {
    if (claim.record.status === "processing") throw new PendingPhotoTask(action);
    throw new Error("spicy_action_already_reserved");
  }
  try {
    // Price-locked submission with the persisted idempotency key.
    const task = await spicyRequest(
      "/jobs/createTask",
      { ...body, quoteId: quote.quoteId, expectedCost: quote.expectedCost },
      claim.record.idempotency_key,
    );
    const stored = await db
      .from("spicy_photo_jobs")
      .update({
        task_id: task.taskId,
        status: "processing",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("action_id", action)
      .eq("user_id", user)
      .eq("status", "submitting")
      .select("action_id")
      .maybeSingle();
    if (stored.error || !stored.data) throw new Error("spicy_task_record_uncertain");
  } catch (e) {
    // Unknown acceptance is never treated as free and never resubmitted. HTTP
    // status alone does not establish that a charge was refunded.
    const definitive =
      e instanceof SpicyHttpFailure && [400, 401, 402, 403, 422].includes(e.status);
    await db
      .from("spicy_photo_jobs")
      .update({
        status: definitive ? "failed" : "unknown",
        failure_code:
          e instanceof SpicyHttpFailure ? `spicy_http_${e.status}` : "spicy_submission_unknown",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("action_id", action)
      .eq("user_id", user)
      .eq("status", "submitting");
    throw new Error(
      e instanceof SpicyHttpFailure
        ? `SpicyAPI rejected the request (HTTP ${e.status}); no automatic retry was made.`
        : "SpicyAPI submission could not be confirmed; no automatic retry was made.",
    );
  }
  throw new PendingPhotoTask(action);
});
function completedMetadata(job: Job, canonical: { asset: string; sha256: string }, path: string) {
  const identity = {
    canonicalAsset: canonical.asset,
    canonicalSha256: canonical.sha256,
    referenceConditioning: true,
    provider: "spicyapi",
    model: job.model,
    validationStatus: "screen_passed",
    retryCount: 0,
  };
  return {
    generated_path: path,
    generated_image_id: job.action_id,
    photo_type: job.payload.type === "suggestive" ? "suggestive" : "mature_romantic",
    photo_identity: identity,
    photo_visual: {
      version: 1,
      character: job.character_key,
      location: job.payload.photography?.location ?? null,
      style: job.payload.style ?? {},
      objects: job.payload.photography?.continuity.objects ?? [],
    },
  };
}
async function rememberCommittedPhoto(db: Client, job: Job) {
  if (job.payload.delivery === "lab") return;
  const summary = deliveredRomanticPhotoMemory(
    CHARACTERS[job.character_key].preferredName,
    job.payload.type === "suggestive" ? "suggestive" : "mature_romantic",
  );
  if (!summary) return;
  const existing = await db.from("memories").select("id")
    .eq("user_id", job.user_id).eq("conversation_id", job.conversation_id)
    .eq("summary", summary).maybeSingle();
  if (existing.error || existing.data) return;
  const saved = await db.from("memories").insert({
    user_id: job.user_id, conversation_id: job.conversation_id,
    memory_type: "relationship", summary, importance: 4,
  });
  if (saved.error) console.warn("[spicy-photo] Delivered attachment saved, memory insert pending");
}
async function finish(db: Client, job: Job, metadata: unknown, failure: string | null) {
  const r = await db.rpc(
    "spicy_photo_finish" as never,
    {
      p_action: job.action_id,
      p_token: job.lease_token,
      p_metadata: metadata,
      p_failure: failure,
    } as never,
  );
  if (r.error) throw new Error("spicy_delivery_commit_failed");
  const committed = r.data === true;
  if (committed && metadata != null) {
    // Failure to add a summary never causes a paid image to be submitted again.
    await rememberCommittedPhoto(db, job).catch(() =>
      console.warn("[spicy-photo] Delivered attachment saved, memory update pending"));
  }
  return committed;
}
/** Worker-owned leases; GET-only recovery. Never creates another provider job. */
export const processSpicyPhotos = createServerOnlyFn(async function processSpicyPhotos(
  db: Client,
  only?: { user: string; action?: string; conversation?: string },
) {
  if (process.env["SPICY_ENABLED"] !== "true" || !process.env["SPICY_API_KEY"]) return;
  let query = db
    .from("spicy_photo_jobs")
    .select("action_id,user_id")
    .eq("status", "processing")
    .lte("next_poll_at", new Date().toISOString())
    .order("next_poll_at")
    .limit(5);
  if (only) {
    query = query.eq("user_id", only.user);
    if (only.action) query = query.eq("action_id", only.action);
    if (only.conversation) query = query.eq("conversation_id", only.conversation);
  }
  const due = await query;
  if (due.error) {
    if (["42P01", "PGRST205"].includes(due.error.code)) return;
    throw new Error("spicy_poll_queue_unavailable");
  }
  for (const candidate of (due.data ?? []) as unknown as { action_id: string; user_id: string }[]) {
    const claim = await db.rpc("spicy_photo_claim", { p_action: candidate.action_id } as never);
    if (claim.error || !claim.data) continue;
    const job = claim.data as unknown as Job;
    let retry = Math.min(15, 3 + job.poll_count * 2);
    try {
      if (!job.task_id) continue;
      // Do not finalize before the original turn's atomic outbox has committed.
      const isLab = job.payload.delivery === "lab";
      const destination = isLab
        ? await db
            .from("job_runs")
            .select("id")
            .eq("id", job.action_id)
            .eq("detail->>phase", "spicy_pending")
            .maybeSingle()
        : await db
            .from("messages")
            .select("id")
            .eq("user_id", job.user_id)
            .eq("conversation_id", job.conversation_id)
            .eq("metadata->photo_pending->>actionId", job.action_id)
            .maybeSingle();
      if (destination.error) throw new Error("spicy_destination_lookup_failed");
      if (!destination.data) {
        if (Date.now() - Date.parse(job.created_at) > 3600000)
          await db
            .from("spicy_photo_jobs")
            .update({ status: "failed", failure_code: "spicy_destination_unavailable" })
            .eq("action_id", job.action_id)
            .eq("lease_token", job.lease_token);
        continue;
      }
      const prefs = await db
        .from("photo_reference_state")
        .select("spicy_enabled,adult_confirmed")
        .eq("user_id", job.user_id)
        .eq("character_key", job.character_key)
        .maybeSingle();
      if (prefs.error) throw new Error("spicy_preferences_unavailable");
      if (!prefs.data?.spicy_enabled || !prefs.data.adult_confirmed) {
        await finish(db, job, null, "spicy_permission_changed");
        continue;
      }
      if (!isLab) {
        const conversation = await db
          .from("conversations")
          .select("mature_photography,photo_boundary")
          .eq("user_id", job.user_id)
          .eq("id", job.conversation_id)
          .maybeSingle();
        if (conversation.error) throw new Error("spicy_conversation_unavailable");
        if (!conversation.data?.mature_photography || conversation.data.photo_boundary !== "none") {
          await finish(db, job, null, "spicy_boundary_changed");
          continue;
        }
      }
      if (Date.now() - Date.parse(job.created_at) > 86400000) {
        await finish(db, job, null, "spicy_wait_expired_no_retry");
        continue;
      }
      const canonical = await currentCanonical(db, job.user_id, job.character_key);
      if (canonical.sha256 !== job.payload.canonicalSha256) {
        await finish(db, job, null, "spicy_identity_changed");
        continue;
      }
      const path = isLab
        ? `${job.user_id}/developer-photo-tests/${job.action_id}.png`
        : `${job.user_id}/${job.action_id}.png`;
      if (job.stored_sha256) {
        const existing = await db.storage.from("tess-photos").download(path);
        if (
          existing.error ||
          !existing.data ||
          (await portraitHash(new Uint8Array(await existing.data.arrayBuffer()))) !==
            job.stored_sha256
        )
          throw new Error("spicy_stored_image_integrity_failed");
        await finish(db, job, completedMetadata(job, canonical, path), null);
        continue;
      }
      const task = await spicyRequest(`/jobs/recordInfo?taskId=${encodeURIComponent(job.task_id)}`);
      if (task.taskId !== job.task_id) throw new Error("spicy_task_identity_mismatch");
      const cost = Number(task.cost);
      if (
        task.settled === true &&
        task.cost !== undefined &&
        Number.isFinite(cost) &&
        cost >= 0 &&
        cost < 1000000
      ) {
        const c = await db
          .from("spicy_photo_jobs")
          .update({ cost_usd: cost } as never)
          .eq("action_id", job.action_id)
          .eq("lease_token", job.lease_token);
        if (c.error) throw new Error("spicy_cost_record_failed");
      }
      if (task.state === "failed") {
        await finish(db, job, null, "spicy_generation_failed");
        continue;
      }
      if (task.state !== "succeeded") {
        if (Date.now() - Date.parse(job.created_at) > 86400000)
          await finish(db, job, null, "spicy_wait_expired_no_retry");
        continue;
      }
      const url = task.output?.assets?.[0]?.url;
      if (typeof url !== "string") throw new Error("spicy_output_missing");
      const image = await downloadSpicyOutput(url, job.model);
      try {
        await screenPhotoVisuals(
          canonical.blob,
          new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
          job.payload.scene,
        );
      } catch {
        await finish(db, job, null, "spicy_visual_screen_failed");
        continue;
      }
      const upload = await db.storage
        .from("tess-photos")
        .upload(path, image.bytes, { contentType: image.mime, upsert: false });
      // A worker that stored bytes before losing its lease reuses those bytes,
      // never overwrites a delivered object or submits another generation.
      if (upload.error) {
        const existing = await db.storage.from("tess-photos").download(path);
        if (
          existing.error ||
          !existing.data ||
          (await portraitHash(new Uint8Array(await existing.data.arrayBuffer()))) !==
            (await portraitHash(image.bytes))
        )
          throw new Error("spicy_storage_failed");
      }
      const stored = await db
        .from("spicy_photo_jobs")
        .update({ stored_sha256: await portraitHash(image.bytes) })
        .eq("action_id", job.action_id)
        .eq("lease_token", job.lease_token);
      if (stored.error) throw new Error("spicy_storage_receipt_failed");
      await finish(db, job, completedMetadata(job, canonical, path), null);
    } catch (e) {
      if (e instanceof SpicyHttpFailure) {
        retry = e.retrySeconds;
        if ([400, 401, 402, 403, 404, 409, 422].includes(e.status)) {
          await finish(db, job, null, `spicy_http_${e.status}`);
          continue;
        }
      }
      // Poll/network/storage failures retain the known task and never repeat POST.
      console.warn("[spicy-photo]", {
        actionId: job.action_id,
        phase: "poll_or_delivery",
        reason: e instanceof SpicyHttpFailure ? `http_${e.status}` : "pending_recovery",
      });
    } finally {
      await db
        .from("spicy_photo_jobs")
        .update({
          lease_token: null,
          lease_until: null,
          next_poll_at: new Date(Date.now() + retry * 1000).toISOString(),
        } as never)
        .eq("action_id", job.action_id)
        .eq("lease_token", job.lease_token);
    }
  }
});
export const spicyJobHistory = createServerOnlyFn(async function spicyJobHistory(
  db: Client,
  user: string,
  character: string,
) {
  const r = await db
    .from("spicy_photo_jobs")
    .select("action_id,status,task_id,model,cost_usd,failure_code,created_at,updated_at")
    .eq("user_id", user)
    .eq("character_key", character)
    .order("created_at", { ascending: false })
    .limit(5);
  if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return [];
  if (r.error) throw new Error("SpicyAPI job history unavailable");
  return (
    (r.data ?? []) as unknown as {
      action_id: string;
      status: string;
      task_id: string | null;
      cost_usd: number | null;
      failure_code: string | null;
      model: string;
    }[]
  ).map((r) => ({ ...r, job_id: r.task_id, refund_expected: false }));
});

/** Short post-response continuation; persisted tasks also resume in the world worker
 * or an authenticated chat refresh. This never submits or re-submits generation.
 */
export const startSpicyPhotoRecovery = createServerOnlyFn(function startSpicyPhotoRecovery(
  db: Client,
  only?: { user: string; action?: string; conversation?: string },
) {
  if (process.env["SPICY_ENABLED"] !== "true") return;
  keepAlive(
    (async () => {
      await new Promise((r) => setTimeout(r, 3000));
      await processSpicyPhotos(db, only);
    })().catch(() => {
      console.warn("[spicy-photo] Pending task retained for recovery");
    }),
  );
});
