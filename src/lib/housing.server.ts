import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { emptyHousing, housingSnapshotSchema, type HousingInput } from "./housing";
type Client = SupabaseClient<Database>;
export async function housingReady(db: Client) {
  const r = await db.rpc("housing_status" as never, {} as never);
  if (r.error && ["42883", "PGRST202"].includes(r.error.code)) return false;
  if (r.error) throw new Error("Housing capability unavailable");
  return Number(r.data) === 45;
}
export async function seedHousing(db: Client, user: string) {
  if (!(await housingReady(db))) return false;
  const r = await db.rpc("housing_seed" as never, { p_user: user } as never);
  if (r.error) throw new Error("Homes could not be initialized");
  return true;
}
/** The HTTP boundary always supplies viewer=user. Other viewers are bound to an owned character server-side. */
export async function housingSnapshot(db: Client, user: string, viewer = "user") {
  if (!(await housingReady(db))) return emptyHousing;
  const r = await db.rpc("housing_snapshot" as never, { p_user: user, p_viewer: viewer } as never);
  if (r.error) throw new Error("Private homes unavailable");
  return housingSnapshotSchema.parse(r.data);
}
export async function housingCommand(
  db: Client,
  user: string,
  id: string,
  input: HousingInput,
  now = new Date(),
  actor = "user",
) {
  const r = await db.rpc(
    "housing_command" as never,
    {
      p_user: user,
      p_id: id,
      p_actor: actor,
      p_command: input.command,
      p_payload: input.payload,
      p_now: now.toISOString(),
    } as never,
  );
  if (r.error) {
    const safe = [
      "owned current housing proposal required",
      "housing action id conflict",
      "housing proposal is closed or needs review",
      "only a resident can disclose a home",
      "housing conflicts with an existing commitment",
      "unknown private home",
    ];
    throw new Error(
      safe.includes(r.error.message)
        ? r.error.message
        : "Housing change was not saved. Refresh to check permissions, consent and the latest proposal.",
    );
  }
  return r.data as Json;
}
export async function homeFor(db: Client, user: string, person: string, now = new Date()) {
  if (!(await housingReady(db))) return null;
  const r = await db.rpc(
    "housing_current_home" as never,
    { p_user: user, p_person: person, p_now: now.toISOString() } as never,
  );
  if (r.error) throw new Error("Current residence unavailable");
  return r.data as string | null;
}
export async function housingContext(
  db: Client,
  user: string,
  character: string,
  now = new Date(),
) {
  if (!(await housingReady(db))) return "";
  const s = await housingSnapshot(db, user, character);
  const pos = await db
    .from("town_presence")
    .select("place_key,arrives_at")
    .eq("user_id", user)
    .maybeSingle();
  if (pos.error) throw new Error("Household context unavailable");
  const home = await homeFor(db, user, character, now),
    shared = s.members.some(
      (m) => m.person_key === "user" && s.homes.find((h) => h.id === m.residence_id)?.key === home,
    );
  const proposals = s.proposals.filter((p) =>
    ["proposed", "accepted", "needs_review"].includes(p.status),
  );
  return `PRIVATE HOUSING CONTEXT (only your own home and explicitly known residences): ${JSON.stringify(
    {
      currentAccommodation: home,
      goals: s.goals,
      households: s.households,
      homes: s.homes.slice(0, 12),
      household: s.members.slice(0, 20),
      proposals: proposals.slice(0, 6),
      history: s.history.slice(0, 6),
      playerVirtuallyPresent:
        shared && pos.data?.place_key === home && Date.parse(pos.data.arrives_at) <= now.getTime(),
    },
  )}. Completed housing records override outdated baseline living arrangements in your character bible (for example, previously living alone), while identities, relationship boundaries and historical memories remain intact. Home keys are valid private venues, not public businesses. Approximate markers do not disclose addresses or grant entry. Hosting requires an explicit invitation and agreement, not scores. Shared housing does not imply romance. Never move anyone or accept for the player. When genuinely co-present at your shared home, do not ask them to come over; coordinate ordinary household life naturally. Do not infer their physical location from an address. Only recorded completed moves have happened. Housing goals are tentative. INITIATIVE: You do not need to wait for the player to suggest ordinary home activities. When relevant to the conversation and your actual free time, freely suggest cooking, a movie, a game, a small gathering or simply hanging out. These are ordinary social possibilities, not rare relationship milestones; friends can host too. You may offer to send your own address when a visit is being discussed, without requiring the player to ask first. Record visit permission and address disclosure separately according to what you explicitly offer. Respect hesitation, declined invitations and personal boundaries; do not repeat an unanswered offer or insert a home invitation into every reply. Address sharing must use your established details, never an invented street address. Moving and cohabitation are different: occasionally raise your own tentative housing wishes when actual goals, life events or conversation make them relevant, but a major move proposal needs a grounded reason and all necessary consent, never a score threshold or a quota. You may use housing_actions for your own explicit proposal, response or disclosure grounded in your visible words; pending actions are requests, never claim success before persistence. Residential schedule_actions may record current explicit agreements; public calendar remains manual. Do not fabricate an address, rent, ownership, co-resident or completed travel.`;
}
export async function runHousingTick(db: Client, user: string, now: Date) {
  if (!(await seedHousing(db, user))) return;
  await processHousingActions(db, user, now);
  const plans = await db
    .from("social_plans")
    .select("organizer,status")
    .eq("user_id", user)
    .in("status", ["in_progress", "active"]);
  if (plans.error) throw new Error("Housing availability unavailable");
  const protectedScenes = await db
    .from("living_experiences")
    .select("conversation_id")
    .eq("user_id", user)
    .in("state", ["interactive", "paused", "auto_running"]);
  if (protectedScenes.error) throw new Error("Protected outing ownership unavailable");
  const cast = await db
    .from("conversations")
    .select("id,character:characters(key)")
    .eq("user_id", user);
  if (cast.error) throw new Error("Housing character availability unavailable");
  const { CHARACTERS } = await import("./characters"),
    { currentActivity } = await import("./world-continuity");
  const blocked = [
    ...(plans.data ?? []).flatMap((p) => [p.organizer, "user"]),
    ...(protectedScenes.data ?? []).flatMap((s) => [
      "user",
      (cast.data ?? []).find((c) => c.id === s.conversation_id)?.character?.key ?? "",
    ]),
    ...Object.values(CHARACTERS)
      .filter((c) => ["busy", "asleep"].includes(currentActivity(c, now).availability))
      .map((c) => c.key),
  ];
  const r = await db.rpc(
    "housing_tick" as never,
    { p_user: user, p_now: now.toISOString(), p_blocked: blocked } as never,
  );
  if (r.error) throw new Error("Housing changes deferred; saved proposals remain intact");
}

