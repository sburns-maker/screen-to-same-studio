import { followupCanStart } from "./calendar-view";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { interactiveAvailable, syncCalendar } from "./interactive-world.server";
import type { CalendarPlan } from "./calendar-logic";
import { CHARACTERS } from "./characters";
import { placeByKey } from "./place-registry";
import { calendarContractReady } from "./calendar-coordinator.server";
import type { ExperienceRow } from "./living-experiences";
type Client = SupabaseClient<Database>;
export type AgendaEvent = CalendarPlan & {
  venueLabel: string;
  participants: { key: string; name: string; response: string }[];
  experience: ExperienceRow | null;
  followupReady: boolean;
  residentialReview?: string | undefined;
};
export async function schedulingAgenda(db: Client, user: string, now = new Date()) {
  if (!(await interactiveAvailable(db)))
    return {
      available: false,
      manual: false,
      structured: false,
      events: [] as AgendaEvent[],
      residences: [] as { key: string; label: string }[],
      contacts: [] as { id: string; key: string; name: string }[],
    };
  await syncCalendar(db, user, now);
  const [records, cast, rsvps, scenes, known] = await Promise.all([
    (await import("./calendar-store.server")).readCanonicalPlans(db, user),
    db
      .from("conversations")
      .select("id,character:characters(key,preferred_name)")
      .eq("user_id", user),
    db.from("social_rsvps").select("*").eq("user_id", user).limit(600),
    db.from("living_experiences").select("*").eq("user_id", user).limit(1000),
    db.from("town_known_plans").select("plan_id").eq("user_id", user),
  ]);
  if (
    known.error ||
    cast.error ||
    rsvps.error ||
    (scenes.error && !["42P01", "PGRST205"].includes(scenes.error.code))
  )
    throw new Error("Shared calendar is unavailable");
  const homes = (await (await import("./housing.server")).housingSnapshot(db, user)).homes;
  const experiences = (scenes.data ?? []) as ExperienceRow[];
  const events = records
    .filter((p) =>
      p.origin === "conversation"
        ? p.conversation_id !== null
        : (known.data ?? []).some((k) => k.plan_id === p.id),
    )
    .map((row) => {
      const p = row as unknown as CalendarPlan,
        participants = [
          { key: "user", name: "You", response: p.user_response ?? "not_reported" },
          ...(rsvps.data ?? [])
            .filter((r) => r.plan_id === p.id)
            .map((r) => ({
              key: r.character_key,
              name:
                CHARACTERS[r.character_key as keyof typeof CHARACTERS]?.preferredName ??
                r.character_key,
              response: r.response,
            })),
        ];
      if (!participants.some((r) => r.key === p.organizer))
        participants.push({
          key: p.organizer,
          name: CHARACTERS[p.organizer as keyof typeof CHARACTERS]?.preferredName ?? p.organizer,
          response: p.character_response ?? "invited",
        });
      const parent = experiences.find((e) => e.plan_id === p.parent_plan_id);
      return {
        ...p,
        residentialReview:
          /^(home:|residence:)/.test(p.place_key ?? "") &&
          !homes.some((h) => h.key === p.place_key && h.canPlan) &&
          !["completed", "cancelled", "declined", "missed"].includes(p.status)
            ? "This residence needs a new invitation or venue review; the original plan has been preserved."
            : undefined,
        time_zone: p.time_zone ?? "America/New_York",
        venueLabel:
          placeByKey(p.place_key)?.label ??
          homes.find((h) => h.key === p.place_key)?.label ??
          (p.origin === "housing" ? "Private residence" : p.place_key) ??
          "Venue undecided",
        participants,
        experience: experiences.find((e) => e.plan_id === p.id) ?? null,
        followupReady: followupCanStart(
          p,
          records.find((row) => row.id === p.parent_plan_id),
          parent,
          now,
        ),
      };
    });
  return {
    available: true,
    manual: await (await import("./manual-calendar.server")).manualCalendarReady(db),
    structured: await calendarContractReady(db),
    events,
    residences: homes.filter((h) => h.canPlan).map((h) => ({ key: h.key, label: h.label })),
    contacts: (cast.data ?? []).flatMap((c) => {
      const person = c.character as { key: string; preferred_name: string } | null;
      return person ? [{ id: c.id, key: person.key, name: person.preferred_name }] : [];
    }),
  };
}
