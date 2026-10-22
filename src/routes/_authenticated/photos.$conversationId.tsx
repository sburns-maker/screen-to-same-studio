import { PhotoViewer } from "@/components/PhotoViewer";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { messagesQuery } from "@/lib/tess-queries";
import { PHOTO_SRC } from "@/lib/tess-photo-images";

export const Route = createFileRoute("/_authenticated/photos/$conversationId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Shared photos — Chats" },
      { name: "description", content: "Photos exchanged in this conversation." },
      { property: "og:title", content: "Shared photos — Chats" },
      { property: "og:description", content: "Photos exchanged in this conversation." },
    ],
  }),
  component: SharedPhotos,
});

function SharedPhotos() {
  const { conversationId } = Route.useParams();
  const msgs = useQuery(messagesQuery(conversationId));
  const now = Date.now();
  const photos = (msgs.data ?? []).filter((m) => {
    if (new Date(m.visible_at).getTime() > now) return false;
    const md = m.metadata as { photo?: string; generated_path?: string } | null;
    return !!(md?.photo || md?.generated_path);
  });

  return (
    <>
      <ScreenHeader title="Shared photos" backTo="/chat/$conversationId" backParams={{ conversationId }} />
      <Screen>
        {photos.length === 0 && <p className="text-sm text-muted-foreground">No photos yet.</p>}
        <div className="grid grid-cols-2 gap-2">
          {photos.map((m) => {
            const md = m.metadata as { photo?: string; generated_path?: string } | null;
            const src = md?.photo ? PHOTO_SRC[md.photo] : undefined;
            if (src) return <PhotoViewer key={m.id} src={src} alt="Shared photo"><img src={src} alt="Shared photo" loading="lazy" width={640} height={853} className="w-full rounded-xl object-cover" /></PhotoViewer>;
            if (md?.generated_path) return <GenImg key={m.id} path={md.generated_path} />;
            return null;
          })}
        </div>
      </Screen>
    </>
  );
}

function GenImg({ path }: { path: string }) {
  const q = useQuery({
    queryKey: ["photo-url", path],
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("tess-photos").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const [failed, setFailed] = useState(false);
  if (failed || q.isError || !q.data) return null;
  return <PhotoViewer src={q.data} alt="Shared photo"><img src={q.data} alt="Shared photo" loading="lazy" width={1024} height={1536} onError={() => setFailed(true)} className="w-full rounded-xl object-cover" /></PhotoViewer>;
}
