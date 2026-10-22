export const VIDEO_BUCKET = "user-videos";
export const MAX_VIDEO_BYTES = 25_000_000;
export const MAX_VIDEO_SECONDS = 60;
export const VIDEO_MIMES = ["video/mp4", "video/webm"] as const;
export type VideoMime = (typeof VIDEO_MIMES)[number];
export type UserVideo = { path: string; mime: VideoMime; bytes: number; duration_seconds: number };
export function videoFileError(
  file: { type: string; size: number },
  duration?: number,
): string | null {
  if (!(VIDEO_MIMES as readonly string[]).includes(file.type))
    return "Choose an MP4 or WebM video. MOV/HEVC files may need conversion to MP4 (H.264/AAC).";
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) return "Video must be no larger than 25 MB.";
  if (
    duration !== undefined &&
    (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS)
  )
    return "Choose a playable video up to 60 seconds long.";
  return null;
}
/** Container signature check, not a codec decoder, duration proof or malware scan. */
export function videoSignatureMatches(bytes: Uint8Array, mime: string) {
  if (mime === "video/webm")
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  if (mime !== "video/mp4" || bytes.length < 16) return false;
  if (String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp") return false;
  const brands = String.fromCharCode(...bytes.subarray(8, Math.min(bytes.length, 80)));
  return /isom|iso[2-9]|mp4[12]|avc1|M4V |dash/.test(brands) && !/^qt {2}/.test(brands);
}
export function userVideoMetadata(metadata: unknown): UserVideo | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as { user_video?: unknown }).user_video;
  if (!v || typeof v !== "object") return null;
  const x = v as Partial<UserVideo>;
  if (
    typeof x.path !== "string" ||
    !/^[-a-f0-9]{36}\/[-a-f0-9]{36}\.(mp4|webm)$/.test(x.path) ||
    typeof x.mime !== "string" ||
    typeof x.bytes !== "number" ||
    typeof x.duration_seconds !== "number" ||
    videoFileError({ type: x.mime, size: x.bytes }, x.duration_seconds)
  )
    return null;
  return x as UserVideo;
}
export function videoTranscriptText(body: string, metadata: unknown) {
  if (!userVideoMetadata(metadata)) return body;
  return `${body}${body ? " " : ""}[User sent a video attachment. Its video and audio have NOT been analyzed. Respond only to their caption or ask what they would like to share; never claim to have watched, heard, or identified content in this clip.]`;
}
export async function browserVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.preload = "metadata";
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Video metadata could not be read; try an MP4 (H.264/AAC).")),
        10000,
      );
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        const error = videoFileError(file, video.duration);
        if (error) reject(new Error(error));
        else resolve(video.duration);
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("This browser cannot play the selected video. Try an MP4 (H.264/AAC)."));
      };
      video.src = url;
    });
  } finally {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
