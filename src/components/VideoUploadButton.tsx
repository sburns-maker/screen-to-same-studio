import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { prepareUserVideo, finishUserVideo, pendingUserVideos } from "@/lib/user-video.functions";
import { VIDEO_BUCKET, browserVideoDuration, videoFileError } from "@/lib/user-video";
export function VideoUploadButton({
  conversationId,
  caption,
  disabled,
  onSent,
}: {
  conversationId: string;
  caption: string;
  disabled: boolean;
  onSent: (caption: string, newlySent: boolean) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null),
    gate = useRef(false),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [pendingUpload, setPendingUpload] = useState<{ id: string; caption: string } | null>(null);
  const prepare = useServerFn(prepareUserVideo),
    finish = useServerFn(finishUserVideo),
    list = useServerFn(pendingUserVideos),
    qc = useQueryClient();
  const pending = useQuery({
    queryKey: ["pending-videos", conversationId],
    queryFn: () => list({ data: { conversationId } }),
    retry: false,
  });
  async function confirm(id: string, body: string) {
    const r = await finish({ data: { id } });
    setPendingUpload(null);
    await onSent(body, r.newlySent);
    await qc.invalidateQueries({ queryKey: ["pending-videos", conversationId] });
    toast.success("Video sent. Its contents are not automatically analyzed.");
  }
  async function send(file: File) {
    if (gate.current) return;
    const invalid = videoFileError(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    gate.current = true;
    setBusy(true);
    const body = caption;
    try {
      const duration = await browserVideoDuration(file);
      const r = await prepare({
        data: {
          id: crypto.randomUUID(),
          conversationId,
          mime: file.type as "video/mp4" | "video/webm",
          bytes: file.size,
          duration,
          caption: body,
        },
      });
      setPendingUpload({ id: r.id, caption: body });
      if (!r.sent && r.token) {
        const upload = await supabase.storage
          .from(VIDEO_BUCKET)
          .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type });
        if (upload.error)
          throw new Error(
            "Upload could not be confirmed. Try confirmation before uploading again.",
          );
      }
      await confirm(r.id, body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Video could not be sent.");
      await qc.invalidateQueries({ queryKey: ["pending-videos", conversationId] });
      setOpen(true);
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  async function retry(id: string, body: string) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    try {
      await confirm(id, body);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />
      <div className="relative mb-0.5">
        <button
          type="button"
          disabled={disabled || busy}
          aria-label="Send a video"
          onClick={() => setOpen(!open)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
        >
          <Video className={busy ? "h-5 w-5 animate-pulse" : "h-5 w-5"} />
        </button>
        {open && (
          <div className="absolute bottom-12 left-[-40px] z-40 w-72 max-w-[85vw] rounded-2xl border bg-background p-4 shadow-lg">
            <p className="text-sm font-medium">Send a short video</p>
            <p className="mt-2 text-xs text-muted-foreground">
              MP4 or WebM · Up to 25 MB / 60 seconds. Your current message becomes its caption.
              Characters can read the caption; clips are not watched or transcribed automatically.
            </p>
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => input.current?.click()}
              className="mt-3 w-full rounded-full bg-primary p-2 text-sm text-primary-foreground disabled:opacity-40"
            >
              {busy ? "Sending…" : "Choose video"}
            </button>
            {(pending.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy || disabled}
                onClick={() => void retry(p.id, p.caption)}
                className="mt-2 w-full rounded-xl border p-2 text-left text-xs"
              >
                Confirm pending upload · {new Date(p.created_at).toLocaleTimeString()}
                <span className="block truncate text-muted-foreground">
                  {p.caption || "Video without caption"}
                </span>
              </button>
            ))}
            {pendingUpload && !pending.data?.some((p) => p.id === pendingUpload.id) && (
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => void retry(pendingUpload.id, pendingUpload.caption)}
                className="mt-2 text-xs underline"
              >
                Retry delivery confirmation
              </button>
            )}
            {pending.error && (
              <p role="alert" className="mt-2 text-xs">
                {pending.error.message}
              </p>
            )}
            <button type="button" onClick={() => setOpen(false)} className="mt-3 text-xs underline">
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}