export async function processHousingActions(db: Client, user: string, now: Date) {
  if (!(await housingReady(db))) return;
  const r = await db.rpc(
    "housing_process_actions" as never,
    { p_user: user, p_now: now.toISOString() } as never,
  );
  if (r.error) throw new Error("Housing requests deferred; saved conversations remain intact");
}

/** Housing changes home context/commutes, never an accepted outing or recorded live scene. */
export async function housingSchedule(
  db: Client,
  user: string,
  character: string,
  base: import("./tess-life").TessActivity,
  now: Date,
): Promise<import("./tess-life").TessActivity> {
  if (!(await housingReady(db))) return base;
  const snapshot = await housingSnapshot(db, user, character),
    key = await homeFor(db, user, character, now),
    home = snapshot.homes.find((h) => h.key === key);
  if (!home) return base;
  // Riley's employment in Altoona is established canon; this is a town-area
  // estimate, not a private employer address or a fabricated verified route.
  if (character === "riley" && base.availability !== "asleep") {
    const { housingCommuteMinutes } = await import("./housing"),
      { zonedInstant } = await import("./calendar-time");
    const minutes = housingCommuteMinutes(home, {
      key: "work-area:altoona",
      latitude: 40.5187,
      longitude: -78.3947,
    });
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const start = zonedInstant(day, "22:00"),
      end = zonedInstant(day, "06:00");
    if (
      (start &&
        now.getTime() >= Date.parse(start) - minutes * 60000 &&
        now.getTime() < Date.parse(start)) ||
      (end && now.getTime() >= Date.parse(end) && now.getTime() < Date.parse(end) + minutes * 60000)
    )
      return {
        activity: "commuting",
        availability: "busy",
        detail: `Virtual commute between ${home.community} and the approximate Altoona work area; about ${minutes} minutes. No exact employer address or completed travel is inferred.`,
      };
  }
  if (/\b(?:home|sleep|bed)\b/i.test(base.activity))
    return {
      ...base,
      detail: `${base.detail}; current home in ${home.community} (${home.key}). No physical player presence is implied.`,
    };
  return base;
}
