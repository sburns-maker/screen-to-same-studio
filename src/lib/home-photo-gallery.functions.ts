import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifiedHomePhotoCandidates } from "./home-photo-gallery";

/** Private, short-lived photo URLs; never send paths, addresses or other contacts' photos to the browser. */
export const loadHomePhotoGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ homeKey: z.string().min(1).max(140) }).parse(value))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { housingSnapshot, housingReady } = await import("./housing.server");
    if (!(await housingReady(db))) return { available: false, photos: [] };
    const snapshot = await housingSnapshot(db, context.userId);
    const home = snapshot.homes.find(h => h.key === data.homeKey);
    // Pilot: only Tess's recognized home and only when the player has visit permission.
    // An approximate map marker or a shared text message is not permission.
    if (!home || !home.primaryFor.includes("tess") || !home.canVisit)
      return { available: true, photos: [] };
    const { data: rows, error } = await db.from("messages")
      .select("id,body,created_at,metadata")
      .eq("user_id", context.userId)
      .eq("sender", "tess")
      .not("metadata->>generated_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw new Error("Home photos unavailable");
    const candidates = verifiedHomePhotoCandidates(rows ?? [], "tess").slice(0, 12);
    const photos: { id: string; caption: string; createdAt: string; url: string }[] = [];
    for (const item of candidates) {
      // Preserve the per-player storage partition used by the existing photo pipeline.
      if (!item.path.startsWith(context.userId + "/")) continue;
      const result = await db.storage.from("tess-photos").createSignedUrl(item.path, 90);
      if (result.data?.signedUrl) photos.push({
        id: item.id, caption: item.caption, createdAt: item.createdAt,
        url: result.data.signedUrl,
      });
    }
    return { available: true, photos };
  });
