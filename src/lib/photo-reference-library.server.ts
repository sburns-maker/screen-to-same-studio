import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CHARACTERS, type CharacterKey } from "./characters";
import {
  REFERENCE_ROLES,
  pickReferenceCandidates,
  type ReferenceRole,
} from "./photo-reference-library";
import { currentCanonical, portraitHash } from "./profile-media.server";
import { registerPrimaryIdentity } from "./visual-profiles.server";
type Client = SupabaseClient<Database>;
export const PROVIDER_REFERENCE_TTL = 1800;
export async function referenceLibraryAvailable(db: Client) {
  const r = await db.rpc("photo_reference_status");
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Reference library unavailable");
  return r.data === 47;
}
async function ownedCharacter(db: Client, user: string, key: CharacterKey) {
  const ch = await db.from("characters").select("id").eq("key", key).single();
  if (ch.error) throw new Error("Character unavailable");
  const c = await db
    .from("conversations")
    .select("id,last_read_at,mature_photography")
    .eq("user_id", user)
    .eq("character_id", ch.data.id)
    .maybeSingle();
  if (c.error || !c.data) throw new Error("Owned conversation required");
  return c.data;
}
async function privateBucket(db: Client) {
  const r = await db.storage.getBucket("tess-photos");
  if (r.error || !r.data || r.data.public) throw new Error("Private photo storage required");
}
export async function referenceLibraryPage(
  db: Client,
  user: string,
  key: CharacterKey,
  offset = 0,
) {
  const available = await referenceLibraryAvailable(db);
  const conv = await ownedCharacter(db, user, key);
  const canonical = await currentCanonical(db, user, key);
  if (!available)
    return {
      available: false,
      character: key,
      conversationId: conv.id,
      hash: canonical.sha256,
      version: 0,
      lastAction: null as string | null,
      slots: [],
      rejected: [],
      candidates: [],
      nextOffset: null as number | null,
      approved: 0,
      status: "Migration 0047 required",
      matureEnabled: !!conv.mature_photography,
      api18Enabled: false,
      adultConfirmed: false,
      romanticCapable: CHARACTERS[key].romanticCapable,
    };
  const [messages, slots, state] = await Promise.all([
    db
      .from("messages")
      .select("id,created_at,visible_at,metadata")
      .eq("user_id", user)
      .eq("conversation_id", conv.id)
      .eq("sender", "tess")
      .lte("visible_at", new Date().toISOString())
      .lte("visible_at", conv.last_read_at ?? "1970-01-01T00:00:00Z")
      .not("metadata->>generated_path", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 24),
    db.from("photo_reference_slots").select("*").eq("user_id", user).eq("character_key", key),
    db
      .from("photo_reference_state")
      .select("version,last_action,spicy_enabled,adult_confirmed")
      .eq("user_id", user)
      .eq("character_key", key)
      .maybeSingle(),
  ]);
  if (messages.error || slots.error || state.error)
    throw new Error("Reference inventory unavailable");
  const potential = pickReferenceCandidates(key, canonical, messages.data, user);
  const generatedPaths = potential.filter((c) => c.source !== "canonical").map((c) => c.asset);
  const [images, rejected] = generatedPaths.length
    ? await Promise.all([
        db
          .from("generated_images")
          .select("storage_path")
          .eq("user_id", user)
          .eq("conversation_id", conv.id)
          .in("storage_path", generatedPaths),
        db
          .from("photo_reference_rejections")
          .select("asset,canonical_sha256")
          .eq("user_id", user)
          .eq("character_key", key)
          .in("asset", generatedPaths),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (images.error || rejected.error) throw new Error("Reference inventory unavailable");
  const paths = new Set(images.data.map((i) => i.storage_path));
  const candidates: { id: string | null; source: string; asset: string; rejected: boolean }[] =
    potential
      .filter((c) => c.source === "canonical" || paths.has(c.asset))
      .map((c) => ({
        id: c.id ?? null,
        source: c.source,
        asset: c.asset,
        rejected: rejected.data.some(
          (r) => r.asset === c.asset && r.canonical_sha256 === canonical.sha256,
        ),
      }));
  if (offset === 0) {
    const uploads = await db
      .from("photo_reference_uploads")
      .select("id,asset")
      .eq("user_id", user)
      .eq("character_key", key)
      .eq("canonical_sha256", canonical.sha256)
      .order("created_at");
    if (uploads.error) throw new Error("Reference inventory unavailable");
    const uploadRejections = uploads.data.length
      ? await db
          .from("photo_reference_rejections")
          .select("asset,canonical_sha256")
          .eq("user_id", user)
          .eq("character_key", key)
          .in(
            "asset",
            uploads.data.map((u) => u.asset),
          )
      : { data: [], error: null };
    if (uploadRejections.error) throw new Error("Reference inventory unavailable");
    for (const u of uploads.data)
      candidates.splice(1, 0, {
        id: u.id,
        source: "uploaded",
        asset: u.asset,
        rejected: uploadRejections.data.some(
          (r) => r.asset === u.asset && r.canonical_sha256 === canonical.sha256,
        ),
      });
  }
  const compatible = slots.data.filter((s) => s.canonical_sha256 === canonical.sha256);
  const count = compatible.length;
  return {
    available: true,
    character: key,
    conversationId: conv.id,
    hash: canonical.sha256,
    version: state.data?.version ?? 0,
    lastAction: state.data?.last_action ?? null,
    slots: slots.data,
    rejected: rejected.data,
    candidates,
    nextOffset: messages.data.length === 25 ? offset + 25 : null,
    approved: count,
    status:
      count === 3
        ? "Three references approved"
        : count
          ? `${count} reference${count === 1 ? "" : "s"} approved; partial readiness`
          : "Awaiting visual review",
    matureEnabled: !!conv.mature_photography,
    spicyEnabled: state.data?.spicy_enabled ?? false,
    adultConfirmed: state.data?.adult_confirmed ?? false,
    romanticCapable: CHARACTERS[key].romanticCapable,
  };
}
export type ReferenceReview = {
  id: string;
  character: CharacterKey;
  action: "approve" | "reject" | "remove" | "undo";
  role: ReferenceRole | null;
  message: string | null;
  hash: string;
  version: number;
  undo: string | null;
  visualConfirmed: boolean;
  reviewedSha: string | null;
};
export async function reviewReference(db: Client, user: string, input: ReferenceReview) {
  await ownedCharacter(db, user, input.character);
  await registerPrimaryIdentity(db, user, input.character);
  if (input.action === "approve" && !input.visualConfirmed)
    throw new Error("Confirm a clear face, correct identity and suitable framing first");
  const canonical = await currentCanonical(db, user, input.character);
  if (canonical.sha256 !== input.hash)
    throw new Error("Canonical identity changed; refresh references");
  if (input.action === "approve") {
    const asset = await validatedAsset(db, user, input.character, input.message, canonical.sha256);
    const file = input.message
      ? await db.storage.from("tess-photos").download(asset)
      : { data: canonical.blob, error: null };
    if (file.error || !file.data) throw new Error("Reviewed file is missing");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    imageMime(bytes);
    if (
      bytes.length > 20_000_000 ||
      !input.reviewedSha ||
      (await portraitHash(bytes)) !== input.reviewedSha
    )
      throw new Error("Image changed since preview; review it again");
  }
  const r = await db.rpc("photo_reference_command", {
    p_user: user,
    p_id: input.id,
    p_character: input.character,
    p_action: input.action,
    p_role: input.role,
    p_message: input.message,
    p_hash: input.hash,
    p_version: input.version,
    p_undo: input.undo,
    p_reviewed_sha: input.reviewedSha,
  } as never);
  if (r.error) {
    const known = [
      "Canonical identity changed; refresh references",
      "Reference reviews changed; refresh before retrying",
      "Only the latest review can be undone",
      "Previous reference no longer compatible",
      "Undo rejection before approval",
      "Reference action id conflict",
    ];
    const reason =
      r.error.code === "23505"
        ? "This image or the same bytes are already assigned to another slot"
        : (known.find((message) => r.error!.message === message) ??
          "Reference is unavailable or incompatible; refresh reviews");
    throw new Error(`Review could not be saved. ${reason}.`);
  }
  return { saved: true };
}
/** Rechecks provenance at time of use; client cannot submit a path or URL. */
async function validatedAsset(
  db: Client,
  user: string,
  key: CharacterKey,
  message: string | null,
  hash: string,
) {
  await ownedCharacter(db, user, key);
  await registerPrimaryIdentity(db, user, key);
  const r = await db.rpc("photo_reference_candidate", {
    p_user: user,
    p_character: key,
    p_message: message,
    p_hash: hash,
  } as never);
  if (r.error || typeof r.data !== "string")
    throw new Error("Reference is missing, unread or no longer compatible");
  return r.data;
}
export async function referencePreview(
  db: Client,
  user: string,
  key: CharacterKey,
  message: string | null,
) {
  const canonical = await currentCanonical(db, user, key);
  const asset = await validatedAsset(db, user, key, message, canonical.sha256);
  await privateBucket(db);
  const file = message
    ? await db.storage.from("tess-photos").download(asset)
    : { data: canonical.blob, error: null };
  if (file.error || !file.data) throw new Error("Reference file unavailable");
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  if (bytes.length > 20_000_000) throw new Error("Reference file too large");
  const mime = imageMime(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { image: `data:${mime};base64,${btoa(binary)}`, sha256: await portraitHash(bytes) };
}
export function imageMime(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x))
    return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new Error("Unsupported reference image bytes");
}
/** Only provider-side: no signed URL is returned by a browser server function. */
export async function approvedProviderReferences(db: Client, user: string, key: CharacterKey) {
  const canonical = await currentCanonical(db, user, key);
  await ownedCharacter(db, user, key);
  await privateBucket(db);
  const slots = await db
    .from("photo_reference_slots")
    .select("*")
    .eq("user_id", user)
    .eq("character_key", key);
  if (slots.error) throw new Error("Approved references unavailable");
  const ordered = REFERENCE_ROLES.map((role) =>
    slots.data.find((s) => s.role === role && s.canonical_sha256 === canonical.sha256),
  ).filter((s) => !!s);
  if (ordered[0]?.role !== "canonical")
    throw new Error("Approve the current canonical reference first");
  const refs: { url: string; blob: Blob }[] = [];
  for (const slot of ordered) {
    const asset = await validatedAsset(
      db,
      user,
      key,
      slot.source_message_id ?? slot.source_upload_id,
      canonical.sha256,
    );
    if (asset !== slot.asset) throw new Error("Reference identity changed");
    let path = asset,
      blob: Blob;
    if (slot.role === "canonical") {
      blob = canonical.blob;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if ((await portraitHash(bytes)) !== canonical.sha256)
        throw new Error("Canonical integrity failed");
      path = `${user}/reference-library/${key}/${canonical.sha256}.${imageMime(bytes) === "image/png" ? "png" : "jpg"}`;
      const existing = await db.storage.from("tess-photos").download(path);
      if (!existing.error && existing.data) {
        if (
          (await portraitHash(new Uint8Array(await existing.data.arrayBuffer()))) !==
          canonical.sha256
        )
          throw new Error("Private reference integrity failed");
      } else {
        const upload = await db.storage
          .from("tess-photos")
          .upload(path, bytes, { contentType: blob.type, upsert: false });
        if (upload.error) throw new Error("Private canonical copy unavailable; retry preparation");
      }
    } else {
      const file = await db.storage.from("tess-photos").download(path);
      if (file.error || !file.data) throw new Error("Approved reference file missing");
      blob = file.data;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > 20_000_000 || (await portraitHash(bytes)) !== slot.content_sha256)
        throw new Error("Approved reference bytes changed; review again");
      imageMime(bytes);
    }
    const signed = await db.storage
      .from("tess-photos")
      .createSignedUrl(path, PROVIDER_REFERENCE_TTL);
    if (signed.error || !signed.data) throw new Error("Private reference URL unavailable");
    const url = new URL(signed.data.signedUrl);
    if (url.protocol !== "https:") throw new Error("Private reference delivery requires HTTPS");
    refs.push({ url: url.href, blob });
  }
  return refs;
}
export function referenceCast() {
  return Object.values(CHARACTERS).map((c) => ({ key: c.key, name: c.preferredName }));
}

