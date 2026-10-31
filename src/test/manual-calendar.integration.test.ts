// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { saveManualCalendar } from "@/lib/manual-calendar.server";
import { syncCalendar } from "@/lib/interactive-world.server";
import {
  prepareScheduleActions,
  syncExperienceScheduling,
} from "@/lib/calendar-coordinator.server";
import { experienceCommand, livingHistory } from "@/lib/living-experiences.server";
let db: Awaited<ReturnType<typeof worldDatabase>>;
let migrationPreserved = false;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  conv = "20000000-0000-4000-a000-000000000001";
const now = new Date("2026-10-25T18:00Z"),
  id = () => crypto.randomUUID();
const client = () => postgresSupabase(db).admin;
const draft = (extra = {}) => ({
  action: "invite",
  planId: null,
  parentPlanId: null,
  title: "Coffee agreed with Maya",
  description: null,
  category: "coffee",
  date: "2026-10-25",
  time: "15:00",
  timeHint: null,
  timeZone: "America/New_York",
  place: "coffee:local",
  durationMinutes: 60,
  userQuote: null,
  ...extra,
});
async function add(extra = {}, action = id()) {
  return saveManualCalendar(
    client(),
    user,
    { id: action, conversationId: conv, confirmed: true, plan: draft(extra) },
    now,
  );
}
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(
    "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$",
  );
  for (const file of [
    "0024_verify_phone_calls",
    "0025_living_experiences",
    "0026_complete_living_experiences",
    "0033_riley_living_experience_guards",
    "0034_experience_retry_recovery",
    "0035_remove_experience_daily_cap",
    "0036_mutual_calendar_confirmation",
    "0037_all_character_calendar_proposers",
    "0038_canonical_scheduling",
    "0039_experience_live_scene",
    "0040_transactional_plan_edits",
    "0041_unregistered_venue_message_recovery",
    "0042_calendar_scene_privileges",
    "0043_verify_migration_catchup",
    "0044_manual_calendar_control",
    "0045_residences_households",
  ]) {
    if (file === "0044_manual_calendar_control") {
      await db.exec(`INSERT INTO conversations(id,user_id,character_id) SELECT '${conv}','${other}',id FROM characters WHERE key='tess';
          INSERT INTO world_places(user_id,key,label,kind) VALUES('${other}','coffee:old','Established venue','cafe');
          INSERT INTO social_plans(user_id,id,organizer,title,place_key,status,starts_at,ends_at,origin,conversation_id) VALUES('${other}','30000000-0000-4000-a000-000000000001','tess','Already agreed date','coffee:old','accepted','2026-10-26T18:00Z','2026-10-26T19:00Z','conversation','${conv}');
          INSERT INTO memories(user_id,conversation_id,summary) VALUES('${other}','${conv}','Established memory before manual calendar');`);
      const before = await db.query("SELECT * FROM social_plans ORDER BY id");
      const memories = await db.query("SELECT * FROM memories ORDER BY id");
      await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
      expect((await db.query("SELECT * FROM social_plans ORDER BY id")).rows).toEqual(before.rows);
      expect((await db.query("SELECT * FROM memories ORDER BY id")).rows).toEqual(memories.rows);
      migrationPreserved = true;
    } else await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "true");
  await db.exec(`TRUNCATE conversations CASCADE; TRUNCATE world_places CASCADE; UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00Z';
    INSERT INTO conversations(id,user_id,character_id) SELECT '${conv}','${user}',id FROM characters WHERE key='maya';
    INSERT INTO tess_state(user_id,conversation_id) VALUES('${user}','${conv}');`);
});
describe("user-controlled canonical calendar", () => {
  it("saves an agreed plan without a message and retries once without duplicate memories or events", async () => {
    const action = id();
    const p = await add({}, action);
    expect(p.status).toBe("accepted");
    expect((await add({}, action)).id).toBe(p.id);
    expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 0 });
    expect(
      (await db.query("SELECT count(*)::int n FROM social_plans WHERE origin='conversation'"))
        .rows[0],
    ).toEqual({ n: 1 });
    expect((await livingHistory(client(), user, p.id)).scene.state).toBe("scheduled");
    const before = await db.query("SELECT * FROM social_plans ORDER BY id");
    await syncCalendar(client(), user, new Date("2026-11-05T23:00Z"));
    await client().rpc("calendar_advance", {
      p_user: user,
      p_now: "2026-11-05T23:00Z",
      p_blocked: [],
    });
    expect((await db.query("SELECT * FROM social_plans ORDER BY id")).rows).toEqual(before.rows);
  });
  it("ignores cancellation inferred from old chat or a queued structured character reply", async () => {
    const p = await add();
    const mid = id();
    await db.query(
      "INSERT INTO messages(id,user_id,conversation_id,sender,body) VALUES($1,$2,$3,'tess','I cannot make it; cancel our coffee.')",
      [mid, user, conv],
    );
    const r = await client().rpc("calendar_apply", {
      p_user: user,
      p_message: mid,
      p_payload: { action: "cancel", planId: p.id },
      p_now: now.toISOString(),
    });
    expect(r.error).toBeNull();
    await client().rpc("calendar_apply_actions", {
      p_user: user,
      p_kind: "message",
      p_source: mid,
      p_actions: [{ action: "cancel", planId: p.id }],
      p_now: now.toISOString(),
    });
    expect((await db.query("SELECT status FROM social_plans WHERE id=$1", [p.id])).rows[0]).toEqual(
      { status: "accepted" },
    );
    expect(
      await prepareScheduleActions(
        client(),
        user,
        conv,
        { messages: ["I've canceled it in the calendar"], schedule_actions: [] },
        now,
      ),
    ).toEqual([]);
    await syncExperienceScheduling(client(), user, p.id, now);
  });
  it("allows an explicit cancellation without sending a chat and rejects stale edits or cross-user writes", async () => {
    const p = await add();
    await expect(
      saveManualCalendar(
        client(),
        other,
        { id: id(), conversationId: conv, confirmed: true, plan: draft() },
        now,
      ),
    ).rejects.toThrow();
    await expect(
      saveManualCalendar(
        client(),
        user,
        {
          id: id(),
          conversationId: conv,
          planId: p.id,
          version: 999,
          confirmed: true,
          plan: draft({ action: "cancel", planId: p.id }),
        },
        now,
      ),
    ).rejects.toThrow();
    const row = (
      await db.query<{ version: number }>("SELECT version FROM social_plans WHERE id=$1", [p.id])
    ).rows[0]!;
    const result = await saveManualCalendar(
      client(),
      user,
      {
        id: id(),
        conversationId: conv,
        planId: p.id,
        version: row.version,
        confirmed: false,
        plan: draft({ action: "cancel", planId: p.id }),
      },
      now,
    );
    expect(result.status).toBe("cancelled");
    expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 0 });
  });
  it("protects interactive ownership from manual edits", async () => {
    const p = await add();
    await experienceCommand(
      client(),
      user,
      p.id,
      id(),
      "claim",
      null,
      {},
      new Date("2026-10-25T19:01Z"),
    );
    const row = (
      await db.query<{ version: number }>("SELECT version FROM social_plans WHERE id=$1", [p.id])
    ).rows[0]!;
    await expect(
      saveManualCalendar(
        client(),
        user,
        {
          id: id(),
          conversationId: conv,
          planId: p.id,
          version: row.version,
          confirmed: false,
          plan: draft({ action: "cancel", planId: p.id }),
        },
        now,
      ),
    ).rejects.toThrow();
    expect((await livingHistory(client(), user, p.id)).scene.state).toBe("interactive");
  });
});

