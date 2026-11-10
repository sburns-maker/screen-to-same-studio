/**
 * Nina's authored opening image uses the same private per-user photo bucket and
 * generated_path message metadata that the chat renderer already understands.
 * It must never initiate a paid provider request or silently substitute a face.
 *
 * Requires the approved src/assets/avatars/nina-opening.jpg to be present.
 */
import openingJpeg from "@/assets/avatars/nina-opening.jpg?inline";
import type { SupabaseClient } from "@supabase/supabase-js";

export const NINA_INTRO_VERSION = "nina_intro_v1";

export function ninaOpeningPath(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid introduction owner");
  return `${userId}/nina-intro-v1.jpg`;
}

function canonicalBytes(): Uint8Array {
  const match = /^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i.exec(openingJpeg);
  if (!match) throw new Error("Approved Nina opening JPEG is missing");
  const raw = atob(match[1]!);
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