export async function referenceProviderPreference(
  db: Client,
  user: string,
  key: CharacterKey,
  enabled: boolean,
  adult: boolean,
  version: number,
) {
  await ownedCharacter(db, user, key);
  if (CHARACTERS[key].age < 18 || !CHARACTERS[key].romanticCapable)
    throw new Error("Non-nude romantic photography unavailable for this character");
  if (enabled && !(await import("./spicy-image.server")).spicyConfiguration().ready)
    throw new Error("SpicyAPI account configuration is incomplete; keep it disabled");
  if (enabled) {
    const status = await db.from("spicy_photo_jobs").select("action_id").limit(1);
    if(status.error)throw new Error("SpicyAPI migration 0051 required");
    const canonical = await currentCanonical(db, user, key);
    const slot = await db
      .from("photo_reference_slots")
      .select("asset")
      .eq("user_id", user)
      .eq("character_key", key)
      .eq("role", "canonical")
      .eq("canonical_sha256", canonical.sha256)
      .maybeSingle();
    if (slot.error || !slot.data) throw new Error("Approve the current canonical reference first");
  }
  const r = await db.rpc("spicy_photo_preferences" as never, {
    p_user: user,
    p_character: key,
    p_enabled: enabled,
    p_adult: adult,
    p_version: version,
  } as never);
  if (r.error) throw new Error("Reference preferences changed; refresh before retrying");
  return { saved: true };
}
