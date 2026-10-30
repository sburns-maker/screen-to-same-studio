import { PendingPhotoTask } from "./spicy-image.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { CHARACTERS, characterFor, type CharacterKey } from "./characters";
import {
  PHOTO_LAB_TYPES,
  PHOTO_LAB_PRESETS,
  labTypeSupported,
  type PhotoLabType,
  type PhotoLabResult,
} from "./developer-photo-lab";
import { developerPhotosAllowed } from "./spontaneous-photo.server";
import { photoActionId } from "./photo-delivery.server";
import { reserveImageBudget } from "./world-runtime.server";
import { safePhotoScene } from "./photo-policy";
import {
  generateTessImage,
  includesTess,
  lovableGatewayProvider,
  PhotoGenerationFailure,
} from "./tess-image.server";
import { requireVisualScreen } from "./photo-identity-qc.server";
import { currentCanonical } from "./profile-media.server";
type Client = SupabaseClient<Database>;
type Job = Database["public"]["Tables"]["job_runs"]["Row"];
const jobName = (conversation: string) => `developer-photo-lab:${conversation}`;
async function authorize(db: Client, user: string, conversation: string) {
  if (!developerPhotosAllowed(user)) throw new Error("Developer photo tests are disabled");
  const r = await db
    .from("conversations")
    .select("id,character:characters(key,age)")
    .eq("id", conversation)
    .eq("user_id", user)
    .maybeSingle();
  const character = r.data?.character as { key?: string; age?: number } | null;
  const key = character?.key;
  if (
    r.error ||
    !key ||
    !Object.hasOwn(CHARACTERS, key) ||
    !Number.isInteger(character?.age) ||
    (character?.age ?? 0) < 18
  )
    throw new Error("Owned configured character required");
  return characterFor(key);
}
function record(job: Job, user: string, conversation: string) {
  if (!job.detail || typeof job.detail !== "object" || Array.isArray(job.detail))
    throw new Error("Photo test record is invalid");
  const d = job.detail as Record<string, Json | undefined>;
  if (
    job.job !== jobName(conversation) ||
    d["userId"] !== user ||
    d["conversationId"] !== conversation ||
    !PHOTO_LAB_TYPES.includes(d["category"] as PhotoLabType)
  )
    throw new Error("Photo test owner or category mismatch");
  return d;
}
async function present(
  db: Client,
  job: Job,
  user: string,
  conversation: string,
): Promise<PhotoLabResult> {
  const d = record(job, user, conversation);
  let url: string | null = null;
  if (job.status === "ok") {
    const path = d["path"];
    if (typeof path !== "string" || path !== `${user}/developer-photo-tests/${job.id}.png`)
      throw new Error("Photo test storage mismatch");
    const signed = await db.storage.from("tess-photos").createSignedUrl(path, 120);
    url = signed.error ? null : (signed.data?.signedUrl ?? null);
  }
  return {
    requestId: typeof d["requestId"] === "string" ? d["requestId"] : null,
    id: job.id,
    category: d["category"] as PhotoLabType,
    status:
      job.status === "ok"
        ? url
          ? "ready"
          : "stored"
        : job.status === "running"
          ? "running"
          : "failed",
    startedAt: job.started_at,
    recoverable:
      job.status === "running" &&
      d["phase"] === "generating" &&
      Date.now() - Date.parse(job.started_at) > 300_000,
    url,
    reason: typeof d["reason"] === "string" ? d["reason"] : null,
    diagnostics: d["diagnostics"] ? JSON.stringify(d["diagnostics"]) : null,
  };
}
export async function photoLabHistory(db: Client, user: string, conversation: string) {
  const def = await authorize(db, user, conversation);
  await (await import("./spicy-jobs.server")).processSpicyPhotos(db,{user,conversation});
  const r = await db
    .from("job_runs")
    .select("*")
    .eq("job", jobName(conversation))
    .order("started_at", { ascending: false })
    .limit(12);
  if (r.error) throw new Error("Photo test history unavailable");
  return {
    character: def.preferredName,
    types: PHOTO_LAB_TYPES.map((type) => ({
      type,
      label: PHOTO_LAB_PRESETS[type].label,
      supported: labTypeSupported(def, type),
    })),
    results: await Promise.all((r.data ?? []).map((j) => present(db, j, user, conversation))),
  };
}
/** Isolated rendering test, never a character turn or evidence of character consent. */
export async function generatePhotoLabTest(
  db: Client,
  user: string,
  conversation: string,
  requestId: string,
  type: PhotoLabType,
  customScene?: string,
) {
  const def = await authorize(db, user, conversation);
  if (!PHOTO_LAB_TYPES.includes(type) || !labTypeSupported(def, type))
    throw new Error("This category is unavailable for this adult character");
  if (customScene && (!safePhotoScene(customScene) || customScene.length > 400)) throw new Error("Custom scene outside supported boundaries");
  const id = await photoActionId(`developer-photo-lab:${user}:${conversation}:${requestId}`);
  const old = await db.from("job_runs").select("*").eq("id", id).maybeSingle();
  if (old.error) throw new Error("Photo test reservation unavailable");
  if (old.data) {
    if (record(old.data, user, conversation)["category"] !== type)
      throw new Error("Photo test ID belongs to another category");
    return present(db, old.data, user, conversation);
  }
  const detail = {
    userId: user,
    conversationId: conversation,
    category: type,
    requestId,
    phase: "generating",
    testOnly: true,
  };
  const claim = await db
    .from("job_runs")
    .insert({ id, job: jobName(conversation), status: "running", detail });
  if (claim.error) {
    if (claim.error.code !== "23505") throw new Error("Photo test could not be reserved");
    const active = await db
      .from("job_runs")
      .select("*")
      .eq("job", jobName(conversation))
      .eq("status", "running")
      .maybeSingle();
    if (active.error || !active.data)
      throw new Error("Photo test changed; check test history before retrying");
    return present(db, active.data, user, conversation);
  }
  try {
    const scene = customScene?.trim() && (type === "mature_romantic" || type === "mature_adult" || type === "suggestive")
      ? `${PHOTO_LAB_PRESETS[type].scene} Custom styling and scene: ${customScene.trim()}. Opaque clothing and tasteful non-explicit composition.`
      : PHOTO_LAB_PRESETS[type].scene;
    if (!safePhotoScene(scene)) throw new Error("Photo test scene rejected");
    const generationType = type === "mature_adult" ? "mature_romantic" : type;
    const canonical = includesTess(generationType)
      ? await currentCanonical(db, user, def.key as CharacterKey)
      : undefined;
    const key = process.env["OPENAI_API_KEY"] || process.env["LOVABLE_API_KEY"];
    // Select the generation provider first, so missing SpicyAPI configuration
    // fails with a specific error without reserving paid image-attempt budget.
    // OpenAI is NOT a suggestive generation fallback. The separate visual
    // quality screen may still need an OpenAI key before any generation begins.
    if (!key && generationType !== "suggestive") throw new Error("Image provider not configured");
    const provider = await (await import("./photo-provider-router.server")).configuredPhotoProvider(
      db, user, def.key as CharacterKey, generationType, lovableGatewayProvider(key ?? ""),
      id, conversation,
      {scene, expression: null, delivery: "lab", type: generationType === "suggestive" ? "suggestive" : "mature_romantic"},
    );
    requireVisualScreen();
    if (!(await reserveImageBudget(db, id, conversation, user)))
      throw new Error("Image attempt budget exhausted");
    const image = await generateTessImage({
      provider,
      canonical,
      type: generationType,
      scene,
      expression: null,
      identity: {
        key: def.key,
        name: def.fullName,
        age: def.age,
        pronouns: def.pronouns,
        appearance: def.appearance,
      },
    });
    const path = `${user}/developer-photo-tests/${id}.png`;
    const stored = await db.storage
      .from("tess-photos")
      .upload(path, image.bytes, { contentType: image.mime, upsert: false });
    if (stored.error) throw new Error("Photo test upload failed");
    const result = await db
      .from("job_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        detail: {
          ...detail,
          phase: "stored",
          path,
          diagnostics: image.diagnostics as unknown as Json,
        },
      })
      .eq("id", id)
      .eq("status", "running")
      .select("*")
      .maybeSingle();
    if (result.error || !result.data)
      throw new Error("Photo test result was not committed; check history");
    await db
      .from("media_attempts")
      .update({ status: "generated", storage_path: path })
      .eq("action_id", id)
      .eq("user_id", user);
    return present(db, result.data, user, conversation);
  } catch (error) {
    if(error instanceof PendingPhotoTask){
      const pending=await db.from("job_runs").update({detail:{...detail,phase:"spicy_pending"}}).eq("id",id).eq("status","running").select("*").single();
      if(pending.error)throw new Error("Photo test remains queued; check history before retrying");
      (await import("./spicy-jobs.server")).startSpicyPhotoRecovery(db,{user,action:id});
      return present(db,pending.data,user,conversation);
    }
    const known = [
      "visual_screen_unavailable",
      "Identity registry unavailable",
      "Canonical identity is not approved",
      "Canonical reference integrity check failed",
      "Approved canonical reference unavailable",
      "Approved canonical reference missing",
      "Photo test scene rejected",
      "Image attempt budget exhausted",
      "Image provider not configured",
      "Suggestive photos require SpicyAPI to be enabled",
      "Enable SpicyAPI for this character to test suggestive photos",
      "SpicyAPI server secret missing",
      "Unsupported SpicyAPI model",
      "Configure SpicyAPI spending reservations",
      "Verify usable SpicyAPI account credit before enabling live calls",
      "SpicyAPI migration or preferences unavailable",
      "Adult non-nude romantic photo eligibility required",
      "Photo test upload failed",
      "Photo test result was not committed; check history",
    ];
    const reason =
      error instanceof PhotoGenerationFailure
        ? (error.diagnostics.failureReason ?? "generation_or_quality_check_failed")
        : error instanceof Error && known.includes(error.message)
          ? error.message
          : "Photo test generation or reference check failed";
    await db
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        detail: {
          ...detail,
          phase: "failed",
          reason,
          ...(error instanceof PhotoGenerationFailure
            ? { diagnostics: error.diagnostics as unknown as Json }
            : {}),
        },
      })
      .eq("id", id)
      .eq("status", "running");
    await db
      .from("media_attempts")
      .update({ status: "failed" })
      .eq("action_id", id)
      .eq("user_id", user)
      .eq("status", "reserved");
    const saved = await db.from("job_runs").select("*").eq("id", id).single();
    if (saved.error)
      throw new Error("Photo test status unavailable; check history before another request");
    return present(db, saved.data, user, conversation);
  }
}
export async function releasePhotoLabTest(
  db: Client,
  user: string,
  conversation: string,
  id: string,
) {
  await authorize(db, user, conversation);
  const row = await db.from("job_runs").select("*").eq("id", id).maybeSingle();
  if (row.error || !row.data) throw new Error("Photo test unavailable");
  const detail = record(row.data, user, conversation);
  if (
    detail["phase"] !== "generating" ||
    row.data.status !== "running" ||
    Date.now() - Date.parse(row.data.started_at) <= 300_000
  )
    throw new Error("Only an expired test reservation can be released");
  const r = await db
    .from("job_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      detail: {
        ...record(row.data, user, conversation),
        phase: "failed",
        reason: "Expired test released; this request will not be generated again",
      },
    })
    .eq("id", id)
    .eq("status", "running")
    .eq("started_at", row.data.started_at)
    .eq("detail->>phase", "generating")
    .eq("detail->>userId", user);
  if (r.error) throw new Error("Photo test release failed");
  return photoLabHistory(db, user, conversation);
}
