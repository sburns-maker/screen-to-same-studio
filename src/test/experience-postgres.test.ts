// @vitest-environment node
// Opt in with PHASE6_TEST_DATABASE_URL pointing ONLY to a disposable local database.
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
const url = process.env["PHASE6_TEST_DATABASE_URL"];
const suite = url ? describe : describe.skip;
const user = "10000000-0000-4000-a000-000000000001",
  conv = "20000000-0000-4000-a000-000000000001",
  plan = "30000000-0000-4000-a000-000000000001";
const now = "2026-10-25T18:00:00Z";
let sql: ReturnType<typeof postgres>;
suite("PostgreSQL 17 multi-connection ownership and transaction tests", () => {
  beforeAll(async () => {
    if (
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      !new URL(url).pathname.endsWith("/phase6_tests")
    )
      throw new Error("Use a disposable localhost /phase6_tests database only");
    sql = postgres(url, { max: 6, onnotice: () => undefined });
    await sql.unsafe(`DO $$ BEGIN CREATE ROLE anon;EXCEPTION WHEN duplicate_object THEN NULL;END $$; DO $$ BEGIN CREATE ROLE authenticated;EXCEPTION WHEN duplicate_object THEN NULL;END $$; DO $$ BEGIN CREATE ROLE service_role BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END $$;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid,bucket_id text,name text);CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;`);
    // The isolated transaction fixture does not install the separate voice module.
    // Migration 0030 updates this existing production table's constraint.
    await sql.unsafe(
      "CREATE TABLE IF NOT EXISTS public.character_voices (character_key text CONSTRAINT character_voices_character_key_check CHECK (character_key IN ('tess','maya','claire','jordan','ben')))",
    );
    for (const file of readdirSync("drizzle/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await sql.unsafe(readFileSync(`drizzle/migrations/${file}`, "utf8"));
  }, 30000);
  afterAll(async () => {
    await sql?.end();
  });
  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE conversations CASCADE;TRUNCATE world_places CASCADE;TRUNCATE shared_events CASCADE;TRUNCATE character_knowledge;
 UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00:00Z';
 INSERT INTO conversations(id,user_id,character_id) SELECT '${conv}','${user}',id FROM characters WHERE key='maya';
 INSERT INTO tess_state(conversation_id,user_id) VALUES('${conv}','${user}');
 INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES('${user}','coffee:local','Switchyard Coffee','cafe','{"public":true}');
 INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,status,origin,conversation_id,category) VALUES('${user}','${plan}','maya','coffee:local','Coffee','${now}','2026-10-25T19:00:00Z','accepted','conversation','${conv}','coffee');
 SELECT experience_seed('${user}','${now}');`);
  });
  const command = (
    connection: Pick<typeof sql, "unsafe">,
    action: string,
    id = crypto.randomUUID(),
    at = now,
    payload: Record<string, unknown> = {},
  ) =>
    connection.unsafe(`SELECT experience_command($1,$2,$3,$4,NULL,$5::jsonb,$6) result`, [
      user,
      plan,
      id,
      action,
      sql.json(payload as never),
      at,
    ]);
  async function race(first: string, second: string) {
    let unlock!: () => void, locked!: () => void;
    const gate = new Promise<void>((r) => (unlock = r)),
      ready = new Promise<void>((r) => (locked = r));
    const winner = sql.begin(async (tx) => {
      const r = await command(
        tx as unknown as Pick<typeof sql, "unsafe">,
        first,
        undefined,
        first === "automatic" ? "2026-10-25T22:00:00Z" : now,
      );
      locked();
      await gate;
      return r;
    });
    await ready;
    const loser = command(
      sql,
      second,
      undefined,
      second === "automatic" ? "2026-10-25T22:00:00Z" : now,
    ).then(
      () => ({ ok: true }),
      (e) => ({ ok: false, error: e.message }),
    );
    // Query the server's lock table; do not infer contention from Promise order.
    let waiting = false;
    for (let n = 0; n < 30 && !waiting; n++) {
      const rows =
        await sql`SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%experience_command%'`;
      waiting = rows[0]!["n"] > 0;
      await new Promise((r) => setTimeout(r, 5));
    }
    unlock();
    await winner;
    expect(waiting).toBe(true);
    expect((await loser).ok).toBe(false);
  }
  it("interactive claim beats a blocked worker transaction", async () => {
    await race("claim", "automatic");
    const r = await sql`SELECT state FROM living_experiences`;
    expect(r[0]!["state"]).toBe("interactive");
  });
  it("worker claim beats a blocked player transaction", async () => {
    await race("automatic", "claim");
    const r = await sql`SELECT state FROM living_experiences`;
    expect(r[0]!["state"]).toBe("auto_running");
  });
  it("duplicate concurrent completions commit exactly one outcome, memory and transition", async () => {
    await command(sql, "claim");
    const job = crypto.randomUUID();
    const r = await command(sql, "finish", job);
    const token = r[0]!["result"].operation.token;
    const payload = {
      token,
      body: "A quiet coffee outing finished without new commitments.",
      delta: { trust: 2 },
    };
    await Promise.all([
      command(sql, "commit", job, now, payload),
      command(sql, "commit", job, now, payload),
    ]);
    for (const table of ["memories", "shared_events", "calendar_transitions"]) {
      const n = await sql.unsafe(`SELECT count(*)::int n FROM ${table}`);
      expect(n[0]!["n"]).toBe(table === "memories" ? 2 : 1);
    }
  });
  it("failure in reconciliation rolls back outcome, plan, memories and job together", async () => {
    await command(sql, "claim");
    const job = crypto.randomUUID();
    const r = await command(sql, "finish", job);
    const token = r[0]!["result"].operation.token;
    await sql.unsafe(
      "CREATE FUNCTION test_fail_outcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test reconciliation failure'; END $$;CREATE TRIGGER test_fail_outcome BEFORE INSERT ON memories FOR EACH ROW EXECUTE FUNCTION test_fail_outcome();",
    );
    try {
      await expect(
        command(sql, "commit", job, now, { token, body: "A quiet coffee outing ended." }),
      ).rejects.toThrow("reconciliation");
      const e = await sql`SELECT state,outcome_id FROM living_experiences`;
      expect(e[0]!["state"]).toBe("interactive");
      expect(e[0]!["outcome_id"]).toBeNull();
      expect((await sql`SELECT status FROM social_plans`)[0]!["status"]).toBe("in_progress");
      expect((await sql`SELECT status FROM experience_operations`)[0]!["status"]).toBe("running");
    } finally {
      await sql.unsafe(
        "DROP TRIGGER test_fail_outcome ON memories;DROP FUNCTION test_fail_outcome();",
      );
    }
  });
  it("authenticated clients cannot invoke service RPCs and RLS hides other-user rows", async () => {
    await command(sql, "claim");
    await sql.begin(async (tx) => {
      await tx.unsafe(
        `SET LOCAL ROLE authenticated;SET LOCAL "request.jwt.claim.role"='authenticated';SET LOCAL "request.jwt.claim.sub"='10000000-0000-4000-a000-000000000002';`,
      );
      expect((await tx`SELECT * FROM living_experiences`).length).toBe(0);
    });
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await command(tx as unknown as Pick<typeof sql, "unsafe">, "pause");
      }),
    ).rejects.toThrow("permission denied");
  });
  it("simultaneous acceptances by two contacts cannot double-book the player", async () => {
    await sql.unsafe("TRUNCATE social_plans CASCADE");
    const otherConv = crypto.randomUUID();
    await sql.unsafe(
      "INSERT INTO conversations(id,user_id,character_id) SELECT $1,$2,id FROM characters WHERE key='claire'",
      [otherConv, user],
    );
    const targets: string[] = [];
    for (const conversation of [conv, otherConv]) {
      const source = crypto.randomUUID();
      await sql.unsafe(
        "INSERT INTO messages(id,user_id,conversation_id,sender,body,visible_at,created_at) VALUES($1,$2,$3,'tess','Would you like coffee tomorrow at two?',$4,$4)",
        [source, user, conversation, now],
      );
      const r = await sql.unsafe(
        "SELECT calendar_event_action($1,'message',$2,1,$3::jsonb,$4) result",
        [
          user,
          source,
          sql.json({
            action: "invite",
            title: "Coffee",
            category: "coffee",
            date: "2026-10-26",
            time: "14:00",
            place: "coffee:local",
            schedule_ok: true,
          }),
          now,
        ],
      );
      targets.push(r[0]!["result"].id);
    }
    const accepts = await Promise.all(
      [conv, otherConv].map(async (conversation) => {
        const source = crypto.randomUUID();
        await sql.unsafe(
          "INSERT INTO messages(id,user_id,conversation_id,sender,body,visible_at,created_at) VALUES($1,$2,$3,'user','Absolutely.',$4,$4)",
          [source, user, conversation, now],
        );
        return source;
      }),
    );
    const apply = (connection: Pick<typeof sql, "unsafe">, index: number) =>
      connection.unsafe("SELECT calendar_event_action($1,'message',$2,1,$3::jsonb,$4) result", [
        user,
        accepts[index]!,
        sql.json({ action: "accept", planId: targets[index], schedule_ok: true }),
        now,
      ]);
    let release!: () => void, holding!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      held = new Promise<void>((r) => (holding = r));
    const first = sql.begin(async (tx) => {
      const r = await apply(tx as unknown as Pick<typeof sql, "unsafe">, 0);
      holding();
      await gate;
      return r;
    });
    await held;
    const second = apply(sql, 1).then((result) => result);
    let waiting = false;
    for (let n = 0; n < 30 && !waiting; n++) {
      const rows =
        await sql`SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%calendar_event_action%'`;
      waiting = rows[0]!["n"] > 0;
      await new Promise((r) => setTimeout(r, 5));
    }
    release();
    await first;
    await second;
    expect(waiting).toBe(true);
    const rows = await sql`SELECT status,conflicts FROM social_plans ORDER BY status`;
    expect(rows.map((p) => p["status"])).toEqual(["accepted", "proposed"]);
    expect(rows[1]!["conflicts"]).toContain("calendar_or_travel_overlap");
  });
  it("invalid scheduling in a generated experience rolls back the scene and its operation", async () => {
    await command(sql, "claim");
    const job = crypto.randomUUID();
    const reserved = await command(sql, "turn", job, now, {
      body: "Could we get dinner afterward?",
    });
    const token = reserved[0]!["result"].operation.token;
    await expect(
      command(sql, "commit", job, now, {
        token,
        body: "A scene line with an invalid schedule target.",
        scheduleActions: [{ action: "accept", planId: crypto.randomUUID(), schedule_ok: true }],
      }),
    ).rejects.toThrow("owned conversation event");
    expect(
      (await sql`SELECT status FROM experience_operations WHERE id=${job}`)[0]!["status"],
    ).toBe("running");
    expect(
      (await sql`SELECT source FROM living_experience_moments`).map((m) => m["source"]),
    ).toEqual(["user"]);
    expect((await sql`SELECT * FROM calendar_action_receipts`).length).toBe(0);
    await command(sql, "commit", job, now, {
      token,
      body: "We can discuss a place first.",
      scheduleActions: [],
    });
    // A changed replay cannot introduce effects after the scene was already committed.
    await command(sql, "commit", job, now, {
      token,
      body: "changed",
      scheduleActions: [{ action: "accept", planId: crypto.randomUUID() }],
    });
    expect((await sql`SELECT * FROM calendar_action_receipts`).length).toBe(0);
  });
});
