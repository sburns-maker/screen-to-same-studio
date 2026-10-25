import { COMMENT_VARIANTS, withoutReviewedComments } from "./migration-comment-variants";
// @vitest-environment node
// Only disposable localhost /migration_compat_tests is accepted. Never production credentials.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const url = process.env["MIGRATION_COMPAT_TEST_DATABASE_URL"];
const suite = url ? describe : describe.skip;
const currentJournal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8"));
// These archive-compatibility assertions target the reviewed 0034→0042 repair,
// whose purpose is to preserve calendar38 bodies. Later intentional changes are
// tested below against the real full migration folder, never relaxed here.
const journal = {
  ...currentJournal,
  entries: currentJournal.entries.filter((e: { idx: number }) => e.idx <= 42),
};
const archiveFolder = url ? mkdtempSync(join(tmpdir(), "calendar42-compat-")) : null;
if (archiveFolder) {
  mkdirSync(join(archiveFolder, "meta"));
  writeFileSync(join(archiveFolder, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries)
    copyFileSync(`drizzle/migrations/${entry.tag}.sql`, join(archiveFolder, `${entry.tag}.sql`));
}
const files = readMigrationFiles({ migrationsFolder: archiveFolder ?? "drizzle/migrations" });
const user = "10000000-0000-4000-a000-000000000001",
  conv = "20000000-0000-4000-a000-000000000001",
  plan = "30000000-0000-4000-a000-000000000001",
  at = "2026-10-25T18:00Z";
let sql: ReturnType<typeof postgres>;
function original(tag: string) {
  const text = readFileSync(`drizzle/migrations/${tag}.sql`, "utf8"),
    marker = `$original_${tag.slice(0, 4)}$`;
  return text.includes(marker) ? text.split(marker)[1]! : text;
}
async function base(to: number) {
  for (const e of journal.entries.filter((e: { idx: number }) => e.idx <= to))
    await sql.unsafe(original(e.tag));
}
async function ledger34() {
  await sql.unsafe(
    "CREATE SCHEMA drizzle;CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
  );
  for (const e of journal.entries.filter((e: { idx: number }) => e.idx <= 34))
    await sql`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${createHash("sha256").update(original(e.tag)).digest("hex")},${e.when})`;
}
async function run() {
  try {
    await migrate(drizzle(sql), { migrationsFolder: archiveFolder ?? "drizzle/migrations" });
  } catch (error) {
    let e: unknown = error;
    while (e instanceof Error && e.cause instanceof Error) e = e.cause;
    throw new Error(e instanceof Error ? e.message : "Migration failed");
  }
}
async function preserved() {
  const data: Record<string, unknown> = {};
  for (const name of [
    "messages",
    "memories",
    "tess_state",
    "social_plans",
    "living_experiences",
    "living_experience_moments",
    "calendar_action_receipts",
    "calendar_transitions",
    "social_rsvps",
    "experience_operations",
    "experience_action_receipts",
    "shared_events",
    "character_knowledge",
    "generated_images",
    "storage.objects",
  ]) {
    const rows = await sql.unsafe(
      `SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) rows FROM (SELECT to_jsonb(t) x FROM ${name} t) s`,
    );
    // Added scene columns are expected; compare legacy experience data only.
    if (name === "living_experiences")
      data[name] = (rows[0]!["rows"] as Record<string, unknown>[]).map(
        ({ live_scene, scene_revision, scene_source_ordinal, ...rest }) => rest,
      );
    else data[name] = rows[0]!["rows"];
  }
  return data;
}
async function drift() {
  await base(38);
  await ledger34();
  await sql.unsafe(`UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00Z';
    INSERT INTO conversations(id,user_id,character_id) SELECT '${conv}','${user}',id FROM characters WHERE key='maya';
    INSERT INTO tess_state(user_id,conversation_id) VALUES('${user}','${conv}');
    INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES('${user}','coffee:local','Switchyard Coffee','cafe','{"public":true}');
    INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at,status,origin,conversation_id,category) VALUES('${user}','${plan}','maya','Coffee','coffee:local','${at}','2026-10-25T19:00Z','accepted','conversation','${conv}','coffee');
    SELECT experience_seed('${user}','${at}');
    SELECT experience_command('${user}','${plan}',gen_random_uuid(),'claim',NULL,'{}','${at}');
    DO $fixture$ DECLARE op uuid:=gen_random_uuid(); reserved jsonb; BEGIN
      reserved:=experience_command('${user}','${plan}',op,'turn',NULL,'{"body":"An actual recorded moment"}','${at}');
      PERFORM experience_command('${user}','${plan}',op,'commit',NULL,jsonb_build_object('token',reserved->'operation'->>'token','body','A fully acknowledged fictional fixture response.'),'${at}');
    END $fixture$;
    SELECT experience_command('${user}','${plan}',gen_random_uuid(),'pause',NULL,'{}','${at}');
    INSERT INTO memories(user_id,conversation_id,summary) VALUES('${user}','${conv}','Keep this established shared memory');
    INSERT INTO messages(user_id,conversation_id,sender,body) VALUES('${user}','${conv}','tess','Keep this conversation');
    INSERT INTO storage.objects(id,bucket_id,name) VALUES(gen_random_uuid(),'tess-photos','${user}/existing-photo.jpg');
    INSERT INTO generated_images(user_id,conversation_id,photo_type,scene,provider,model,storage_path) VALUES('${user}','${conv}','casual_selfie','An existing saved fictional snapshot','fixture','mock','${user}/existing-photo.jpg');`);
}
suite("actual Drizzle runner on PostgreSQL: migration history compatibility", () => {
  beforeAll(async () => {
    if (
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      new URL(url).pathname !== "/migration_compat_tests"
    )
      throw new Error("Disposable localhost /migration_compat_tests only");
    sql = postgres(url, { max: 1, onnotice: () => {} });
    await sql.unsafe(
      "DO $$ BEGIN CREATE ROLE anon;EXCEPTION WHEN duplicate_object THEN NULL;END $$;DO $$ BEGIN CREATE ROLE authenticated;EXCEPTION WHEN duplicate_object THEN NULL;END $$;DO $$ BEGIN CREATE ROLE service_role BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END $$;",
    );
  });
  beforeEach(async () => {
    await sql.unsafe(`DROP PUBLICATION IF EXISTS supabase_realtime;DROP SCHEMA IF EXISTS drizzle CASCADE;DROP SCHEMA public CASCADE;DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS storage CASCADE;
    CREATE SCHEMA public;GRANT USAGE ON SCHEMA public TO PUBLIC;
    CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
    CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text,name text);CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
    CREATE TABLE public.character_voices(character_key text CONSTRAINT character_voices_character_key_check CHECK(character_key IN('tess','maya','claire','jordan','ben')));`);
  }, 30000);
  afterAll(async () => {
    await sql?.end();
    if (archiveFolder) rmSync(archiveFolder, { recursive: true, force: true });
  });
  it("installs the current full migration journal with the real runner", async () => {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle/migrations" });
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(
      currentJournal.entries.length,
    );
    expect((await sql`SELECT calendar_manual_status() v`)[0]!["v"]).toBe(44);
    expect((await sql`SELECT calendar_pending(${user},${at}) p`)[0]!["p"]).toEqual([]);
  });
  it("reconciles historical drift through the current journal without changing saved user history", async () => {
    await drift();
    const before = await preserved();
    await migrate(drizzle(sql), { migrationsFolder: "drizzle/migrations" });
    expect(await preserved()).toEqual(before);
    expect((await sql`SELECT calendar_manual_status() v`)[0]!["v"]).toBe(44);
  });
  it("installs the archived repair through 0042 using the actual runner and all original SQL", async () => {
    await run();
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(
      journal.entries.length,
    );
    await sql.unsafe(readFileSync("scripts/migration-compat/preflight.sql", "utf8"));
    expect(
      (await sql`SELECT experience_scene_status() v,calendar_edit_status() e`)[0],
    ).toMatchObject({ v: 39, e: 40 });
  });
  it("recovers the exact ledger-0034/schema-0038 drift and preserves paused user history", async () => {
    await drift();
    const before = await preserved();
    const functionsBefore =
      await sql`SELECT proname,prosrc FROM pg_proc WHERE oid IN('public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure,'public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure,'public.experience_command_before_calendar38(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) ORDER BY proname`;
    const oldLedger = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    await run();
    expect(await preserved()).toEqual(before);
    expect(
      await sql`SELECT proname,prosrc FROM pg_proc WHERE oid IN('public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure,'public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure,'public.experience_command_before_calendar38(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) ORDER BY proname`,
    ).toEqual(functionsBefore);
    const rows = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(rows.slice(0, 35)).toEqual(oldLedger);
    for (const file of files.filter(
      (f) => f.folderMillis > Number(oldLedger.at(-1)!["created_at"]),
    ))
      expect(
        rows.some((r) => r["hash"] === file.hash && Number(r["created_at"]) === file.folderMillis),
      ).toBe(true);
    expect(
      (await sql`SELECT experience_scene_status() v,calendar_edit_status() e`)[0],
    ).toMatchObject({ v: 39, e: 40 });
    expect(
      (
        await sql`SELECT prosrc FROM pg_proc WHERE oid='public.deliver_photo_turn(uuid)'::regprocedure`
      )[0]!["prosrc"],
    ).toContain("registered public venue required");
    await run();
    expect(await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(rows);
    expect(await preserved()).toEqual(before);
  });
  it("also replays already-installed 0035–0037 normally when 0038 is genuinely absent", async () => {
    await base(37);
    await ledger34();
    await run();
    expect((await sql`SELECT calendar_contract_status() n`)[0]!["n"]).toBe(38);
  });
  it("can preflight inside a read-only transaction without mutating the ledger or data", async () => {
    await drift();
    const before = await preserved();
    await sql.begin("read only", async (tx) => {
      await tx.unsafe(readFileSync("scripts/migration-compat/preflight.sql", "utf8"));
    });
    expect(await preserved()).toEqual(before);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  it.each([
    [
      "missing function",
      "DROP FUNCTION public.calendar_followup_ready(uuid,uuid,timestamptz) CASCADE",
    ],
    [
      "changed body",
      "CREATE OR REPLACE FUNCTION calendar_contract_status() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 99 $$",
    ],
    ["missing constraint", "ALTER TABLE social_plans DROP CONSTRAINT plan_parent_owner"],
    ["changed column type", "ALTER TABLE social_plans ALTER COLUMN time_zone TYPE varchar(70)"],
    ["missing required privilege", "REVOKE SELECT ON calendar_action_receipts FROM authenticated"],
    ["disabled RLS", "ALTER TABLE calendar_action_receipts DISABLE ROW LEVEL SECURITY"],
    ["disabled trigger", "ALTER TABLE social_plans DISABLE TRIGGER canonical_plan_context"],
  ])("fails closed on %s and leaves the ledger at 0034", async (_, mutation) => {
    await drift();
    await sql.unsafe(mutation);
    const before = await preserved();
    await expect(run()).rejects.toThrow("Calendar 0038 compatibility stopped");
    expect(await preserved()).toEqual(before);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
    expect(
      (await sql`SELECT to_regprocedure('public.experience_scene_status()') fn`)[0]!["fn"],
    ).toBeNull();
  });
  it("rolls back runner ledger catch-up if a genuinely pending later migration fails", async () => {
    await drift();
    await sql.unsafe("ALTER TABLE living_experiences ADD COLUMN live_scene jsonb");
    const before = await preserved();
    await expect(run()).rejects.toThrow("already exists");
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
    expect(await preserved()).toEqual(before);
  });
  it("does not replay changed source files when the original 0038 ledger entries are already recorded", async () => {
    await base(38);
    await ledger34();
    for (const e of journal.entries.filter((e: { idx: number }) => e.idx >= 35 && e.idx <= 38))
      await sql`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${createHash("sha256").update(original(e.tag)).digest("hex")},${e.when})`;
    const before = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    await run();
    expect(
      (await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).slice(0, 39),
    ).toEqual(before);
    expect((await sql`SELECT calendar_edit_status() e`)[0]!["e"]).toBe(40);
  });
  it("accepts the separately reviewed 0041 delivery body without downgrading it during replay", async () => {
    await drift();
    await sql.unsafe(original("0041_unregistered_venue_message_recovery"));
    const before =
      await sql`SELECT prosrc FROM pg_proc WHERE oid='public.deliver_photo_turn(uuid)'::regprocedure`;
    await run();
    expect(
      await sql`SELECT prosrc FROM pg_proc WHERE oid='public.deliver_photo_turn(uuid)'::regprocedure`,
    ).toEqual(before);
  });
  it("needs no sandbox ledger privileges: only the normal runner writes its own receipts", async () => {
    await drift();
    await sql.unsafe(
      "DO $$ BEGIN CREATE ROLE sandbox_exec NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    );
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE sandbox_exec");
        await tx.unsafe(
          "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('not-authorized',1)",
        );
      }),
    ).rejects.toThrow("permission denied");
    await sql.begin("read only", async (tx) => {
      await tx.unsafe("SET LOCAL ROLE sandbox_exec");
      await tx.unsafe(readFileSync("scripts/migration-compat/preflight.sql", "utf8"));
    });
    await run();
    expect(
      (await sql`SELECT experience_scene_status() v,calendar_edit_status() e`)[0],
    ).toMatchObject({ v: 39, e: 40 });
    expect(
      (await sql`SELECT has_schema_privilege('sandbox_exec','drizzle','USAGE') allowed`)[0]![
        "allowed"
      ],
    ).toBe(false);
  });
  it("does not mistake a single existing column for a complete 0038 installation", async () => {
    await base(34);
    await ledger34();
    await sql.unsafe("ALTER TABLE social_plans ADD COLUMN description text");
    await expect(run()).rejects.toThrow("Calendar 0038 compatibility stopped");
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  it("preserves required Realtime subscriptions when the platform provides a publication", async () => {
    await sql.unsafe("CREATE PUBLICATION supabase_realtime");
    await drift();
    await run();
    const tables =
      await sql`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename`;
    expect(tables.map((t) => t["tablename"])).toEqual(["living_experiences", "social_plans"]);
    await sql.unsafe(readFileSync("scripts/migration-compat/preflight.sql", "utf8"));
    await sql.unsafe("ALTER PUBLICATION supabase_realtime DROP TABLE living_experiences");
    await expect(
      sql.unsafe(readFileSync("scripts/migration-compat/preflight.sql", "utf8")),
    ).rejects.toThrow("Realtime subscription missing");
  });
  const manifest = JSON.parse(
    readFileSync("scripts/migration-compat/calendar38-manifest.json", "utf8"),
  );
  const preflight = () => readFileSync("scripts/migration-compat/preflight.sql", "utf8");
  async function anonymousGrants() {
    const rows =
      await sql`SELECT signature FROM jsonb_array_elements_text(${JSON.stringify(manifest.anonymousExecuteRepair)}::jsonb) f(signature)
      WHERE has_function_privilege('anon',to_regprocedure('public.'||signature),'EXECUTE') ORDER BY signature`;
    return rows.map((r) => r["signature"]);
  }
  async function platformDefaults(tables = false) {
    await sql.unsafe(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon",
    );
    if (tables)
      await sql.unsafe(`
      DO $$ BEGIN CREATE ROLE sandbox_exec NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec;
    `);
  }
  it("recognizes platform defaults read-only, then repairs only the four grants through the normal runner", async () => {
    await platformDefaults();
    await drift();
    await stripInstalledComments();
    expect(await anonymousGrants()).toEqual([...manifest.anonymousExecuteRepair].sort());
    const before = await preserved();
    const definitions =
      await sql`SELECT oid,prosrc,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY oid`;
    const result = await sql.begin("read only", (tx) => tx.unsafe(preflight()));
    expect(result.at(-1)?.[0]?.migration_compatibility).toBe(
      "known_calendar38_permission_repair_required",
    );
    expect(await anonymousGrants()).toHaveLength(4);
    await run();
    expect(await anonymousGrants()).toEqual([]);
    expect(await preserved()).toEqual(before);
    // Historical replay preserves existing code; later 0041 intentionally updates delivery.
    const after =
      await sql`SELECT oid,prosrc,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY oid`;
    const delivery = (await sql`SELECT 'public.deliver_photo_turn(uuid)'::regprocedure::oid n`)[0]![
      "n"
    ];
    for (const row of definitions.filter((r) => r["oid"] !== delivery))
      expect(after.find((r) => r["oid"] === row["oid"])).toEqual(row);
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE anon");
        await tx.unsafe(`SELECT calendar_pending('${user}','${at}')`);
      }),
    ).rejects.toThrow("permission denied for function calendar_pending");
    await sql.begin("read only", (tx) => tx.unsafe(preflight()));
    const receipts = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    await run();
    expect(await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(receipts);
    expect(
      (await sql`SELECT experience_scene_status() v,calendar_edit_status() e`)[0],
    ).toMatchObject({ v: 39, e: 40 });
  });
  it("lets the sandbox inspect repair eligibility but cannot use it to change permissions", async () => {
    await platformDefaults();
    await drift();
    await sql.unsafe(
      "DO $$ BEGIN CREATE ROLE sandbox_exec NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    );
    await sql.begin("read only", async (tx) => {
      await tx.unsafe("SET LOCAL ROLE sandbox_exec");
      await tx.unsafe(preflight());
    });
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE sandbox_exec");
        await tx.unsafe(
          readFileSync("drizzle/migrations/0035_remove_experience_daily_cap.sql", "utf8"),
        );
      }),
    ).rejects.toThrow(/must be owner of function|permission denied for function/);
    expect(await anonymousGrants()).toHaveLength(4);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
    await run();
    expect(await anonymousGrants()).toEqual([]);
  });
  it("secures a fresh install with the same platform default grants", async () => {
    await platformDefaults();
    await run();
    expect(await anonymousGrants()).toEqual([]);
    await sql.begin("read only", (tx) => tx.unsafe(preflight()));
  });
  it("does not repair permissions when another schema invariant fails", async () => {
    await platformDefaults();
    await drift();
    await sql.unsafe("ALTER TABLE calendar_action_receipts DISABLE ROW LEVEL SECURITY");
    await expect(run()).rejects.toThrow("receipt RLS is disabled");
    expect(await anonymousGrants()).toHaveLength(4);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  it("rolls back permission repair with a later pending migration failure", async () => {
    await platformDefaults();
    await drift();
    await sql.unsafe("ALTER TABLE living_experiences ADD COLUMN live_scene jsonb");
    await expect(run()).rejects.toThrow("already exists");
    expect(await anonymousGrants()).toHaveLength(4);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  it.each([
    [
      "authenticated access",
      "GRANT EXECUTE ON FUNCTION calendar_pending(uuid,timestamptz) TO authenticated",
    ],
    [
      "anon outside allowlist",
      "GRANT EXECUTE ON FUNCTION calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz) TO anon",
    ],
    [
      "service access to private delegate",
      "GRANT EXECUTE ON FUNCTION deliver_photo_turn_before_calendar38(uuid) TO service_role",
    ],
  ])("still rejects %s without repairing the known anon drift", async (_, mutation) => {
    await platformDefaults();
    await drift();
    await sql.unsafe(mutation);
    await expect(run()).rejects.toThrow("function security or metadata differs");
    expect(await anonymousGrants()).toHaveLength(4);
  });
  const protectedTables = [
    "calendar_action_receipts",
    "experience_scene_transitions",
    "character_scene_state",
  ];
  async function assertTablePrivileges(tables = protectedTables) {
    for (const table of tables) {
      for (const item of manifest.tablePermissions) {
        if (
          item.minimumServerVersion &&
          Number((await sql`SHOW server_version_num`)[0]!["server_version_num"]) <
            item.minimumServerVersion
        )
          continue;
        const [row] =
          await sql`SELECT has_table_privilege(${item.role},${"public." + table},${item.privilege}) allowed`;
        expect(row!["allowed"], `${table} ${item.role} ${item.privilege}`).toBe(item.allowed);
      }
    }
  }
  async function assertOwnerReads() {
    await sql.unsafe(`GRANT USAGE ON SCHEMA auth TO authenticated;
      INSERT INTO calendar_action_receipts(user_id,source_kind,source_id,ordinal,payload,result)
      VALUES('${user}','message',gen_random_uuid(),0,'{}','{}');`);
    for (const [viewer, count] of [
      [user, 1],
      ["10000000-0000-4000-a000-000000000002", 0],
    ] as const) {
      await sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub',${viewer},true)`;
        expect((await tx`SELECT count(*)::int n FROM calendar_action_receipts`)[0]!["n"]).toBe(
          count,
        );
      });
    }
    for (const table of protectedTables) {
      await expect(
        sql.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE authenticated");
          await tx.unsafe(`TRUNCATE TABLE public.${table} CASCADE`);
        }),
      ).rejects.toThrow("permission denied");
    }
  }
  it("repairs combined live function/table defaults after a read-only sandbox preflight and preserves user history", async () => {
    await platformDefaults(true);
    await drift();
    await stripInstalledComments();
    const before = await preserved();
    const receiptsAcl =
      await sql`SELECT relacl::text acl FROM pg_class WHERE oid='calendar_action_receipts'::regclass`;
    await sql.begin("read only", async (tx) => {
      await tx.unsafe("SET LOCAL ROLE sandbox_exec");
      const result = await tx.unsafe(preflight());
      expect(result.at(-1)?.[0]?.migration_compatibility).toBe(
        "known_calendar38_permission_repair_required",
      );
    });
    expect(
      await sql`SELECT relacl::text acl FROM pg_class WHERE oid='calendar_action_receipts'::regclass`,
    ).toEqual(receiptsAcl);
    expect(await anonymousGrants()).toHaveLength(4);
    await run();
    expect(await preserved()).toEqual(before);
    expect(await anonymousGrants()).toEqual([]);
    await assertTablePrivileges();
    await assertOwnerReads();
    const result = await sql.begin("read only", (tx) => tx.unsafe(preflight()));
    expect(result.at(-1)?.[0]?.migration_compatibility).toBe("known_calendar38_verified");
    const ledger = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(ledger).toHaveLength(journal.entries.length);
    await run();
    expect(await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(ledger);
  });
  it("reports table-only repair eligibility when all function permissions already match", async () => {
    await drift();
    await sql.unsafe("GRANT ALL ON calendar_action_receipts TO anon,authenticated");
    expect(await anonymousGrants()).toEqual([]);
    const result = await sql.begin("read only", (tx) => tx.unsafe(preflight()));
    expect(result.at(-1)?.[0]?.migration_compatibility).toBe(
      "known_calendar38_permission_repair_required",
    );
    await run();
    await assertTablePrivileges();
  });
  it("secures all three tables on a fresh install with full platform defaults", async () => {
    await platformDefaults(true);
    await run();
    await assertTablePrivileges();
    await assertOwnerReads();
    expect(await anonymousGrants()).toEqual([]);
  });
  it("uses additive 0042 when 0035–0041 were already recorded with original hashes", async () => {
    await platformDefaults(true);
    await base(41);
    await ledger34();
    for (const e of journal.entries.filter((e: { idx: number }) => e.idx >= 35 && e.idx <= 41))
      await sql`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${createHash("sha256").update(original(e.tag)).digest("hex")},${e.when})`;
    const ledger = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    await run();
    await assertTablePrivileges();
    expect(await anonymousGrants()).toEqual([]);
    const after = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(after.slice(0, ledger.length)).toEqual(ledger);
    expect(after).toHaveLength(ledger.length + 1);
  });
  it.each([
    ["disabled owner trigger", "ALTER TABLE social_plans DISABLE TRIGGER canonical_plan_context"],
    ["missing service permission", "REVOKE SELECT ON calendar_action_receipts FROM service_role"],
    ["missing authenticated read", "REVOKE SELECT ON calendar_action_receipts FROM authenticated"],
  ])("does not revoke any combined grants when %s fails validation", async (_, mutation) => {
    await platformDefaults(true);
    await drift();
    await sql.unsafe(mutation);
    const before =
      await sql`SELECT relacl::text acl FROM pg_class WHERE oid='calendar_action_receipts'::regclass`;
    await expect(run()).rejects.toThrow("Calendar 0038 compatibility stopped");
    expect(
      await sql`SELECT relacl::text acl FROM pg_class WHERE oid='calendar_action_receipts'::regclass`,
    ).toEqual(before);
    expect(await anonymousGrants()).toHaveLength(4);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  it("rolls back both function and receipt repairs when a later pending migration fails", async () => {
    await platformDefaults(true);
    await drift();
    await sql.unsafe("ALTER TABLE living_experiences ADD COLUMN live_scene jsonb");
    const before =
      await sql`SELECT relacl::text acl FROM pg_class WHERE oid='calendar_action_receipts'::regclass`;
    await expect(run()).rejects.toThrow("already exists");
    expect(
      await sql`SELECT relacl::text acl FROM pg_class WHERE oid='calendar_action_receipts'::regclass`,
    ).toEqual(before);
    expect(await anonymousGrants()).toHaveLength(4);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  it("rejects a receipt grant inherited through PUBLIC instead of pretending it was removed", async () => {
    await drift();
    await sql.unsafe("GRANT SELECT ON calendar_action_receipts TO PUBLIC");
    await expect(run()).rejects.toThrow("receipt privilege remains inherited");
    expect(
      (
        await sql`SELECT has_table_privilege('anon','calendar_action_receipts','SELECT') allowed`
      )[0]!["allowed"],
    ).toBe(true);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
  async function stripInstalledComments() {
    for (const variant of COMMENT_VARIANTS) {
      const [row] =
        await sql`SELECT pg_get_functiondef(to_regprocedure(${"public." + variant.signature})) definition`;
      await sql.unsafe(withoutReviewedComments(row!["definition"], variant.comments));
      const [actual] =
        await sql`SELECT md5(regexp_replace(prosrc,'[[:space:]]','','g')) hash FROM pg_proc WHERE oid=to_regprocedure(${"public." + variant.signature})`;
      expect(actual!["hash"]).toBe(variant.stripped);
    }
  }
  it("preflights and upgrades the exact live comment-stripped functions without changing their logic or user history", async () => {
    await drift();
    await stripInstalledComments();
    const before = await preserved();
    const definitions =
      await sql`SELECT proname,prosrc FROM pg_proc WHERE oid IN('public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure,'public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) ORDER BY proname`;
    await sql.begin("read only", (tx) =>
      tx.unsafe(readFileSync("scripts/migration-compat/preflight.sql", "utf8")),
    );
    await run();
    expect(await preserved()).toEqual(before);
    expect(
      await sql`SELECT proname,prosrc FROM pg_proc WHERE oid IN('public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure,'public.experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamptz)'::regprocedure) ORDER BY proname`,
    ).toEqual(definitions);
    expect(
      (await sql`SELECT experience_scene_status() v,calendar_edit_status() e`)[0],
    ).toMatchObject({ v: 39, e: 40 });
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(
      journal.entries.length,
    );
  });
  it("still rejects executable changes in a comment-stripped function", async () => {
    await drift();
    await stripInstalledComments();
    const [row] =
      await sql`SELECT pg_get_functiondef('public.calendar_event_action(uuid,text,uuid,integer,jsonb,timestamptz)'::regprocedure) definition`;
    expect(row!["definition"]).toContain("p_ordinal NOT BETWEEN 0 AND 3");
    await sql.unsafe(
      row!["definition"].replace("p_ordinal NOT BETWEEN 0 AND 3", "p_ordinal NOT BETWEEN 0 AND 4"),
    );
    const before = await preserved();
    await expect(run()).rejects.toThrow("unrecognized function body");
    expect(await preserved()).toEqual(before);
    expect((await sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)[0]!["n"]).toBe(35);
  });
});
