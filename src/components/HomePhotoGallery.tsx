import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadHomePhotoGallery } from "@/lib/home-photo-gallery.functions";

export function HomePhotoGallery({ homeKey }: { homeKey: string }) {
  const load = useServerFn(loadHomePhotoGallery);
  const gallery = useQuery({
    queryKey: ["home-photo-gallery", homeKey],
    queryFn: () => load({ data: { homeKey } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (gallery.isLoading) return <p role="status" className="text-xs text-muted-foreground">Looking through home memories…</p>;
  if (gallery.error) return <p role="alert" className="text-xs text-muted-foreground">Home photos are unavailable right now.</p>;
  if (!gallery.data?.available) return null;
  return <section aria-label="Home photo memories" className="space-y-3">
    <div>
      <h3 className="font-display text-xl">Little moments at home</h3>
      <p className="text-xs text-muted-foreground">Photos actually shared in your conversation—not invented memories.</p>
    </div>
    {gallery.data.photos.length ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {gallery.data.photos.map(photo => <figure key={photo.id} className="overflow-hidden rounded-xl border border-border bg-background">
          <img src={photo.url} alt={photo.caption || "A photo shared from home"}
            loading="lazy" className="aspect-square w-full object-cover" />
          <figcaption className="space-y-1 p-2">
            <p className="line-clamp-2 text-xs">{photo.caption || "Shared from home"}</p>
            <time dateTime={photo.createdAt} className="block text-xs text-muted-foreground">{new Date(photo.createdAt).toLocaleDateString()}</time>
          </figcaption>
        </figure>)}
      </div>
    ) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No confirmed home photos yet. You can ask Tess for a real photo—it's always her choice.</p>}
  </section>;
}
