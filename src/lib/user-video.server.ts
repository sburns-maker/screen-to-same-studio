import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { UserVideoUpload } from "@/integrations/supabase/video-types";
import { VIDEO_BUCKET, videoFileError, videoSignatureMatches } from "./user-video";
type Client = SupabaseClient<Database>;
export type VideoRequest = {
  id: string;
  conversationId: string;
  mime: string;
  bytes: number;
  duration: number;
  caption: string;
};
export async function prepareVideo(db: Client, user: string, input: VideoRequest) {
  const invalid = videoFileError({ type: input.mime, size: input.bytes }, input.duration);
  if (invalid) throw new Error(invalid);
  const bucket = await db.storage.getBucket(VIDEO_BUCKET);
  if (
    bucket.error ||
    !bucket.data ||
    bucket.data.public ||
    bucket.data.file_size_limit !== 25_000_000
  )
    throw new Error("Private video storage needs reviewed migration 0013 before uploading.");
  const reserved = await db.rpc("reserve_user_video", {
    p_user: user,
    p_id: input.id,
    p_conversation: input.conversationId,
    p_mime: input.mime,
    p_bytes: input.bytes,
    p_duration: input.duration,
    p_caption: input.caption,
  });
  if (reserved.error)
    throw new Error(
      ["PGRST202", "42883"].includes(reserved.error.code)
        ? "Video uploads need reviewed migration 0013."
        : "Video upload could not be reserved. Check conversation access and the ten-upload daily limit.",
    );
  const row = reserved.data as unknown as UserVideoUpload;
  if (row.status === "sent") return { id: row.id, path: row.storage_path, token: null, sent: true };
  if (Date.now() - Date.parse(row.created_at) > 86_400_000)
    throw new Error("This upload reservation expired. Select the video again.");
  const signed = await db.storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(row.storage_path, { upsert: false });
  if (signed.error || !signed.data)
    throw new Error("Video upload authorization unavailable. No message was sent.");
  return { id: row.id, path: row.storage_path, token: signed.data.token, sent: false };
}
export async function finishVideo(db: Client, user: string, id: string) {
  const found = await db
    .from("user_video_uploads")
    .select("*")
    .eq("id", id)
    .eq("user_id", user)
    .maybeSingle();
  if (found.error || !found.data) throw new Error("Owned video upload not found.");
  const row = found.data;
  if (row.status === "sent")
    return { id: row.id, conversationId: row.conversation_id, newlySent: false };
  if (Date.now() - Date.parse(row.created_at) > 86_400_000)
    throw new Error("This upload reservation expired. No new message was sent.");
  if (row.storage_path !== `${user}/${row.id}.${row.mime === "video/mp4" ? "mp4" : "webm"}`)
    throw new Error("Invalid video storage reference.");
  const downloaded = await db.storage
    .from(VIDEO_BUCKET)
    .download(row.storage_path, {}, { signal: AbortSignal.timeout(45_000) });
  if (downloaded.error || !downloaded.data)
    throw new Error(
      "Upload is not available yet. Retry confirmation; the video will not be uploaded again.",
    );
  const blob = downloaded.data;
  if (
    blob.size !== row.bytes ||
    videoFileError({ type: row.mime, size: blob.size }) ||
    !videoSignatureMatches(new Uint8Array(await blob.slice(0, 80).arrayBuffer()), row.mime)
  )
    throw new Error(
      "Video validation failed. Choose a valid MP4 or WebM file; no message was sent.",
    );
  const result = await db.rpc("deliver_user_video", { p_user: user, p_id: id });
  if (result.error)
    throw new Error(
      "Video delivery could not be confirmed. Retry confirmation before sending again.",
    );
  const sent = result.data as { newly_sent?: boolean };
  return { id: row.id, conversationId: row.conversation_id, newlySent: sent.newly_sent === true };
}
