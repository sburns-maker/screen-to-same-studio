import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const key = z.enum(["tess", "maya", "claire", "jordan", "ben", "sienna", "kendra"]);
export const loadActivePortraits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return (await import("./visual-profiles.server")).activePortraits(db, context.userId);
  });
export const profilePhotoChoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { expansionAvailable, registerPrimaryIdentity } =
      await import("./visual-profiles.server");
    if (!(await expansionAvailable(db)))
      return {
        available: false,
        choices: [],
        canonical: null,
        activeMessageId: null,
        activeReason: "",
        activeStorageUrl: null as string | null,
        canonicalUrl: null as string | null,
      };
    const owned = await db.from("characters").select("id").eq("key", data.key).single();
    const conv = owned.data
      ? await db
          .from("conversations")
          .select("id")
          .eq("user_id", context.userId)
          .eq("character_id", owned.data.id)
          .single()
      : null;
    if (!conv?.data) throw new Error("Owned character required");
    const anchor = await registerPrimaryIdentity(db, context.userId, data.key);
    const r = await db
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.data.id)
      .eq("user_id", context.userId)
      .eq("sender", "tess")
      .lte("visible_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(80);
    if (r.error) throw new Error("Profile candidates unavailable");
    const choices = [] as { id: string; url: string; at: string }[];
    for (const m of r.data ?? []) {
      const md = m.metadata as {
        photo_type?: string;
        generated_path?: string;
        photo_identity?: {
          canonicalSha256?: string;
          validationStatus?: string;
          referenceConditioning?: boolean;
        };
      };
      if (
        !["casual_selfie", "tess_candid"].includes(md.photo_type ?? "") ||
        md.photo_identity?.canonicalSha256 !== anchor.sha256 ||
        md.photo_identity.validationStatus !== "screen_passed" ||
        !md.photo_identity.referenceConditioning ||
        !md.generated_path?.startsWith(context.userId + "/") ||
        md.generated_path.includes("..")
      )
        continue;
      const signed = await db.storage.from("tess-photos").createSignedUrl(md.generated_path, 1200);
      if (signed.data) choices.push({ id: m.id, url: signed.data.signedUrl, at: m.created_at });
      if (choices.length >= 8) break;
    }
    const registry = await db
      .from("visual_identity_registry")
      .select("*")
      .eq("user_id", context.userId)
      .eq("entity_key", data.key)
      .single();
    const privateUrl = async (path: string | null) => {
      if (!path?.startsWith(`${context.userId}/profile/${data.key}/`) || path.includes(".."))
        return null;
      return (
        (await db.storage.from("tess-photos").createSignedUrl(path, 600)).data?.signedUrl ?? null
      );
    };
    return {
      available: true,
      activeStorageUrl: await privateUrl(registry.data?.active_storage_path ?? null),
      canonicalUrl: await privateUrl(anchor.asset),
      activeMessageId: anchor.activeMessageId,
      activeReason: anchor.activeReason,
      choices,
      canonical: { asset: anchor.asset, sha256: anchor.sha256 },
    };
  });
export const chooseProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key,
        messageId: z.string().uuid().nullable(),
        reason: z.string().trim().min(5).max(200),
        approved: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await (
      await import("./visual-profiles.server")
    ).registerPrimaryIdentity(db, context.userId, data.key);
    const r = await db.rpc("update_active_portrait", {
      p_user: context.userId,
      p_key: data.key,
      p_message: data.messageId as string,
      p_reason: data.reason,
    });
    if (r.error)
      throw new Error(
        "Profile photo rejected. Choose a delivered, screened casual portrait of this character.",
      );
    return { updated: true };
  });