it("keeps incomplete arrangements pending, detects overlap and rejects DST gaps", async () => {
  expect((await add({ time: null })).status).toBe("awaiting_details");
  const first = await add();
  expect(first.status).toBe("accepted");
  const conflict = await add({ title: "Overlapping coffee" });
  expect(conflict.status).toBe("proposed");
  expect(
    (
      await db.query<{ conflicts: unknown[] }>("SELECT conflicts FROM social_plans WHERE id=$1", [
        conflict.id,
      ])
    ).rows[0]!.conflicts,
  ).toContain("calendar_or_travel_overlap");
  await expect(add({ date: "2026-03-08", time: "02:30" })).rejects.toThrow("daylight saving");
});
it("updates the same plan after explicit agreement without generating a message", async () => {
  const p = await add();
  const row = (
    await db.query<{ version: number }>("SELECT version FROM social_plans WHERE id=$1", [p.id])
  ).rows[0]!;
  const changed = await saveManualCalendar(
    client(),
    user,
    {
      id: id(),
      conversationId: conv,
      planId: p.id,
      version: row.version,
      confirmed: true,
      plan: draft({ action: "details", planId: p.id, time: "16:00" }),
    },
    now,
  );
  expect(changed.id).toBe(p.id);
  expect(changed.status).toBe("accepted");
  expect(
    (await db.query("SELECT time_local,status FROM social_plans WHERE id=$1", [p.id])).rows[0],
  ).toEqual({ time_local: "16:00", status: "accepted" });
  expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 0 });
});

it("saves a plan at the player's own home without any guest invitation message", async () => {
  await client().rpc("housing_seed" as never, { p_user: user } as never);
  const home = (
    await db.query<{ place_key: string }>(
      "SELECT r.place_key FROM housing_memberships m JOIN housing_residences r ON r.id=m.residence_id WHERE m.user_id=$1 AND m.person_key='user' AND m.kind='primary' AND m.ended_at IS NULL",
      [user],
    )
  ).rows[0];
  expect(home?.place_key).toMatch(/^home:/);
  const p = await add({
    title: "Board games at my place",
    category: "games",
    place: home!.place_key,
    date: "2026-11-02",
    time: "12:00",
  });
  expect(p.status).toBe("accepted");
  expect(
    (await db.query("SELECT place_key FROM social_plans WHERE id=$1", [p.id])).rows[0],
  ).toEqual({ place_key: home!.place_key });
});

it("preserves existing plan rows and memories during migration", () => {
  expect(migrationPreserved).toBe(true);
});

it("maintains companion presence without starting a plan until an explicit venue action", async () => {
  await db.exec("UPDATE experience_settings SET enabled=false");
  const p = await add();
  const at = "2026-10-25T19:05Z";
  await client().rpc("calendar_advance", { p_user: user, p_now: at, p_blocked: [] });
  expect((await db.query("SELECT status FROM social_plans WHERE id=$1", [p.id])).rows[0]).toEqual({
    status: "accepted",
  });
  expect(
    (await db.query("SELECT place_key FROM social_presence WHERE user_id=$1", [user])).rows[0],
  ).toEqual({ place_key: "coffee:local" });
  await db.query(
    "INSERT INTO town_presence(user_id,place_key,arrives_at) VALUES($1,'coffee:local',$2)",
    [user, at],
  );
  const result = await client().rpc("venue_act", {
    p_user: user,
    p_id: id(),
    p_place: "coffee:local",
    p_action: "seat",
    p_detail: "",
    p_now: at,
    p_plan: p.id,
    p_quantity: 1,
  });
  expect(result.error).toBeNull();
  expect(
    (await db.query("SELECT status,user_attendance FROM social_plans WHERE id=$1", [p.id])).rows[0],
  ).toEqual({ status: "in_progress", user_attendance: "arrived" });
  expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 0 });
});
