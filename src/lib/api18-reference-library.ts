import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { currentCanonical } from "./profile-media.server";
import { CHARACTERS, type CharacterKey } from "./characters";

export const REFERENCE_ROLES = ["canonical", "half_body", "alternate_angle"] as const;
export type ReferenceRole = typeof REFERENCE_ROLES[number];
export type ReferenceCandidate = {
  character: CharacterKey;
  role: ReferenceRole;
  source: "canonical" | "delivered_generated";
  asset: string;
  canonicalSha256: string;
  generatedPath?: string;
  status: "approved" | "needs_visual_review";
  reason?: string;
};
type GeneratedPhoto = {
  created_at: string;
  visible_at?: string | null;
  metadata: unknown;
};
type PhotoMeta = {
  generated_path?: unknown;
  photo_identity?: { canonicalSha256?: unknown; validationStatus?: unknown };
  photo_visual?: { character?: unknown; style?: { crop_type?: unknown; camera_angle?: unknown } };
  photo_type?: unknown;
};
export function pickReferenceCandidates(
  character: CharacterKey,
  canonical: { asset: string; sha256: string },
  messages: readonly GeneratedPhoto[],
  ownerId: string,
): ReferenceCandidate[] {
  if (!Object.hasOwn(CHARACTERS, character) || !/^[0-9a-f-]{36}$/i.test(ownerId)) return [];
  const out: ReferenceCandidate[] = [{
    character, role: "canonical", source: "canonical", asset: canonical.asset,
    canonicalSha256: canonical.sha256, status: "approved",
  }];
  const seen = new Set<string>();
  const potential = [...messages].sort((a,b) => b.created_at.localeCompare(a.created_at));
  for (const m of potential) {
    if (out.length === 3) break;
    if (!m.visible_at || Date.parse(m.visible_at) > Date.now()) continue;
    const md = m.metadata as PhotoMeta | null;
    if (!md || typeof md.generated_path !== "string") continue;
    if (!md.generated_path.startsWith(ownerId + "/") || md.generated_path.includes("..") || seen.has(md.generated_path)) continue;
    if (md.photo_identity?.canonicalSha256 !== canonical.sha256 ||
        md.photo_identity?.validationStatus !== "screen_passed" ||
        md.photo_visual?.character !== character) continue;
    if (!["casual_selfie", "personal_selfie", "intimate_selfie", "tess_candid", "mature_romantic"].includes(String(md.photo_type))) continue;
    const role = out.length === 1 ? "half_body" : "alternate_angle";
    out.push({
      character, role, source: "delivered_generated", asset: md.generated_path,
      generatedPath: md.generated_path, canonicalSha256: canonical.sha256,
      status: "needs_visual_review",
      reason: "Generated photo must be reviewed for clear face, framing, and character identity before activation",
    });
    seen.add(md.generated_path);
  }
  return out;
}
export function referenceLibrarySummary(candidates: readonly ReferenceCandidate[]) {
  return {
    total: candidates.length,
    approved: candidates.filter(c=>c.status==="approved").length,
    pendingReview: candidates.filter(c=>c.status==="needs_visual_review").length,
    ready: candidates.length===3 && candidates.every(c=>c.status==="approved"),
  };
}

/** Read-only inventory of the user's own delivered generated photos. No copies or public URLs. */
export async function inventoryExistingCharacterPhotos(
  db: SupabaseClient<Database>, userId: string, character: CharacterKey,
): Promise<ReferenceCandidate[]> {
  const characterRow = await db.from("characters").select("id").eq("key", character).single();
  if (characterRow.error || !characterRow.data) throw new Error("reference_character_missing");
  const conversation = await db.from("conversations").select("id")
    .eq("user_id", userId).eq("character_id", characterRow.data.id).single();
  if (conversation.error || !conversation.data) throw new Error("reference_conversation_missing");
  const { data, error } = await db.from("messages").select("created_at,visible_at,metadata")
    .eq("user_id", userId).eq("conversation_id", conversation.data.id)
    .eq("sender", "tess").lte("visible_at", new Date().toISOString())
    .order("created_at", {ascending:false}).limit(250);
  if (error) throw new Error("reference_history_unavailable");
  const canonical = await currentCanonical(db, userId, character);
  return pickReferenceCandidates(character, canonical, data ?? [], userId);
}
