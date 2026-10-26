// Opt in only against a disposable local housing_tests database.
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
const url = process.env["HOUSING_TEST_DATABASE_URL"],
  suite = url ? describe : describe.skip;
const user = "10000000-0000-4000-a000-000000000001",
  conv = "20000000-0000-4000-a000-000000000001",
  now = "2026-10-26T17:00:00Z";
let sql: ReturnType<typeof postgres>;
suite("PostgreSQL housing locks, consent and default ACLs", () => {
  beforeAll(async () => {
    if (
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      !new URL(url).pathname.endsWith("/housing_tests")
    )
      throw new Error("Disposable localhost housing_tests only");
    sql = postgres(url, { max: 6, onnotice: () => undefined });
    await sql.unsafe(`DO $$BEGIN CREATE ROLE anon;EXCEPTION WHEN duplicate_object THEN NULL;END$$;DO $$BEGIN CREATE ROLE authenticated;EXCEPTION WHEN duplicate_object THEN NULL;END$$;DO $$BEGIN CREATE ROLE service_role BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text,name text);CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$SELECT string_to_array($1,'/')$$;
 CREATE TABLE character_voices(character_key text CONSTRAINT character_voices_character_key_check CHECK(character_key IN('tess','maya','claire','jordan','ben')));
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`);
    for (const f of readdirSync("drizzle/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await sql.unsafe(readFileSync(`drizzle/migrations/${f}`, "utf8"));
  }, 30000);
  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE housing_people,housing_events,housing_receipts,housing_goals,housing_action_outbox CASCADE;TRUNCATE conversations CASCADE;TRUNCATE world_places CASCADE;TRUNCATE shared_events CASCADE;TRUNCATE character_knowledge;
 INSERT INTO conversations(id,user_id,character_id) SELECT '${conv}','${user}',id FROM characters WHERE key='tess';SELECT housing_seed('${user}');INSERT INTO user_profile(user_id,key,value) VALUES('${user}','housing_adult_confirmed','true') ON CONFLICT(user_id,key) DO UPDATE SET value='true';`);
  });
  afterAll(async () => {
    await sql?.end();
  });
  const command = (
    c: Pick<typeof sql, "unsafe">,
    actor: string,
    action: string,
    payload: Record<string, unknown>,
    id = crypto.randomUUID(),
  ) =>
    c.unsafe("SELECT housing_command($1,$2,$3,$4,$5::jsonb,$6) result", [
      user,
      id,
      actor,
      action,
      sql.json(payload as never),
      now,
    ]);
  async function waitForBlocked(query: string) {
    for (let n = 0; n < 50; n++) {
      const rows =
        await sql`SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${"%" + query + "%"}`;
      if (rows[0]?.["n"] > 0) return true;
      await new Promise((r) => setTimeout(r, 5));
    }
    return false;
  }
  it("serializes competing worker transactions; exactly one move wins and stale origins require review", async () => {
    await command(sql, "user", "new_home", { label: "First", movers: ["user"], startsAt: now });
    await command(sql, "user", "new_home", {
      label: "Second",
      movers: ["user"],
      startsAt: "2026-10-26T20:00:00Z",
    });
    let unlock!: () => void, locked!: () => void;
    const gate = new Promise<void>((r) => (unlock = r)),
      ready = new Promise<void>((r) => (locked = r));
    const first = sql.begin(async (tx) => {
      const result = await tx.unsafe("SELECT housing_tick($1,$2,'[]'::jsonb) n", [
        user,
        "2026-10-26T22:00:00Z",
      ]);
      locked();
      await gate;
      return result;
    });
    await ready;
    const second = sql
      .unsafe("SELECT housing_tick($1,$2,'[]'::jsonb) n", [user, "2026-10-26T22:00:00Z"])
      .then((r) => r[0]?.["n"]);
    const blocked = await waitForBlocked("housing_tick");
    unlock();
    await first;
    expect(blocked).toBe(true);
    expect(await second).toBe(0);
    expect(
      (
        await sql`SELECT count(*)::int n FROM housing_memberships WHERE person_key='user' AND kind='primary' AND ended_at IS NULL`
      )[0]?.["n"],
    ).toBe(1);
    expect(
      (await sql`SELECT status FROM housing_proposals ORDER BY starts_at`).map((r) => r["status"]),
    ).toEqual(["completed", "needs_review"]);
    expect(
      (await sql`SELECT count(*)::int n FROM shared_events WHERE kind='housing'`)[0]?.["n"],
    ).toBe(1);
  });
  it("fences simultaneous responses with a revision; a late decline cannot overwrite consent", async () => {
    const result = await command(sql, "user", "propose_move", {
      place: "home:tess",
      movers: ["user"],
      startsAt: now,
    });
    const proposalId = result[0]?.["result"].proposalId;
    let unlock!: () => void, locked!: () => void;
    const gate = new Promise<void>((r) => (unlock = r)),
      ready = new Promise<void>((r) => (locked = r));
    const first = sql.begin(async (tx) => {
      await command(tx as unknown as Pick<typeof sql, "unsafe">, "tess", "respond", {
        proposalId,
        version: 0,
        accept: true,
      });
      locked();
      await gate;
    });
    await ready;
    const second = command(sql, "tess", "respond", { proposalId, version: 0, accept: false }).then(
      () => false,
      (e) => String(e.message).includes("current housing proposal"),
    );
    const blocked = await waitForBlocked("housing_command");
    unlock();
    await first;
    expect(blocked).toBe(true);
    expect(await second).toBe(true);
    expect((await sql`SELECT responses->>'tess' r FROM housing_proposals`)[0]?.["r"]).toBe(
      "accepted",
    );
  });
  it("denies inherited anonymous/authenticated table and function privileges", async () => {
    const rows =
      await sql`SELECT has_table_privilege('anon','housing_residences','select') a,has_table_privilege('authenticated','housing_memberships','update') b,has_function_privilege('authenticated','housing_snapshot(uuid,text)','execute') c`;
    expect(rows[0]).toEqual({ a: false, b: false, c: false });
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx.unsafe("SELECT housing_snapshot($1,'user')", [user]);
      }),
    ).rejects.toThrow("permission denied");
  });
  it("cannot advance a player-pending cohabitation proposal despite retries", async () => {
    await command(sql, "user", "disclose", {
      place: "home:user",
      viewer: "tess",
      permission: "visit",
    });
    await command(sql, "tess", "propose_move", {
      place: "home:user",
      movers: ["tess", "user"],
      startsAt: now,
    });
    await sql.unsafe("SELECT housing_tick($1,$2,'[]'::jsonb)", [user, now]);
    expect((await sql`SELECT housing_primary(${user},'tess') home`)[0]?.["home"]).toBe("home:tess");
  });
});
