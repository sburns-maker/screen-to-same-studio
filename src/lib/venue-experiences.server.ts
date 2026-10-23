import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ExperienceKind } from "./venue-experiences";
type Client = SupabaseClient<Database>;
export async function experiencesAvailable(db: Client) {
  const r = await db.rpc("venue_experience_status", {});
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Venue activities unavailable");
  return r.data === 21;
}
export async function progressVenue(
  db: Client,
  user: string,
  data: {
    id: string;
    place: string;
    kind: ExperienceKind;
    step: number;
    choice: number;
    planId?: string | undefined;
  },
  now: Date,
) {
  if (!(await experiencesAvailable(db)))
    throw new Error("Venue activities need reviewed migration 0021");
  const r = await db.rpc("venue_progress", {
    p_user: user,
    p_id: data.id,
    p_place: data.place,
    p_kind: data.kind,
    p_step: data.step,
    p_choice: data.choice,
    p_now: now.toISOString(),
    ...(data.planId ? { p_plan: data.planId } : {}),
  });
  if (r.error) {
    const safe = [
      "Arrive before interacting",
      "This activity is unavailable or the venue is closed",
      "A confirmed companion must be present",
      "This activity does not match the event",
      "Start the activity first",
      "Activity changed; refresh before choosing",
      "Choose an available option",
      "Action ID belongs to a different request",
    ];
    throw new Error(
      safe.includes(r.error.message)
        ? r.error.message
        : "Activity could not be confirmed. Refresh and check your visit before retrying.",
    );
  }
  return r.data;
}
