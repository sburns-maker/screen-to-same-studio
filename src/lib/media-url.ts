import { supabase } from "@/integrations/supabase/client";
import type { MediaItem } from "./media";
export async function resolveMedia(item: MediaItem) {
  if (item.path && item.bucket) {
    // Re-sign on each open, save or share. Storage owner RLS applies to the original object.
    const r = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 600);
    if (r.error || !r.data) throw new Error("Private media is unavailable");
    return r.data.signedUrl;
  }
  if (item.src) {
    // Profile avatars also arrive as signed URLs. Renew only links belonging to
    // this configured backend; never turn an arbitrary external URL into a storage request.
    const backend = import.meta.env["VITE_SUPABASE_URL"];
    if (backend) {
      const url = new URL(item.src, window.location.origin);
      const prefix = "/storage/v1/object/sign/";
      if (url.origin === new URL(backend).origin && url.pathname.startsWith(prefix)) {
        const [bucket, ...parts] = url.pathname.slice(prefix.length).split("/");
        const path = decodeURIComponent(parts.join("/"));
        if (["tess-photos", "user-videos"].includes(bucket ?? "") && path && !path.includes("..")) {
          const r = await supabase.storage.from(bucket!).createSignedUrl(path, 600);
          if (r.error || !r.data) throw new Error("Private media is unavailable");
          return r.data.signedUrl;
        }
      }
    }
    return item.src;
  }
  throw new Error("Media unavailable");
}
