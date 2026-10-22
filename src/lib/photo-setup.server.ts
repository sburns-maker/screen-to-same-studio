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
  let tessReference: Check = "not checked";
  if (servicePresent) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rpc = await supabaseAdmin.rpc("deliver_photo_turn", { p_job_id: null as unknown as string });
      migration = rpc.error
        ? rpc.error.code === "PGRST202" || rpc.error.code === "42883"
          ? "missing"
          : "unavailable"
        : "present";
      const refs = await supabaseAdmin.storage
        .from("tess-reference")
        .list("", { search: "canonical.jpg", limit: 100 });
      tessReference = refs.error
        ? "unavailable"
        : refs.data?.some((file) => file.name === "canonical.jpg")
          ? "present"
          : "missing";
    } catch {
      migration = "unavailable";
      tessReference = "unavailable";
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
    model: TEXT_MODEL,
    modelAccess,
    developerFlag: process.env["ENABLE_DEV_PHOTO_ACTIONS"] === "true",
  };
}
