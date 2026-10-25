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
  it("simultaneous explicit agreements cannot double-book the player", async () => {
    await sql.unsafe("TRUNCATE social_plans CASCADE");
    const otherConv = crypto.randomUUID();
    await sql.unsafe(
      "INSERT INTO conversations(id,user_id,character_id) SELECT $1,$2,id FROM characters WHERE key='claire'",
      [otherConv, user],
    );
    const targets: string[] = [];
    for (const conversation of [conv, otherConv]) {
      const rows = await sql.unsafe(
        "SELECT calendar_manual_action($1,$2,$3,NULL,NULL,$4::jsonb,$5) result",
        [
          user,
          crypto.randomUUID(),
          conversation,
          sql.json({
            action: "invite",
            title: "Coffee",
            category: "coffee",
            date: "2026-10-26",
            time: "14:00",
            place: "coffee:local",
            schedule_ok: true,
            confirmed: false,
          }),
          now,
        ],
      );
      targets.push(rows[0]!["result"].id);
    }
    const actions = [crypto.randomUUID(), crypto.randomUUID()];
    const apply = (connection: Pick<typeof sql, "unsafe">, index: number) =>
      connection.unsafe("SELECT calendar_manual_action($1,$2,$3,$4,1,$5::jsonb,$6) result", [
        user,
        actions[index]!,
        [conv, otherConv][index]!,
        targets[index]!,
        sql.json({ action: "accept", planId: targets[index], schedule_ok: true, confirmed: true }),
        now,
      ]);
    let release!: () => void, holding!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      held = new Promise<void>((r) => (holding = r));
    const first = sql.begin(async (tx) => {
      const result = await apply(tx as unknown as Pick<typeof sql, "unsafe">, 0);
      holding();
      await gate;
      return result;
    });
    await held;
    const second = apply(sql, 1).then((result) => result);
    let waiting = false;
    for (let n = 0; n < 30 && !waiting; n++) {
      const rows =
        await sql`SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%calendar_manual_action%'`;
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
    expect((await sql`SELECT count(*)::int n FROM messages`)[0]!["n"]).toBe(0);
  });
  it("queued AI scheduling cannot mutate plans or block an in-person reply", async () => {
    await command(sql, "claim");
    const job = crypto.randomUUID();
    const reserved = await command(sql, "turn", job, now, {
      body: "Could we get dinner afterward?",
    });
    const token = reserved[0]!["result"].operation.token;
    await command(sql, "commit", job, now, {
      token,
      body: "We can discuss a place first.",
      scheduleActions: [{ action: "accept", planId: crypto.randomUUID(), schedule_ok: true }],
    });
    expect(
      (await sql`SELECT status FROM experience_operations WHERE id=${job}`)[0]!["status"],
    ).toBe("done");
    expect(
      (await sql`SELECT source FROM living_experience_moments ORDER BY ordinal`).map(
        (m) => m["source"],
      ),
    ).toEqual(["user", "character"]);
    expect((await sql`SELECT status FROM social_plans WHERE id=${plan}`)[0]!["status"]).toBe(
      "in_progress",
    );
    // A changed replay cannot introduce effects after the scene was already committed.
    await command(sql, "commit", job, now, {
      token,
      body: "changed",
      scheduleActions: [{ action: "accept", planId: crypto.randomUUID() }],
    });
    expect((await sql`SELECT * FROM calendar_action_receipts`).length).toBe(0);
  });
  it("deduplicates concurrent live-scene updates and keeps the original venue immutable", async () => {
    await command(sql, "claim");
    const operation = crypto.randomUUID();
    await command(sql, "turn", operation, now, { body: "We arrive at your house." });
    const rows = await sql`SELECT id FROM living_experience_moments WHERE source='user'`;
    const source = rows[0]!["id"];
    const scene = {
      locationKey: "home:maya",
      locationLabel: "Maya's home",
      locationKind: "home",
      area: "outside",
      activity: "arriving",
      participants: ["user", "maya"],
      destinationKey: null,
    };
    const apply = () =>
      sql.unsafe("SELECT experience_scene_apply($1,$2,$3,0,$4::jsonb,$5) result", [
        user,
        plan,
        source,
        sql.json(scene),
        "We arrive at your house.",
      ]);
    const results = await Promise.all([apply(), apply()]);
    expect(results.map((r) => r[0]!["result"].revision)).toEqual([1, 1]);
    expect((await sql`SELECT count(*)::int n FROM experience_scene_transitions`)[0]!["n"]).toBe(1);
    expect((await sql`SELECT place_key FROM social_plans`)[0]!["place_key"]).toBe("coffee:local");
    await sql.begin(async (tx) => {
      await tx.unsafe(
        `SET LOCAL ROLE authenticated;SET LOCAL "request.jwt.claim.sub"='10000000-0000-4000-a000-000000000002';`,
      );
      expect((await tx`SELECT * FROM experience_scene_transitions`).length).toBe(0);
    });
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx.unsafe("SELECT experience_scene_status()");
      }),
    ).rejects.toThrow("permission denied");
  });
  it("requires actual owned character-message evidence for the transient photo-scene projection", async () => {
    const source = crypto.randomUUID();
    await sql.unsafe(
      "INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'tess',$5,$4,$4)",
      [source, user, conv, now, "I'm home now."],
    );
    await sql.unsafe("SELECT character_scene_apply($1,$2,$3,'home','relaxing at home',$4)", [
      user,
      conv,
      source,
      now,
    ]);
    expect((await sql`SELECT location FROM character_scene_state`)[0]!["location"]).toBe("home");
    await expect(
      sql.unsafe("SELECT character_scene_apply($1,$2,$3,'home','relaxing at home',$4)", [
        "10000000-0000-4000-a000-000000000002",
        conv,
        source,
        now,
      ]),
    ).rejects.toThrow("Actual current owned");
  });
  const editPayload = (time = "14:00") => ({
    action: "details",
    planId: plan,
    title: "Coffee and conversation",
    date: "2026-10-25",
    time,
    durationMinutes: 60,
    place: "coffee:local",
    confirmed: true,
    schedule_ok: true,
  });
  async function prepareEdit() {
    await sql.unsafe(
      "UPDATE social_plans SET date_local='2026-10-25',time_local='14:00',duration_minutes=60,user_response='accepted',character_response='accepted' WHERE user_id=$1 AND id=$2",
      [user, plan],
    );
  }
  const editPlan = (action: string, version: number, time = "14:00") =>
    sql.unsafe("SELECT calendar_manual_action($1,$2,$3,$4,$5,$6::jsonb,$7) result", [
      user,
      action,
      conv,
      plan,
      version,
      sql.json(editPayload(time)),
      now,
    ]);
  it("one transaction wins between a reschedule and an interactive claim", async () => {
    await prepareEdit();
    const results = await Promise.allSettled([
      editPlan(crypto.randomUUID(), 0, "15:00"),
      command(sql, "claim"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const p = (await sql`SELECT * FROM social_plans`)[0]!;
    const e = (await sql`SELECT * FROM living_experiences`)[0]!;
    if (e["state"] === "interactive") {
      expect(p["time_local"]).toBe("14:00");
      expect((await sql`SELECT * FROM calendar_action_receipts`).length).toBe(0);
    } else {
      expect(p["time_local"]).toBe("15:00");
      expect(p["character_response"]).toBe("accepted");
      expect(p["status"]).toBe("accepted");
    }
  });
  it("deduplicates concurrent edit receipts and synchronizes an unclaimed experience atomically", async () => {
    await prepareEdit();
    const action = crypto.randomUUID();
    const results = await Promise.all([editPlan(action, 0), editPlan(action, 0)]);
    expect(results[0]![0]!["result"].id).toBe(plan);
    expect(results[1]![0]!["result"].id).toBe(plan);
    expect((await sql`SELECT count(*)::int n FROM calendar_action_receipts`)[0]!["n"]).toBe(1);
    const p = (await sql`SELECT * FROM social_plans`)[0]!;
    const e = (await sql`SELECT * FROM living_experiences`)[0]!;
    expect(e["plan_version"]).toBe(p["version"]);
    expect((await sql`SELECT count(*)::int n FROM messages`)[0]!["n"]).toBe(0);
    await expect(editPlan(crypto.randomUUID(), 0)).rejects.toThrow("plan changed");
  });
  it("restricts manual-edit RPC permissions and rejects cross-owner plans", async () => {
    await prepareEdit();
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx.unsafe("SELECT calendar_manual_status()");
      }),
    ).rejects.toThrow("permission denied");
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx.unsafe("SELECT calendar_manual_action(NULL,NULL,NULL,NULL,NULL,'{}',now())");
      }),
    ).rejects.toThrow("permission denied");
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx.unsafe("SELECT * FROM calendar_manual_actions");
      }),
    ).rejects.toThrow("permission denied");
    await expect(
      sql.unsafe("SELECT calendar_manual_action($1,$3,$6,$2,0,$4::jsonb,$5)", [
        "10000000-0000-4000-a000-000000000002",
        plan,
        crypto.randomUUID(),
        sql.json(editPayload()),
        now,
        conv,
      ]),
    ).rejects.toThrow("owned contact required");
  });
});
