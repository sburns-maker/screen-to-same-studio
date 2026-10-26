import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveCalendarVenue } from "./calendar-venue";

export async function registeredCalendarVenues(db: SupabaseClient<Database>, userId: string) {
  const { data, error } = await db
    .from("world_places")
    .select("key, label")
    .eq("user_id", userId)
    .eq("metadata->>public", "true");
  if (error) throw new Error("Calendar venue directory unavailable");
  const homes = await (await import("./housing.server")).housingSnapshot(db, userId);
  return [...(data ?? []), ...homes.homes.map((h) => ({ key: h.key, label: h.label }))];
}

export async function canonicalCalendarVenue(
  db: SupabaseClient<Database>,
  userId: string,
  place: string | null,
) {
  if (!place) return place;
  return resolveCalendarVenue(place, await registeredCalendarVenues(db, userId));
}
