// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_STATE } from "@/lib/tess-logic";
import { claimMessagePush, messagePushBody } from "@/lib/message-notifications.server";

const uid = "10000000-0000-4000-a000-000000000001";
const cid = "20000000-0000-4000-a000-000000000001";
const job = "30000000-0000-4000-a000-000000000001";
const mid = "40000000-0000-4000-a000-000000000001";
const image = "50000000-0000-4000-a000-000000000001";
const updated = "2026-10-22T14:00:00Z";
let db: PGlite;
let plan: Record<string, unknown>;
const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0]!.n;
const deliver = () =>
  db.query<{ result: { count: number; replayed?: boolean; reason?: string } }>(
    "select public.deliver_photo_turn($1) result",
    [job],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE SCHEMA storage; CREATE TABLE storage.objects (id uuid, bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;`);
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
  ]) {
    await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE public.conversations CASCADE; TRUNCATE public.job_runs CASCADE; TRUNCATE public.world_control;",
  );
  await db.query(
    "insert into conversations(id,user_id,character_id) select $1,$2,id from characters where key='tess'",
    [cid, uid],
  );
  await db.query("insert into tess_state(conversation_id,user_id,updated_at) values($1,$2,$3)", [
    cid,
    uid,
    updated,
  ]);
  await db.query("insert into tess_life(conversation_id,user_id) values($1,$2)", [cid, uid]);
  plan = {
    expectedStateUpdatedAt: updated,
    lastUserId: null,
    initiation: true,
    pendingBefore: updated,
    stage: "Newly acquainted",
    boundary: "none",
    state: { ...SEED_STATE, comfort: 60, last_delta: { trust: 1 }, last_tone: "dry" },
    rows: [
      {
        id: mid,
        conversation_id: cid,
        user_id: uid,
        body: "A generated contextual caption",
        created_at: updated,
        visible_at: updated,
        metadata: {
          generated_path: `${uid}/${job}.png`,
          generated_image_id: image,
          push_primary: true,
        },
      },
    ],
    generated: {
      id: image,
      created_at: updated,
      conversation_id: cid,
      message_id: mid,
      user_id: uid,
      photo_type: "casual_selfie",
      scene: "clinic office break",
      includes_tess: true,
      is_selfie: true,
      relationship_stage: "Newly acquainted",
      state_snapshot: SEED_STATE,
      provider: "openai",
      model: "gpt-image-1-mini",
      storage_path: `${uid}/${job}.png`,
      identity_reference_used: "tess",
    },
    memories: [
      {
        memory_type: "relationship",
        summary: "An existing ongoing plan remains intact",
        importance: 4,
      },
    ],
  };
  await db.query("insert into job_runs(id,job,status,detail) values($1,$2,'running',$3::jsonb)", [
    job,
    `photo-turn:${cid}`,
    JSON.stringify({ userId: uid, conversationId: cid, phase: "prepared", plan }),
  ]);
});

describe("real PostgreSQL photo outbox transaction", () => {
  it("also delivers text-only initiations atomically with one primary notification", async () => {
    plan["generated"] = null;
    plan["rows"] = [
      {
        id: mid,
        body: "One thought.",
        created_at: updated,
        visible_at: updated,
        metadata: { push_primary: true, notification_group: job },
      },
      {
        id: "40000000-0000-4000-a000-000000000002",
        body: "Another thought.",
        created_at: updated,
        visible_at: updated,
        metadata: { push_primary: false, notification_group: job },
      },
    ];
    await db.query("update job_runs set detail=jsonb_set(detail,'{plan}',$1::jsonb) where id=$2", [
      JSON.stringify(plan),
      job,
    ]);
    expect((await deliver()).rows[0]!.result.count).toBe(2);
    expect((await deliver()).rows[0]!.result.count).toBe(0);
    expect(await count("messages")).toBe(2);
    expect(await count("generated_images")).toBe(0);
    expect((await db.query<{ kind: string }>("select kind from world_events")).rows[0]!.kind).toBe(
      "character_turn",
    );
  });
  it("commits attachment, messages, state, memories and initiation once; retries do not duplicate", async () => {
    expect((await deliver()).rows[0]!.result.count).toBe(1);
    expect((await deliver()).rows[0]!.result.replayed).toBe(true);
    for (const table of ["messages", "generated_images", "memories"])
      expect(await count(table)).toBe(1);
    expect(
      (await db.query<{ comfort: number }>("select comfort from tess_state")).rows[0]!.comfort,
    ).toBe(60);
    expect(
      (
        await db.query<{ metadata: { generated_image_id: string } }>(
          "select metadata from messages",
        )
      ).rows[0]!.metadata.generated_image_id,
    ).toBe(image);
  });
  it("rolls back all effects on persistence failure, then reuses the prepared plan", async () => {
    await db.query(
      "insert into generated_images select x.* from jsonb_populate_record(null::generated_images,$1::jsonb) x",
      [JSON.stringify({ ...(plan["generated"] as object), message_id: null })],
    );
    await expect(deliver()).rejects.toThrow();
    expect(await count("messages")).toBe(0);
    expect(await count("memories")).toBe(0);
    expect(
      (await db.query<{ comfort: number }>("select comfort from tess_state")).rows[0]!.comfort,
    ).toBe(SEED_STATE.comfort);
    await db.exec("delete from generated_images");
    expect((await deliver()).rows[0]!.result.count).toBe(1);
  });
  it("rejects a recovered stale turn without overwriting newer relationship state", async () => {
    await db.exec("update tess_state set comfort=75, updated_at='2026-10-22T15:00:00Z'");
    expect((await deliver()).rows[0]!.result.reason).toBe("stale photo turn");
    expect(await count("messages")).toBe(0);
    expect(
      (await db.query<{ comfort: number }>("select comfort from tess_state")).rows[0]!.comfort,
    ).toBe(75);
  });
  it("rejects a response overtaken by a new user message", async () => {
    await db.query(
      "insert into messages(conversation_id,user_id,sender,body) values($1,$2,'user','one more thing')",
      [cid, uid],
    );
    expect((await deliver()).rows[0]!.result.reason).toBe("stale photo turn");
    expect(await count("generated_images")).toBe(0);
  });
  it("preserves pending paid images and existing memories, plans and dates", async () => {
    plan["initiation"] = false;
    await db.query(
      "insert into messages(conversation_id,user_id,sender,body,visible_at,metadata) values($1,$2,'tess','older photo','2030-01-01', $3::jsonb)",
      [cid, uid, JSON.stringify({ generated_path: "already-paid.png" })],
    );
    await db.query(
      "insert into memories(conversation_id,user_id,summary) values($1,$2,'Dinner plan stays as established')",
      [cid, uid],
    );
    await db.query("update job_runs set detail=jsonb_set(detail,'{plan}',$1::jsonb) where id=$2", [
      JSON.stringify(plan),
      job,
    ]);
    await deliver();
    expect(await count("messages")).toBe(2);
    expect(await count("memories")).toBe(2);
  });
  it("blocks another in-flight photo and denies authenticated access to the delivery function", async () => {
    await expect(
      db.query("insert into job_runs(job,status) values($1,'running')", [`photo-turn:${cid}`]),
    ).rejects.toThrow();
    await db.exec("SET ROLE authenticated");
    try {
      await expect(deliver()).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("atomically claims a notification once and preserves its attachment metadata", async () => {
    await deliver();
    const message = (
      await db.query<{ id: string; metadata: import("@/integrations/supabase/types").Json }>(
        "select id,metadata from messages",
      )
    ).rows[0]!;
    const admin = {
      from: () => ({
        update(metadata: { metadata: unknown }) {
          let id: unknown;
          const chain = {
            eq: (_: string, value: unknown) => {
              id = value;
              return chain;
            },
            is: () => chain,
            select: () => chain,
            maybeSingle: async () => {
              const result = await db.query(
                "update messages set metadata=$1::jsonb where id=$2 and metadata->>'pushed' is null returning id",
                [JSON.stringify(metadata.metadata), id],
              );
              return { data: result.rows[0] ?? null, error: null };
            },
          };
          return chain;
        },
      }),
    } as unknown as Parameters<typeof claimMessagePush>[0];
    const results = await Promise.all([
      claimMessagePush(admin, message),
      claimMessagePush(admin, message),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = (
      await db.query<{ metadata: Record<string, unknown> }>("select metadata from messages")
    ).rows[0]!;
    expect(after.metadata["generated_image_id"]).toBe(image);
    expect(after.metadata["pushed"]).toBe(true);
    expect(messagePushBody({ body: "", metadata: after.metadata })).toBe("Sent a photo");
  });
});

describe("persistent world continuity and cost transactions", () => {
  it("records an evidenced future photo promise atomically and does not duplicate it on retry", async () => {
    const quote = "I'll send you a picture after work.";
    (plan["rows"] as { body: string }[])[0]!.body = quote;
    plan["continuity"] = {
      fulfilled: null,
      facts: [],
      intentions: [
        {
          kind: "photo",
          summary: "Share a workday photo",
          source_quote: quote,
          due_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ],
    };
    await db.query("update job_runs set detail=jsonb_set(detail,'{plan}',$1::jsonb) where id=$2", [
      JSON.stringify(plan),
      job,
    ]);
    await deliver();
    await deliver();
    const records = (
      await db.query<{ status: string; source_quote: string }>(
        "select status,source_quote from world_records",
      )
    ).rows;
    expect(records).toEqual([{ status: "pending", source_quote: quote }]);
  });
  it("keeps character improvisation tentative instead of automatically creating canon", async () => {
    const quote = "Becca is helping with the room setup.";
    (plan["rows"] as { body: string }[])[0]!.body = quote;
    plan["continuity"] = {
      fulfilled: null,
      intentions: [],
      facts: [
        { kind: "npc", key: "npc:becca", value: quote, status: "confirmed", source_quote: quote },
      ],
    };
    await db.query("update job_runs set detail=jsonb_set(detail,'{plan}',$1::jsonb) where id=$2", [
      JSON.stringify(plan),
      job,
    ]);
    await deliver();
    expect(
      (await db.query<{ status: string }>("select status from world_records")).rows[0]!.status,
    ).toBe("tentative");
  });
  it("reserves each image attempt once, counts failures, and enforces monthly limits", async () => {
    const reserve = () =>
      db.query<{ allowed: boolean }>("select reserve_image_attempt($1,$2,$3,2,1) allowed", [
        job,
        cid,
        uid,
      ]);
    expect((await reserve()).rows[0]!.allowed).toBe(true);
    expect((await reserve()).rows[0]!.allowed).toBe(false);
    await db.query("update media_attempts set status='failed' where action_id=$1", [job]);
    await db.query("update job_runs set status='failed' where id=$1", [job]);
    const another = "30000000-0000-4000-a000-000000000002";
    await db.query("insert into job_runs(id,job,status,detail) values($1,$2,'running',$3)", [
      another,
      `photo-turn:${cid}`,
      JSON.stringify({ userId: uid, conversationId: cid }),
    ]);
    expect(
      (
        await db.query<{ allowed: boolean }>("select reserve_image_attempt($1,$2,$3,2,1) allowed", [
          another,
          cid,
          uid,
        ])
      ).rows[0]!.allowed,
    ).toBe(false);
  });
  it("enforces autonomous text budgets across calls and rejects browser-role spending", async () => {
    const reserve = () =>
      db.query<{ allowed: boolean }>("select reserve_world_ai($1,1) allowed", [uid]);
    expect((await reserve()).rows[0]!.allowed).toBe(true);
    expect((await reserve()).rows[0]!.allowed).toBe(false);
    await db.exec("SET ROLE authenticated");
    try {
      await expect(reserve()).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("rejects world records with a mismatched conversation owner", async () => {
    await expect(
      db.query(
        "insert into world_records(id,conversation_id,user_id,character_key,kind,key,summary,status,source_quote) values(gen_random_uuid(),$1,$2,'tess','npc','npc:other','Someone','tentative','A claimed person')",
        [cid, "10000000-0000-4000-a000-000000000099"],
      ),
    ).rejects.toThrow(/owner mismatch/);
  });
});

describe("photo promise follow-through", () => {
  it.each([false, true])(
    "fulfills a pending photo intention only with an actual attachment: %s",
    async (attached) => {
      const id = "60000000-0000-4000-a000-000000000001";
      await db.query(
        "insert into world_records(id,conversation_id,user_id,character_key,kind,key,summary,status,source_quote,due_at) values($1,$2,$3,'tess','photo','work-photo','A clinic photo','pending','I will share a clinic photo',now()-interval '1 hour')",
        [id, cid, uid],
      );
      plan["intentionId"] = id;
      if (!attached) {
        plan["generated"] = null;
        (plan["rows"] as { metadata: unknown }[])[0]!.metadata = { push_primary: true };
      }
      await db.query(
        "update job_runs set detail=jsonb_set(detail,'{plan}',$1::jsonb) where id=$2",
        [JSON.stringify(plan), job],
      );
      await deliver();
      expect(
        (await db.query<{ status: string }>("select status from world_records where id=$1", [id]))
          .rows[0]!.status,
      ).toBe(attached ? "fulfilled" : "pending");
    },
  );
});
