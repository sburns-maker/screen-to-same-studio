import { PhotoViewer } from "./PhotoViewer";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VIDEO_BUCKET, type UserVideo } from "@/lib/user-video";
export function VideoAttachment({ video, mediaId }: { video: UserVideo; mediaId?: string }) {
  const [failed, setFailed] = useState(false);
  const q = useQuery({
    queryKey: ["video-url", video.path],
    staleTime: 45 * 60_000,
    retry: false,
    queryFn: async () => {
      const r = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.path, 3600);
      if (r.error || !r.data) throw new Error("Video unavailable");
      return r.data.signedUrl;
    },
  });
  if (q.isError || failed)
    return (
      <div role="status" className="w-64 rounded-2xl border bg-surface p-4 text-sm">
        Video could not be played. Try MP4 with H.264/AAC for broader device support.
        <button
          type="button"
          className="mt-2 block underline"
          onClick={() => {
            setFailed(false);
            void q.refetch();
          }}
        >
          Reload video link
        </button>
      </div>
    );
  if (!q.data)
    return (
      <div role="status" className="w-64 rounded-2xl border bg-surface p-4 text-sm">
        Loading private video…
      </div>
    );
  return (
    <div className="w-64 max-w-full overflow-hidden rounded-2xl bg-surface">
      <PhotoViewer src={q.data} alt="Video attachment" kind="video" mediaId={mediaId}>
        <div className="relative">
          <video
            aria-label="Video you sent"
            src={q.data}
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            className="max-h-96 w-full"
          />
          <span
            className="absolute inset-0 grid place-items-center text-3xl text-white"
            aria-hidden="true"
          >
            ▶
          </span>
        </div>
      </PhotoViewer>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        {Math.round(video.duration_seconds)} sec · {(video.bytes / 1_000_000).toFixed(1)} MB ·
        Contents not analyzed
      </p>
    </div>
  );
}
