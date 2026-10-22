import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CHARACTERS, type CharacterKey } from "./characters";
import { canonicalProfile } from "./canonical-profile.server";
type Client = SupabaseClient<Database>;
export async function expansionAvailable(db: Client) {
  const r = await db.rpc("world_expansion_status", {});
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("World expansion status unavailable");
  return r.data === 15;
}
export async function registerPrimaryIdentity(db: Client, user: string, key: CharacterKey) {
  const anchor = await canonicalProfile(key);
  const r = await db.from("visual_identity_registry").upsert(
    {
      user_id: user,
      entity_key: key,
      canonical_asset: anchor.asset,
      canonical_sha256: anchor.sha256,
      approval: "approved",
    },
    { onConflict: "user_id,entity_key", ignoreDuplicates: true },
  );
  if (r.error) throw new Error("Identity registration unavailable");
  const check = await db
    .from("visual_identity_registry")
    .select("*")
    .eq("user_id", user)
    .eq("entity_key", key)
    .single();
  if (check.error || !check.data) throw new Error("Identity registration unavailable");
  const { currentCanonical } = await import("./profile-media.server");
  const approved = await currentCanonical(db, user, key);
  return {
    ...approved,
    activeMessageId: check.data.active_message_id,
    activeReason: check.data.active_reason,
  };
}
export async function activePortraits(db: Client, user: string) {
  if (!(await expansionAvailable(db))) return {} as Record<string, string>;
  const rows = await db
    .from("visual_identity_registry")
    .select("*")
    .eq("user_id", user)
    .eq("approval", "approved");
  if (rows.error) throw new Error("Profile portraits unavailable");
  const result: Record<string, string> = {};
  for (const r of rows.data ?? []) {
    if (!Object.hasOwn(CHARACTERS, r.entity_key)) continue;
    if (
      r.active_storage_path?.startsWith(`${user}/profile/${r.entity_key}/`) &&
      !r.active_storage_path.includes("..")
    ) {
      const signed = await db.storage
        .from("tess-photos")
        .createSignedUrl(r.active_storage_path, 1200);
      if (signed.data) result[r.entity_key] = signed.data.signedUrl;
      continue;
    }
    if (!r.active_message_id) continue;
    const m = await db
      .from("messages")
      .select("*")
      .eq("id", r.active_message_id)
      .eq("user_id", user)
      .lte("visible_at", new Date().toISOString())
      .maybeSingle();
    const md = m.data?.metadata as {
      generated_path?: string;
      photo_identity?: { canonicalSha256?: string };
    } | null;
    if (
      !md?.generated_path?.startsWith(user + "/") ||
      md.generated_path.includes("..") ||
      md.photo_identity?.canonicalSha256 !== r.canonical_sha256
    )
      continue;
    const url = await db.storage.from("tess-photos").createSignedUrl(md.generated_path, 1200);
    if (!url.error && url.data) result[r.entity_key] = url.data.signedUrl;
  }
  return result;
}
/** Only the speaking character's display update; never any other character's photo/private activity. */
export async function profileDisplayContext(db: Client, user: string, key: CharacterKey) {
  const r = await db
    .from("visual_identity_registry")
    .select("*")
    .eq("user_id", user)
    .eq("entity_key", key)
    .maybeSingle();
  if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return null;
  if (r.error) throw new Error("Current portrait context unavailable");
  if (!r.data?.active_reason || r.data.active_storage_path) return null; // User display edits are not fictional character actions.
  return `Your own profile picture ${r.data.active_message_id ? "now uses a recent delivered casual portrait" : "uses the original portrait again"}. Recorded reason: ${JSON.stringify(r.data.active_reason)}. Your recognizable appearance is unchanged. This says nothing about anyone else’s profile or private conversations.`;
}
