import { developerPhotosAllowed } from "./spontaneous-photo.server";
import { TEXT_MODEL } from "./text-ai.server";

type Check = "present" | "missing" | "unavailable" | "not checked";
export async function photoSetupStatus(userId: string, checkModel = false) {
  const developerAllowed = developerPhotosAllowed(userId);
  if (checkModel && !developerAllowed) throw new Error("Developer model checks are disabled");
  const keyPresent = !!process.env["OPENAI_API_KEY"];
  const servicePresent =
    !!process.env["SUPABASE_SERVICE_ROLE_KEY"] && !!process.env["SUPABASE_URL"];
  let migration: Check = "not checked";
  const { canonicalProfile } = await import("./canonical-profile.server");
  let resolveReference = canonicalProfile as (
    key: "tess" | "maya" | "claire" | "jordan" | "ben",
  ) => Promise<Omit<Awaited<ReturnType<typeof canonicalProfile>>, "asset"> & { asset: string }>;
  if (servicePresent) {
    const { currentCanonical } = await import("./profile-media.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    resolveReference = (key) => currentCanonical(supabaseAdmin, userId, key);
  }
  const canonicalReferences = await Promise.all(
    (["tess", "maya", "claire", "jordan", "ben"] as const).map(async (key) => {
      try {
        const ref = await resolveReference(key);
        return {
          character: key,
          asset: ref.asset,
          sha256: ref.sha256,
          width: ref.width,
          height: ref.height,
          status: "structurally_usable",
        };
      } catch {
        return {
          character: key,
          asset: null,
          sha256: null,
          width: null,
          height: null,
          status: "unavailable",
        };
      }
    }),
  );
  const tessReference: Check =
    canonicalReferences[0]?.status === "structurally_usable" ? "present" : "unavailable";
  if (servicePresent) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rpc = await supabaseAdmin.rpc("deliver_photo_turn", {
        p_job_id: null as unknown as string,
      });
      migration = rpc.error
        ? rpc.error.code === "PGRST202" || rpc.error.code === "42883"
          ? "missing"
          : "unavailable"
        : "present";
    } catch {
      migration = "unavailable";
    }
  }
  let modelAccess: Check = "not checked";
  if (checkModel && keyPresent) {
    try {
      const response = await fetch(`https://api.openai.com/v1/models/${TEXT_MODEL}`, {
        headers: { Authorization: `Bearer ${process.env["OPENAI_API_KEY"]}` },
        signal: AbortSignal.timeout(15_000),
      });
      modelAccess =
        response.ok && (await response.json()).id === TEXT_MODEL ? "present" : "unavailable";
    } catch {
      modelAccess = "unavailable";
    }
  }
  return {
    userId,
    developerAllowed,
    keyPresent,
    servicePresent,
    migration,
    tessReference,
    canonicalReferences,
    visualScreenConfigured: keyPresent,
    model: TEXT_MODEL,
    modelAccess,
    developerFlag: process.env["ENABLE_DEV_PHOTO_ACTIONS"] === "true",
  };
}
