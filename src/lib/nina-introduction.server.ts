/**
 * Nina's authored opening image uses the same private per-user photo bucket and
 * generated_path message metadata that the chat renderer already understands.
 * It must never initiate a paid provider request or silently substitute a face.
 *
 * Requires the approved src/assets/avatars/nina-opening.jpg to be present.
 */
import openingJpeg from "@/assets/avatars/nina-opening.jpg?inline";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ninaLegacyRepairIds } from "./nina-introduction-repair";

export const NINA_INTRO_VERSION = "nina_intro_v1";

export function ninaOpeningPath(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid introduction owner");
  return `${userId}/nina-intro-v1.jpg`;
}

function canonicalBytes(): Uint8Array {
  const match = /^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i.exec(openingJpeg);
  if (!match) throw new Error("Approved Nina opening JPEG is missing");
  const encoded = match[1];
  if (!encoded) throw new Error("Approved Nina opening JPEG is missing");
  const raw = atob(encoded);
  const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
  if (bytes.length < 512 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("Nina opening image is not a valid JPEG");
  return bytes;
}

/** Upload first; only then may seedConversation persist the photo message. */
export async function uploadNinaOpening(db: SupabaseClient, userId: string): Promise<string> {
  const path = ninaOpeningPath(userId);
  const storage = db.storage.from("tess-photos");
  const approved = canonicalBytes();
  const result = await storage.upload(path, approved, { contentType: "image/jpeg", upsert: false });
  if (result.error) {
    // Retries must not overwrite a delivered photo; the existing owned path
    // must be independently readable before it can count as uploaded.
    const existing = await storage.download(path);
    if (existing.error || !existing.data) throw new Error("Nina opening photo storage unavailable");
    const prior = new Uint8Array(await existing.data.arrayBuffer());
    // Never trust an unexpected file already stored under this deterministic key.
    const equal = prior.length === approved.length && prior.every((byte, i) => byte === approved[i]);
    if (!equal) throw new Error("Existing Nina opening file is not the approved canonical image");
  }
  return path;
}

export function ninaIntroMessageMetadata(path: string, photoId: string) {
  return {
    generated_path: path,
    generated_image_id: photoId,
    photo_type: "personal_selfie",
    photo_source: NINA_INTRO_VERSION,
  };
}

/**
 * Repair an unreplied Nina conversation beginning with the legacy trivia
 * opener, including unpaid autonomous follow-ups. This happens when created
 * before the Nina introduction code became active. It is NOT a general history
 * rewrite, and must never modify a conversation the user has replied to.
 */
export async function repairLegacyNinaIntroduction(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<"repaired" | "unchanged"> {
  const { NINA_PROFILE } = await import("./nina-cast");
  const { data: rows, error: listError } = await db.from("messages")
    .select("id,sender,body,metadata")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (listError) throw new Error("Nina introduction inspection failed");
  const expectedIds = ninaLegacyRepairIds(rows ?? []);
  const first = rows?.[0];
  if (!expectedIds || !first) return "unchanged";
  const existingMd = first.metadata as Record<string, unknown> | null;

  const path = await uploadNinaOpening(db, userId);
  const photoId = crypto.randomUUID();
  const metadata = { ...(existingMd ?? {}), ...ninaIntroMessageMetadata(path, photoId) };
  // Confirm ownership through the authenticated client before privileged work.
  const { data: owned, error: ownerError } = await db.from("conversations")
    .select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
  if (ownerError || !owned) return "unchanged";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: repaired, error: repairError } = await (supabaseAdmin as unknown as SupabaseClient)
    .rpc("repair_nina_legacy_intro", {
      p_user: userId, p_conversation: conversationId, p_expected_ids: expectedIds,
      p_body: NINA_PROFILE.openingText, p_metadata: metadata, p_photo: photoId,
    });
  if (repairError) throw new Error("Nina opening message repair failed");
  return repaired === true ? "repaired" : "unchanged";
}
