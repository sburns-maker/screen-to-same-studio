import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CHARACTERS, type CharacterKey } from "./characters";
import type { ImageProvider } from "./tess-image.server";
import { spicyConfiguration, SPICY_CAST } from "./spicy-image.server";
import { submitSpicyPhoto, type SpicyContext } from "./spicy-jobs.server";
/** Ordinary categories never enter this provider path. */
export async function configuredPhotoProvider(
  db: SupabaseClient<Database>,
  user: string,
  key: CharacterKey,
  type: string,
  ordinary: ImageProvider,
  actionId?: string,
  conversationId?: string,
  context?: SpicyContext,
): Promise<ImageProvider> {
  if (type !== "mature_romantic" && type !== "suggestive") return ordinary;
  // Suggestive images are SpicyAPI-only. Never send a suggestive prompt or
  // canonical portrait to OpenAI/the ordinary provider as a silent fallback.
  if (process.env["SPICY_ENABLED"] !== "true") {
    if (type === "suggestive") throw new Error("Suggestive photos require SpicyAPI to be enabled");
    return ordinary;
  }
  if (!(SPICY_CAST as readonly string[]).includes(key))
    throw new Error("Mature provider unavailable for this character");
  const preference = await db
    .from("photo_reference_state")
    .select("spicy_enabled,adult_confirmed")
    .eq("user_id", user)
    .eq("character_key", key)
    .maybeSingle();
  if (preference.error) throw new Error("SpicyAPI migration or preferences unavailable");
  if (!preference.data?.spicy_enabled) {
    if (type === "suggestive") throw new Error("Enable SpicyAPI for this character to test suggestive photos");
    return ordinary;
  }
  if (
    !preference.data.adult_confirmed ||
    CHARACTERS[key].age < 18 ||
    !CHARACTERS[key].romanticCapable
  )
    throw new Error("Adult non-nude romantic photo eligibility required");
  const config = spicyConfiguration(key);
  if (!config.ready) throw new Error(config.reason);
  if (!actionId || !context) throw new Error("spicy_durable_photo_context_required");
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
      throw new Error("spicy_owned_conversation_required");
    conversationId = conv.data.id;
  }
  const references = await (
    await import("./photo-reference-library.server")
  ).approvedProviderReferences(db, user, key);
  const { portraitHash } = await import("./profile-media.server");
  const hash = await portraitHash(new Uint8Array(await references[0]!.blob.arrayBuffer()));
  const conversation = conversationId;
  return {
    name: "spicyapi",
    model: config.model,
    referenceConditioning: true,
    allowIdentityRetry: false,
    async generate(prompt, primary) {
      if (
        primary.length !== 1 ||
        (await portraitHash(new Uint8Array(await primary[0]!.arrayBuffer()))) !== hash
      )
        throw new Error("spicy_reference_identity_changed");
      return submitSpicyPhoto(
        db,
        user,
        conversation,
        key,
        actionId,
        prompt,
        references.map((r) => r.url),
        hash,
        context,
      );
    },
  };
}
