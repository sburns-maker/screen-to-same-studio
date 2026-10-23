import { useEffect, useRef, useState } from "react";
import { PhotoViewer } from "@/components/PhotoViewer";
import { ConversationMedia } from "@/components/ConversationMedia";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { conversationMedia, type MediaItem } from "@/lib/media";
import { resolveMedia } from "@/lib/media-url";
import { conversationQuery } from "@/lib/tess-queries";
import { characterFor } from "@/lib/characters";
export const Route = createFileRoute("/_authenticated/photos/$conversationId")({
  head: () => ({ meta: [
    { title: "Shared Media \u00b7 AI Town" },
    { name: "description", content: "Your private conversation photos and videos in AI Town." },
    { property: "og:title", content: "Shared Media \u00b7 AI Town" },
    { property: "og:description", content: "Your private conversation photos and videos in AI Town." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SharedMedia,
});
function SharedMedia() {
  const { conversationId } = Route.useParams();
  const conv = useQuery(conversationQuery(conversationId));
  const q = useInfiniteQuery({
    queryKey: ["media-gallery", conversationId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const r = await supabase
        .from("messages")
        .select("id,sender,metadata,created_at,visible_at")
        .eq("conversation_id", conversationId)
        .lte("visible_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(pageParam, pageParam + 59);
      if (r.error) throw new Error("Media gallery unavailable");
      return r.data;
    },
    getNextPageParam: (last, pages) => (last.length === 60 ? pages.length * 60 : undefined),
  });
  const messages = [...new Map((q.data?.pages.flat() ?? []).map((m) => [m.id, m])).values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const items = conversationMedia(messages);
  const character = characterFor((conv.data?.character as { key?: string } | null)?.key).key;
  return (
    <>
      <ScreenHeader
        title="Shared media"
        backTo="/chat/$conversationId"
        backParams={{ conversationId }}
      />
      <Screen>
        <ConversationMedia messages={messages} character={character}>
          {q.isLoading && <p role="status">Loading media…</p>}
          {q.error && (
            <button onClick={() => void q.refetch()}>Could not load media · Retry</button>
          )}
          {!q.isLoading && !items.length && (
            <p className="text-sm text-muted-foreground">
              No photos or videos in this page of the conversation.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
          {q.hasNextPage && (
            <button
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
              className="my-4 min-h-12 w-full rounded-full border"
            >
              {q.isFetchingNextPage ? "Loading…" : "Load older media"}
            </button>
          )}
        </ConversationMedia>
      </Screen>
    </>
  );
}
function MediaTile({ item }: { item: MediaItem }) {
  const tile = useRef<HTMLDivElement>(null),
    [near, setNear] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    if (tile.current) observer.observe(tile.current);
    return () => observer.disconnect();
  }, []);
  const q = useQuery({
    queryKey: ["gallery-original", item.id],
    queryFn: () => resolveMedia(item),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: near,
  });
  if (!near) return <div ref={tile} className="aspect-square animate-pulse rounded-xl bg-muted" />;
  if (!q.data)
    return (
      <button className="aspect-square rounded-xl border text-xs" onClick={() => void q.refetch()}>
        {q.error ? "Unavailable · Retry" : "Loading…"}
      </button>
    );
  return (
    <PhotoViewer
      src={q.data}
      mediaId={item.id}
      kind={item.kind}
      alt={item.kind === "video" ? "Shared video" : "Shared photo"}
    >
      {item.kind === "video" ? (
        <div className="relative">
          <video
            src={q.data}
            preload="metadata"
            playsInline
            className="aspect-square w-full rounded-xl object-cover"
          />
          <span className="absolute inset-0 grid place-items-center text-white">▶</span>
        </div>
      ) : (
        <img
          src={q.data}
          alt="Shared photo"
          loading="lazy"
          className="aspect-square w-full rounded-xl object-cover"
        />
      )}
    </PhotoViewer>
  );
}
