import { PHOTO_SRC } from "./tess-photo-images";
import { userVideoMetadata, VIDEO_BUCKET } from "./user-video";
export type MediaItem = {
  id: string;
  kind: "image" | "video";
  src?: string;
  bucket?: string;
  path?: string;
  at?: string;
  sender?: string;
  mime?: string;
  bytes?: number;
  duration?: number;
};
export function conversationMedia(
  messages: {
    id: string;
    metadata: unknown;
    visible_at: string;
    created_at: string;
    sender: string;
  }[],
  now = Date.now(),
): MediaItem[] {
  return messages
    .filter((m) => Date.parse(m.visible_at) <= now)
    .flatMap<MediaItem>((m) => {
      const common = { id: m.id, at: m.created_at, sender: m.sender };
      const video = userVideoMetadata(m.metadata);
      if (video)
        return [
          {
            ...common,
            kind: "video" as const,
            bucket: VIDEO_BUCKET,
            path: video.path,
            mime: video.mime,
            bytes: video.bytes,
            duration: video.duration_seconds,
          },
        ];
      const md = m.metadata as {
        photo?: string;
        generated_path?: string;
        user_photo?: string;
      } | null;
      const path = md?.generated_path || md?.user_photo;
      if (path) return [{ ...common, kind: "image" as const, bucket: "tess-photos", path }];
      const src = md?.photo && PHOTO_SRC[md.photo];
      return src ? [{ ...common, kind: "image" as const, src }] : [];
    });
}
export function mediaFilename(item: MediaItem, mime: string) {
  const ext = (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
      "video/mp4": "mp4",
      "video/webm": "webm",
    } as Record<string, string>
  )[mime];
  if (!ext) throw new Error("Unsupported media format");
  return `shared-${item.id.replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "media"}.${ext}`;
}
export async function mediaFile(item: MediaItem, resolve: () => Promise<string>) {
  const r = await fetch(await resolve(), { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("Media unavailable. Try reopening it.");
  const blob = await r.blob();
  const mime = blob.type.split(";")[0] || item.mime || "";
  if (blob.size > 30_000_000) throw new Error("Media exceeds the download limit");
  return new File([blob], mediaFilename(item, mime), { type: mime });
}
export async function downloadMedia(file: File) {
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (o: unknown) => Promise<{
        createWritable(): Promise<{ write(f: Blob): Promise<void>; close(): Promise<void> }>;
      }>;
    }
  ).showSaveFilePicker;
  // Caller may use this helper with an already prepared file, preserving the save gesture.
  if (picker && navigator.userActivation?.isActive) {
    const handle = await picker.call(window, { suggestedName: file.name });
    const stream = await handle.createWritable();
    await stream.write(file);
    await stream.close();
    return "Saved to device";
  }
  const url = URL.createObjectURL(file),
    a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "Download started. Check your device’s Downloads.";
}
