// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase } from "./pglite-supabase";

let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001";
const other = "10000000-0000-4000-a000-000000000002";
const trip = "20000000-0000-4000-a000-000000000001";
async function asRole<T>(role: "anon" | "authenticated" | "service_role", run: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  try { return await run(); } finally { await db.exec("reset role"); }
}
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(`grant usage on schema public, auth to anon, authenticated, service_role;
    create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$ select current_user::text $$;
    grant all on public.interactive_world_installation, public.phone_contacts to anon;`);
  const before = await db.query("select * from interactive_world_installation");
  await db.exec("drop policy phone_contacts_signed_in_read on phone_contacts");
  await db.exec(readFileSync("docs/sql/20261024_internal_lookup_security.sql", "utf8"));
  expect((await db.query("select * from interactive_world_installation")).rows).toEqual(before.rows);
  await db.exec(readFileSync("docs/sql/20261024_travel_trips.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("internal lookup access without breaking existing services", () => {
  it("denies anonymous reads and writes to both internal tables", async () => {
    await asRole("anon", async () => {
      for (const table of ["phone_contacts", "interactive_world_installation"]) {
        await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`delete from ${table}`)).rejects.toThrow(/permission denied/);
      }
    });
  });
  it("preserves signed-in phone numbers but denies directory changes", async () => {
    await asRole("authenticated", async () => {
      const { rows } = await db.query("select extension from phone_contacts where entity_key='tess'");
      expect(rows).toEqual([{ extension: 100 }]);
      await expect(db.query("update phone_contacts set extension=199 where entity_key='tess'")).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into phone_contacts values('intruder',199)")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from phone_contacts where entity_key='tess'")).rejects.toThrow(/permission denied/);
    });
  });
  it("keeps world installation inaccessible to signed-in clients", async () => {
    await asRole("authenticated", async () => {
      await expect(db.query("select * from interactive_world_installation")).rejects.toThrow(/permission denied/);
      await expect(db.query("update interactive_world_installation set installed_at=now()")).rejects.toThrow(/permission denied/);
    });
  });
  it("preserves service reads and the existing phone/calendar probes", async () => {
    await asRole("service_role", async () => {
      expect((await db.query("select * from interactive_world_installation")).rows).toHaveLength(1);
      expect((await db.query("select * from phone_contacts")).rows).toHaveLength(15);
      expect((await db.query("select phone_status() as version")).rows).toEqual([{ version: 23 }]);
      expect((await db.query("select calendar_pending($1,now()) as pending", [user])).rows).toEqual([{ pending: [] }]);
    });
  });
});
describe("travel storage owner permissions", () => {
  it("lets an owner save and read a trip and its journal", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await asRole("authenticated", async () => {
      await db.query("insert into travel_trips(id,user_id,title,origin,destination,mode,purpose) values($1,$2,'Permission test','Altoona','Pittsburgh','road_trip','vacation')", [trip,user]);
      await db.query("insert into travel_trip_moments(id,user_id,trip_id,stop_id,day,body) values($1,$2,$3,'stop',1,'Test journal')", [crypto.randomUUID(),user,trip]);
      expect((await db.query("select title,status from travel_trips")).rows).toEqual([{ title: "Permission test", status: "idea" }]);
      expect((await db.query("select body from travel_trip_moments")).rows).toEqual([{ body: "Test journal" }]);
    });
  });
  it("hides another owner's trips and prevents cross-owner journal writes", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await asRole("authenticated", async () => {
      expect((await db.query("select * from travel_trips")).rows).toHaveLength(0);
      expect((await db.query("select * from travel_trip_moments")).rows).toHaveLength(0);
      await expect(db.query("insert into travel_trip_moments(id,user_id,trip_id,stop_id,day,body) values($1,$2,$3,'stop',1,'Forbidden')", [crypto.randomUUID(),other,trip])).rejects.toThrow(/row-level security/);
    });
  });
});