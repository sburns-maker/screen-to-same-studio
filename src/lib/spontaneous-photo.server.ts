import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CharacterDef } from "./characters";
import type { TessState } from "./tess-logic";
import type { TessActivity } from "./tess-life";
import { eligiblePhotoCategories, type PhotoBoundary } from "./photo-policy";
import { attachmentPresent, photoOpportunity } from "./photo-opportunities";
import type { PhotoFrequency } from "./tess-photos";

export async function evaluateSpontaneousPhoto(
  supabase: SupabaseClient<Database>,
  args: {
    def: CharacterDef;
    conversation: {
      id: string;
      user_id: string;
      photo_frequency: string;
      photo_boundary: string;
      mature_photography: boolean;
    };
    state: TessState;
    schedule: TessActivity;
    now: Date;
    context: string;
    gapHours: number;
    lastInitiatedAt: string | null;
  },
) {
  const { def, conversation: conv } = args;
  const [{ data: recent, error }, { data: last, error: lastError }] = await Promise.all([
    supabase
      .from("messages")
      .select("created_at, metadata")
      .eq("conversation_id", conv.id)
      .eq("user_id", conv.user_id)
      .eq("sender", "tess")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conv.id)
      .eq("user_id", conv.user_id)
      .eq("sender", "tess")
      .or(
        "metadata->>photo.not.is.null,metadata->>generated_path.not.is.null,metadata->>generated_image_id.not.is.null",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error || lastError) throw new Error("Photo frequency history unavailable");
  const idx = (recent ?? []).findIndex((m) => attachmentPresent(m.metadata));
  return photoOpportunity({
    character: def.key,
    conversationId: conv.id,
    now: args.now,
    schedule: args.schedule,
    state: args.state,
    frequency: conv.photo_frequency as PhotoFrequency,
    eligibleTypes: eligiblePhotoCategories(args.state, {
      age: def.age,
      enabled: def.photosEnabled,
      romanticCapable: def.romanticCapable,
      supported: def.photoTypes,
      boundary: conv.photo_boundary as PhotoBoundary,
      matureEnabled: conv.mature_photography,
    }),
    ownSinceLastPhoto: idx < 0 ? 99 : idx,
    lastPhotoAt: last?.created_at ?? null,
    gapHours: args.gapHours,
    lastInitiatedAt: args.lastInitiatedAt,
    context: args.context,
  });
}

export function developerPhotosAllowed(userId: string): boolean {
  return (
    process.env["ENABLE_DEV_PHOTO_ACTIONS"] === "true" &&
    (process.env["DEVELOPER_PHOTO_USER_IDS"] ?? "")
      .split(",")
      .map((id) => id.trim())
      .includes(userId)
  );
}
