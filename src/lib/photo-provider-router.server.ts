import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CHARACTERS, type CharacterKey } from "./characters";
import type { ImageProvider } from "./tess-image.server";
import { api18Configuration, api18ProviderFromEnvironment } from "./api18-image.server";
/** Reached only after existing eligibility, willingness, scene and budget checks.
 * Ordinary categories never contact Api18 or consult its configuration.
 */
export async function configuredPhotoProvider(
  db: SupabaseClient<Database>,
  user: string,
  key: CharacterKey,
  type: string,
  ordinary: ImageProvider,
  actionId?: string,
  conversationId?: string,
): Promise<ImageProvider> {
  if (type !== "mature_romantic" || process.env["API18_ENABLED"] !== "true") return ordinary;
  const preference = await db
    .from("photo_reference_state")
    .select("api18_enabled,adult_confirmed")
    .eq("user_id", user)
    .eq("character_key", key)
    .maybeSingle();
  if (preference.error) throw new Error("Api18 reference migration or preferences unavailable");
  if (!preference.data?.api18_enabled) return ordinary;
  if (
    !preference.data.adult_confirmed ||
    CHARACTERS[key].age < 18 ||
    !CHARACTERS[key].romanticCapable
  )
    throw new Error("Adult non-nude romantic photo eligibility required");
  const config = api18Configuration();
  if (!config.ready) throw new Error(config.reason);
  if (!actionId) throw new Error("api18_durable_action_required");
  if (!conversationId) {
    const ch = await db.from("characters").select("id").eq("key", key).single();
    const conv = ch.data
      ? await db
          .from("conversations")
          .select("id")
          .eq("user_id", user)
          .eq("character_id", ch.data.id)
          .single()
      : null;
    if (ch.error || conv?.error || !conv?.data)
      throw new Error("api18_owned_conversation_required");
    conversationId = conv.data.id;
  }
  const refs = await (
    await import("./photo-reference-library.server")
  ).approvedProviderReferences(db, user, key);
  const journal = (await import("./api18-jobs.server")).api18Journal(
    db,
    user,
    conversationId,
    key,
    actionId,
  );
  const provider = api18ProviderFromEnvironment(
    refs.map((r) => r.url),
    journal,
  );
  return {
    ...provider,
    generate: async (prompt, primary, options) => {
      if (primary.length !== 1) throw new Error("api18_secondary_subjects_unsupported");
      const { portraitHash } = await import("./profile-media.server");
      if (
        (await portraitHash(new Uint8Array(await primary[0]!.arrayBuffer()))) !==
        (await portraitHash(new Uint8Array(await refs[0]!.blob.arrayBuffer())))
      )
        throw new Error("api18_reference_identity_changed");
      return provider.generate(
        prompt,
        refs.map((r) => r.blob),
        options,
      );
    },
  };
}
