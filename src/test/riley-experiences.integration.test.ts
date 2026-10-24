// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase } from "./pglite-supabase";

let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001";
const conv = "20000000-0000-4000-a000-000000000001";
const plan = "30000000-0000-4000-a000-000000000001";
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec("CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$");
  for (const file of ["0024_verify_phone_calls", "0025_living_experiences", "0026_complete_living_experiences"])
    await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
  await db.exec(readFileSync("docs/sql/20261024_riley_living_experiences.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/20261024_riley_night_shift.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`SET request.jwt.claim.role='service_role';
    TRUNCATE conversations CASCADE; TRUNCATE world_places CASCADE;
    UPDATE experience_settings SET enabled=true, installed_at='2026-10-24T00:00:00Z';
    INSERT INTO conversations(id,user_id,character_id,real_time_mode) SELECT '${conv}','${user}',id,true FROM characters WHERE key='riley';
    INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES('${user}','coffee:local','Switchyard Coffee','cafe','{}');
    INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,status,origin,conversation_id,category,date_local,time_local,user_response,character_response)
    VALUES('${user}','${plan}','riley','coffee:local','Coffee together','2026-10-26T11:00:00Z','2026-10-26T12:00:00Z','accepted','conversation','${conv}','coffee','2026-10-26','07:00','accepted','accepted');`);
});
describe("Riley outing access and ownership", () => {
  it("creates exactly one unstarted Riley experience without changing attendance or history", async () => {
    await db.query("SELECT experience_seed($1,'2026-10-24T16:00:00Z')", [user]);
    await db.query("SELECT experience_seed($1,'2026-10-24T16:00:00Z')", [user]);
    expect((await db.query("SELECT state,revision,claimed_at,mode,outcome_id FROM living_experiences")).rows).toEqual([
      { state: "scheduled", revision: 0, claimed_at: null, mode: null, outcome_id: null },
    ]);
    expect((await db.query("SELECT status,user_attendance FROM social_plans")).rows).toEqual([{ status: "accepted", user_attendance: "not_reported" }]);
    expect((await db.query("SELECT count(*)::int AS n FROM living_experience_moments")).rows).toEqual([{ n: 0 }]);
  });
  it.each(["calendar_advance", "venue_reconcile_departures"])("%s preserves Riley plans even before an experience has been seeded", async (processor) => {
    await db.query(`SELECT ${processor}($1,'2026-10-27T16:00:00Z')`, [user]);
    expect((await db.query("SELECT status FROM social_plans")).rows).toEqual([{ status: "accepted" }]);
  });
  it.each(["completed", "missed"])("prevents legacy writers from marking Riley %s", async (status) => {
    await expect(db.query("UPDATE social_plans SET status=$1 WHERE id=$2", [status, plan])).rejects.toThrow("Living Experience owns completion");
  });
  it("keeps experience seeding restricted to the service role", async () => {
    await db.exec("SET request.jwt.claim.role='authenticated'");
    try {
      await expect(db.query("SELECT experience_seed($1,now())", [user])).rejects.toThrow("service role required");
    } finally { await db.exec("RESET request.jwt.claim.role"); }
  });
  it("restores Tess's noon outing by correcting only the companion and leaving it unstarted", async () => {
    await db.exec(`UPDATE conversations SET character_id=(SELECT id FROM characters WHERE key='tess') WHERE id='${conv}';
      UPDATE social_plans SET organizer='user',title='Lunch',status='in_progress',starts_at='2026-10-24T16:00:00Z',ends_at='2026-10-24T17:30:00Z',date_local='2026-10-24',time_local='12:00' WHERE id='${plan}';`);
    await db.query("SELECT experience_seed($1,'2026-10-24T16:15:00Z')", [user]);
    expect((await db.query("SELECT count(*)::int AS n FROM living_experiences")).rows).toEqual([{ n: 0 }]);
    await db.query(`UPDATE social_plans p SET organizer=ch.key FROM conversations c JOIN characters ch ON ch.id=c.character_id
      WHERE p.id=$1 AND p.user_id=$2 AND p.conversation_id=c.id AND c.user_id=p.user_id AND ch.key='tess' AND p.organizer='user'`, [plan, user]);
    await db.query("SELECT experience_seed($1,'2026-10-24T16:15:00Z')", [user]);
    expect((await db.query("SELECT organizer,status,time_local,user_attendance FROM social_plans")).rows).toEqual([
      { organizer: "tess", status: "in_progress", time_local: "12:00", user_attendance: "not_reported" },
    ]);
    expect((await db.query("SELECT state,claimed_at,revision FROM living_experiences")).rows).toEqual([
      { state: "scheduled", claimed_at: null, revision: 0 },
    ]);
  });
});