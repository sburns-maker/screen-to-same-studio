// Test-only PostgREST adapter: production code executes against disposable PostgreSQL.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
export async function worldDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects (id uuid,bucket_id text,name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;`);
  for (const file of [
    "0000_migration",
    "0001_generated_photos",
    "0002_generated_images_style_metadata",
    "0003_tess_life_and_realtime",
    "0004_multi_character_contacts",
    "0005_living_world_push",
    "0006_world_tick_lease_and_pause",
    "0007_photo_consent_and_mature_preferences",
    "0008_atomic_photo_delivery",
    "0010_persistent_world",
    "0011_shared_world_plans",
    "0012_town_exploration",
    "0013_user_video_uploads",
    "0015_contextual_world_expansion",
    "0016_verify_world_expansion",
    "0017_media_profiles",
    "0019_interactive_calendar",
    "0020_verify_interactive_places_and_calendar",
    "0021_venue_experiences",
    "0022_verify_venue_experiences",
    "0023_phone_calls",
  ])
    await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
  await db.exec(readFileSync("docs/sql/20261024_internal_lookup_security.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/20261024_travel_trips.sql", "utf8"));
  return db;
}
export function postgresSupabase(db: PGlite) {
  const files = new Map<string, Uint8Array>();
  const encode = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
  const column = (s: string) =>
    s.includes("->>") ? `"${s.split("->>")[0]}"->>'${s.split("->>")[1]}'` : `"${s}"`;
  const from = (table: string) => {
    let operation = "select",
      values: Record<string, unknown>[] = [],
      fields = "*",
      single = false,
      head = false,
      count = false,
      max: number | undefined,
      offset = 0;
    let conflict = "",
      ignore = false;
    const conditions: string[] = [],
      parameters: unknown[] = [],
      orders: string[] = [];
    const param = (v: unknown) => {
      parameters.push(encode(v));
      return `$${parameters.length}`;
    };
    const filter = (key: string, op: string, value: unknown) => {
      conditions.push(`${column(key)} ${op} ${param(value)}`);
      return q;
    };
    const q = {
      select(f = "*", options?: { head?: boolean; count?: string }) {
        fields = f;
        head = !!options?.head;
        count = !!options?.count;
        return q;
      },
      insert(v: Record<string, unknown> | Record<string, unknown>[]) {
        operation = "insert";
        values = Array.isArray(v) ? v : [v];
        return q;
      },
      upsert(
        v: Record<string, unknown> | Record<string, unknown>[],
        options?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) {
        operation = "upsert";
        values = Array.isArray(v) ? v : [v];
        conflict = options?.onConflict ?? "";
        ignore = !!options?.ignoreDuplicates;
        return q;
      },
      update(v: Record<string, unknown>) {
        operation = "update";
        values = [v];
        return q;
      },
      delete() {
        operation = "delete";
        return q;
      },
      eq: (k: string, v: unknown) => filter(k, "=", v),
      lt: (k: string, v: unknown) => filter(k, "<", v),
      gt: (k: string, v: unknown) => filter(k, ">", v),
      gte: (k: string, v: unknown) => filter(k, ">=", v),
      lte: (k: string, v: unknown) => filter(k, "<=", v),
      like: (k: string, v: unknown) => filter(k, "LIKE", v),
      is(k: string, v: null) {
        conditions.push(`${column(k)} IS NULL`);
        return q;
      },
      in(k: string, v: unknown[]) {
        conditions.push(`${column(k)} IN (${v.map(param).join(",")})`);
        return q;
      },
      or(expression: string) {
        conditions.push(
          `(${expression
            .split(",")
            .map((e) => {
              const [key] = e.split(".not.is.null");
              return `${column(key!)} IS NOT NULL`;
            })
            .join(" OR ")})`,
        );
        return q;
      },
      order(k: string, options?: { ascending?: boolean }) {
        orders.push(`${column(k)} ${options?.ascending === false ? "DESC" : "ASC"}`);
        return q;
      },
      limit(n: number) {
        max = n;
        return q;
      },
      range(a: number, b: number) {
        offset = a;
        max = b - a + 1;
        return q;
      },
      maybeSingle() {
        single = true;
        return q;
      },
      single() {
        single = true;
        return q;
      },
      async then(resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) {
        try {
          let sql = "";
          if (operation === "select") {
            let projection = "*";
            if (table === "conversations" && fields.includes("character:characters"))
              projection =
                "conversations.*, (SELECT to_jsonb(ch) FROM characters ch WHERE ch.id=conversations.character_id) as character";
            if (table === "messages" && fields.includes("conversation:conversations"))
              projection =
                "messages.*, (SELECT to_jsonb(c) FROM conversations c WHERE c.id=messages.conversation_id) as conversation";
            sql = `SELECT ${projection} FROM "${table}"`;
          } else if (operation === "delete") sql = `DELETE FROM "${table}"`;
          else if (operation === "update")
            sql = `UPDATE "${table}" SET ${Object.entries(values[0]!)
              .map(([k, v]) => `${column(k)}=${param(v)}`)
              .join(",")}`;
          else {
            if (!values.length) return resolve({ data: [], error: null });
            const keys = Object.keys(values[0]!);
            sql = `INSERT INTO "${table}" (${keys.map(column).join(",")}) VALUES ${values.map((row) => `(${keys.map((k) => param(row[k])).join(",")})`).join(",")}`;
            if (operation === "upsert") {
              const keysConflict = conflict
                ? conflict.split(",")
                : [
                    ["character_world_state", "tess_life"].includes(table)
                      ? "conversation_id"
                      : table === "world_control"
                        ? "key"
                        : "id",
                  ];
              sql +=
                ` ON CONFLICT (${keysConflict.map(column).join(",")}) DO ` +
                (ignore
                  ? "NOTHING"
                  : `UPDATE SET ${keys
                      .filter((k) => !keysConflict.includes(k))
                      .map((k) => `${column(k)}=excluded.${column(k)}`)
                      .join(",")}`);
            }
          }
          if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
          if (operation === "select") {
            if (orders.length) sql += ` ORDER BY ${orders.join(",")}`;
            if (max !== undefined) sql += ` LIMIT ${max}`;
            if (offset) sql += ` OFFSET ${offset}`;
          } else sql += " RETURNING *";
          const result = await db.query(sql, parameters);
          // PostgREST JSON serializes timestamps; PGlite's raw Date objects otherwise diverge from production.
          const rows = JSON.parse(JSON.stringify(result.rows)) as typeof result.rows;
          return resolve({
            data: head ? null : single ? (rows[0] ?? null) : rows,
            error: null,
            count: count ? result.rows.length : null,
          });
        } catch (e) {
          return resolve({
            data: null,
            error: { code: (e as { code?: string }).code, message: (e as Error).message },
          });
        }
      },
    };
    return q;
  };
  const client = {
    from,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      try {
        const entries = Object.entries(args);
        const result = await db.query<{ value: unknown }>(
          `SELECT ${name}(${entries.map(([k], i) => `${k} => $${i + 1}`).join(",")}) value`,
          entries.map(([, v]) => encode(v)),
        );
        return { data: result.rows[0]?.value, error: null };
      } catch (e) {
        return {
          data: null,
          error: { code: (e as { code?: string }).code, message: (e as Error).message },
        };
      }
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => ({
          data: new Blob(["test canonical reference"], { type: "image/jpeg" }),
          error: null,
        }),
        createSignedUrl: async (path: string, seconds: number) => ({
          data: files.has(`${bucket}/${path}`)
            ? { signedUrl: `https://private.test/${bucket}/${path}?expires=${seconds}` }
            : null,
          error: files.has(`${bucket}/${path}`) ? null : { message: "missing test storage object" },
        }),
        upload: async (path: string, bytes: Uint8Array) => {
          files.set(`${bucket}/${path}`, bytes);
          return { error: null };
        },
      }),
    },
  };
  return { admin: client as unknown as SupabaseClient<Database>, files };
}
