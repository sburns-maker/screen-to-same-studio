import { supportsRelationshipCommitment } from "./relationship-commitments";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const loadRelationshipCommitments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ characterKey: z.string().min(1).max(80) }).parse(value))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { commitmentSnapshot } = await import("./relationship-commitments.server");
    return commitmentSnapshot(supabaseAdmin, context.userId, data.characterKey);
  });

/** Player-side decisions only. A player can never supply character consent. */
export const changeRelationshipCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    requestId: z.string().uuid(),
    characterKey: z.enum(["tess","maya","claire","jordan","ben","riley"]),
    kind: z.enum(["exclusive","partnership","engagement","marriage","separation","divorce"]),
    action: z.enum(["propose","accept","decline","cancel"]),
    eventId: z.string().uuid().nullable(),
  }).parse(value))
  .handler(async ({ context, data }) => {
    const { CHARACTERS } = await import("./characters");
    if (!supportsRelationshipCommitment(data.characterKey) || !CHARACTERS[data.characterKey].romanticCapable || CHARACTERS[data.characterKey].age < 18)
      throw new Error("Romantic commitments are unavailable for this contact");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { commitmentSnapshot } = await import("./relationship-commitments.server");
    if (!(await commitmentSnapshot(supabaseAdmin, context.userId, data.characterKey)).available) throw new Error("Relationship feature is not enabled");
    const result = await supabaseAdmin.rpc("relationship_player_command" as never, {
      p_user: context.userId,
      p_request: data.requestId,
      p_character: data.characterKey,
      p_kind: data.kind,
      p_action: data.action,
      p_event: data.eventId,
    } as never);
    if (result.error) throw new Error("Unable to save relationship decision");
    return { id: String(result.data) };
  });
