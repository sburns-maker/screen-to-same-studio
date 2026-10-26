import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ExperienceRow, ExperienceMoment } from "./living-experiences";
import { initialScene, transitionScene, type LiveScene } from "./experience-scene";
type Client = SupabaseClient<Database>;
export async function synchronizeScene(
  db: Client,
  user: string,
  plan: string,
  scene: ExperienceRow,
  moments: ExperienceMoment[],
  character: string,
  name: string,
  venueKey: string,
  venueLabel: string,
) {
  const capability = await db.rpc("experience_scene_status" as never, {} as never);
  if (capability.error && !["42883", "PGRST202"].includes(capability.error.code))
    throw new Error("Live scene storage unavailable");
  const durable = !capability.error && capability.data === 39;
  const h = await import("./housing.server");
  const homes = (await h.housingReady(db))
    ? { user: await h.homeFor(db, user, "user"), character: await h.homeFor(db, user, character) }
    : undefined;
  let current = scene.live_scene ?? initialScene(character, venueKey, venueLabel),
    revision = scene.scene_revision ?? 0;
  if (!durable) {
    for (const m of moments.filter((m) => m.source === "user"))
      current = transitionScene(current, m.body, character, name, homes) ?? current;
    return { current, durable: false };
  }
  // Receipts and scene revision come from the DB, never browser state or an AI assertion.
  const seen = await db
    .from("experience_scene_transitions" as never)
    .select("source_id")
    .eq("user_id", user)
    .eq("experience_id", scene.id);
  if (seen.error) throw new Error("Live scene receipts unavailable");
  const processed = new Set(((seen.data ?? []) as { source_id: string }[]).map((x) => x.source_id));
  for (const m of moments.filter((m) => m.source === "user")) {
    if (processed.has(m.id)) continue;
    const next = transitionScene(current, m.body, character, name, homes);
    const result = await db.rpc(
      "experience_scene_apply" as never,
      {
        p_user: user,
        p_plan: plan,
        p_source: m.id,
        p_revision: revision,
        p_scene: next,
        p_quote: m.body,
      } as never,
    );
    if (result.error) throw new Error("Live scene changed; retry from your recorded progress");
    const data = result.data as unknown as { scene: LiveScene; revision: number };
    current = data.scene;
    revision = data.revision;
  }
  return { current, durable: true };
}
