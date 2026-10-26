import { developerPhotosAllowed } from "./spontaneous-photo.server";
import { photoActionId } from "./photo-delivery.server";
import { reserveWorldAi } from "./world-runtime.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  CharacterAIError,
  readCharacterAIDiagnostic,
  type CharacterAIDiagnostic,
} from "./character-ai-error";
type Result = {
  state: "passed" | "failed" | "running" | "blocked";
  diagnostic: CharacterAIDiagnostic | null;
  note: string;
};
/** One explicit developer check per user/UTC day, journaled independently from every outing. */
export async function checkExperienceProvider(
  db: SupabaseClient<Database>,
  user: string,
  conversation: string,
  now = new Date(),
): Promise<Result> {
  if (!developerPhotosAllowed(user)) throw new Error("Developer access required");
  const owned = await db
    .from("conversations")
    .select("id")
    .eq("user_id", user)
    .eq("id", conversation)
    .maybeSingle();
  if (owned.error || !owned.data) throw new Error("Conversation unavailable");
  const id = await photoActionId(
    `experience-provider-check:${user}:${now.toISOString().slice(0, 10)}`,
  );
  const job = `experience-provider-check:${user}`;
  const stored = await db
    .from("job_runs")
    .select("status,detail")
    .eq("id", id)
    .eq("job", job)
    .maybeSingle();
  if (stored.error) throw new Error("Provider check history unavailable");
  const read = (row: { status: string; detail: Json }): Result => {
    const detail = row.detail as { diagnostic?: unknown } | null;
    return {
      state:
        row.status === "ok"
          ? "passed"
          : row.status === "failed"
            ? "failed"
            : row.status === "paused"
              ? "blocked"
              : "running",
      diagnostic: readCharacterAIDiagnostic(detail?.diagnostic),
      note: "Saved check result. No additional request was submitted.",
    };
  };
  if (stored.data) return read(stored.data);
  if (!process.env["OPENAI_API_KEY"] || process.env["CHARACTER_AI_DISABLED"] === "true")
    return {
      state: "blocked",
      diagnostic: null,
      note: "Character provider is not configured or is paused. No request submitted.",
    };
  const reservation = await db.from("job_runs").insert({
    id,
    job,
    status: "running",
    detail: { userId: user, conversationId: conversation, isolated: true },
    started_at: now.toISOString(),
  });
  if (reservation.error) {
    if (reservation.error.code === "23505")
      return {
        state: "running",
        diagnostic: null,
        note: "This check was already reserved. No duplicate request submitted.",
      };
    throw new Error("Provider check reservation unavailable");
  }
  const save = async (result: Result) => {
    const updated = await db
      .from("job_runs")
      .update({
        status: result.state === "passed" ? "ok" : result.state === "blocked" ? "paused" : "failed",
        finished_at: new Date().toISOString(),
        detail: {
          userId: user,
          conversationId: conversation,
          isolated: true,
          diagnostic: result.diagnostic,
        } as unknown as Json,
      })
      .eq("id", id)
      .eq("job", job);
    if (updated.error)
      throw new Error("Check result could not be saved. Do not repeat the request.");
    return result;
  };
  let budget: boolean;
  try {
    budget = await reserveWorldAi(db, user);
  } catch {
    return save({
      state: "blocked",
      diagnostic: null,
      note: "AI budget check unavailable. No provider request submitted.",
    });
  }
  if (!budget)
    return save({
      state: "blocked",
      diagnostic: null,
      note: "Existing AI budget is unavailable. No provider request submitted.",
    });
  try {
    const { runStructured } = await import("./text-ai.server");
    const { replySchema } = await import("./tess.server");
    await runStructured(
      replySchema,
      "Isolated fictional adult character provider check. Return a minimal valid reply only. No real conversation, scene, memory or relationship is being changed. All optional decisions nullable in this schema must be null; state deltas zero, memory_candidates and event_tags empty, messages a brief greeting, send_delay_seconds zero, photo_boundary_decision unchanged.",
      "Check the configured model and production structured response schema. Do not propose any actions.",
      "unspecified",
      { operationId: id },
    );
    return save({
      state: "passed",
      diagnostic: null,
      note: "Minimal production-schema request succeeded. No scene generated or saved. A history-specific outing failure still needs investigation.",
    });
  } catch (error) {
    return save({
      state: "failed",
      diagnostic: error instanceof CharacterAIError ? error.diagnostic : null,
      note: "Provider check failed. No outing action, scene, retry allowance, memory or relationship was changed. No automatic retry.",
    });
  }
}
