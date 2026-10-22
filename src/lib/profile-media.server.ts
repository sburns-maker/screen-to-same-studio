import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CharacterKey } from "./characters";
import { canonicalProfile, jpegDimensions } from "./canonical-profile.server";
type Client = SupabaseClient<Database>;
export async function mediaProfilesAvailable(db: Client) {
  const r = await db.rpc("media_profile_status", {});
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Profile service unavailable");
  return r.data === 16;
}
export function decodePortrait(encoded: string) {
  if (encoded.length > 5_600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error("Invalid portrait bytes");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return { bytes, ...jpegDimensions(bytes) };
}
export async function portraitHash(bytes: Uint8Array) {
  const sha = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(sha), (n) => n.toString(16).padStart(2, "0")).join("");
}
/** Approved per-user source only. Missing/invalid approved bytes fail closed, never silently substitute another face. */
export async function currentCanonical(db: Client, user: string, key: CharacterKey) {
  const row = await db
    .from("visual_identity_registry")
    .select("*")
    .eq("user_id", user)
    .eq("entity_key", key)
    .maybeSingle();
  if (row.error && !["42P01", "PGRST205"].includes(row.error.code))
    throw new Error("Identity registry unavailable");
  const r = row.data;
  if (!r) return canonicalProfile(key);
  if (r.approval !== "approved") throw new Error("Canonical identity is not approved");
  const original = await canonicalProfile(key);
  if (r.canonical_asset === original.asset) {
    if (r.canonical_sha256 !== original.sha256)
      throw new Error("Canonical reference integrity check failed");
    return original;
  }
  if (
    r.approval !== "approved" ||
    !r.canonical_asset?.startsWith(`${user}/profile/${key}/`) ||
    r.canonical_asset.includes("..")
  )
    throw new Error("Approved canonical reference unavailable");
  const file = await db.storage.from("tess-photos").download(r.canonical_asset);
  if (file.error || !file.data) throw new Error("Approved canonical reference missing");
  const bytes = new Uint8Array(await file.data.arrayBuffer()),
    dimensions = jpegDimensions(bytes),
    hash = await portraitHash(bytes);
  if (hash !== r.canonical_sha256) throw new Error("Canonical reference integrity check failed");
  return {
    blob: new Blob([bytes], { type: "image/jpeg" }),
    asset: r.canonical_asset,
    sha256: hash,
    ...dimensions,
  };
}
export async function saveProfileMedia(
  db: Client,
  user: string,
  data: {
    key: CharacterKey;
    avatar: string;
    reference?: string | undefined;
    canonicalApproved: boolean;
    sourceMessageId?: string | undefined;
  },
) {
  if (!(await mediaProfilesAvailable(db)))
    throw new Error("Profile media requires reviewed migration 0016");
  const ch = await db.from("characters").select("id").eq("key", data.key).single();
  const conv = ch.data
    ? await db
        .from("conversations")
        .select("id")
        .eq("user_id", user)
        .eq("character_id", ch.data.id)
        .single()
    : null;
  if (!conv?.data) throw new Error("Owned character required");
  if (data.sourceMessageId) {
    const m = await db
      .from("messages")
      .select("*")
      .eq("id", data.sourceMessageId)
      .eq("conversation_id", conv.data.id)
      .eq("user_id", user)
      .eq("sender", "tess")
      .lte("visible_at", new Date().toISOString())
      .maybeSingle();
    const md = m.data?.metadata as { photo?: string; generated_path?: string } | null;
    if (!md?.photo && !md?.generated_path)
      throw new Error("Choose a received photo from this character");
  }
  const bucket = await db.storage.getBucket("tess-photos");
  if (bucket.error || !bucket.data || bucket.data.public)
    throw new Error("Private photo storage is required");
  const avatar = decodePortrait(data.avatar);
  if (data.reference && !data.canonicalApproved)
    throw new Error("Explicit canonical approval required");
  const reference = data.reference ? decodePortrait(data.reference) : null;
  const { registerPrimaryIdentity } = await import("./visual-profiles.server");
  await registerPrimaryIdentity(db, user, data.key);
  const root = `${user}/profile/${data.key}/${crypto.randomUUID()}`;
  {
    const avatarPath = `${root}-avatar.jpg`;
    const a = await db.storage
      .from("tess-photos")
      .upload(avatarPath, avatar.bytes, { contentType: "image/jpeg", upsert: false });
    if (a.error) throw new Error("Avatar upload failed");
    const refPath = reference ? `${root}-identity.jpg` : null;
    if (reference && refPath) {
      const r = await db.storage
        .from("tess-photos")
        .upload(refPath, reference.bytes, { contentType: "image/jpeg", upsert: false });
      if (r.error) throw new Error("Identity upload failed");
    }
    const r = await db.rpc("set_profile_media", {
      p_user: user,
      p_key: data.key,
      p_avatar: avatarPath,
      p_canonical: refPath,
      p_sha: reference ? await portraitHash(reference.bytes) : null,
      p_source: data.sourceMessageId ?? null,
    });
    if (r.error)
      throw new Error(
        "Profile update rejected. Identity references cannot be shared between characters.",
      );
    return { updated: true };
  } // Uncertain uploads stay immutable: never delete a possibly committed live profile.
}
