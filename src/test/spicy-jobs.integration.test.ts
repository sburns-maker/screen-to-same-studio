// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { canonicalProfile } from "@/lib/canonical-profile.server";
import { submitSpicyPhoto, processSpicyPhotos } from "@/lib/spicy-jobs.server";
import { PendingPhotoTask, SPICY_MODELS } from "@/lib/spicy-image.server";
import { configuredPhotoProvider } from "@/lib/photo-provider-router.server";
vi.mock("@/lib/photo-identity-qc.server", () => ({
  screenPhotoVisuals: vi.fn(async () => ({ status: "screen_passed" })),
}));
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  conv = "20000000-0000-4000-a000-000000000001";
let db: Awaited<ReturnType<typeof worldDatabase>>,
  admin: ReturnType<typeof postgresSupabase>["admin"],
  action: string,
  hash: string,
  fetcher: ReturnType<typeof vi.fn>;
const files = new Map<string, Blob>();
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(
    "CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;",
  );
  await db.exec(readFileSync("drizzle/migrations/0047_photo_reference_library.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0048_api18_generation_jobs.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0051_spicy_photo_tasks.sql", "utf8"));
  const base = postgresSupabase(db).admin;
  admin = {
    ...base,
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          files.set(path, new Blob([new Uint8Array(bytes)], { type: "image/png" }));
          return { error: null };
        },
        download: async (path: string) => ({ data: files.get(path) ?? null, error: null }),
      }),
    },
  } as unknown as typeof admin;
  hash = (await canonicalProfile("tess")).sha256;
}, 30000);
afterAll(async () => {
  await db?.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  for (const [k, v] of Object.entries({
    SPICY_ENABLED: "true",
    SPICY_API_KEY: "unit-test-only",
    SPICY_ACCOUNT_CREDITS_VERIFIED_AT: new Date().toISOString(),
    SPICY_OUTPUT_HOSTS: "cdn.example.com",
    SPICY_JOB_RESERVATION_CENTS: "30",
    SPICY_DAILY_BUDGET_CENTS: "60",
    SPICY_MONTHLY_BUDGET_CENTS: "90",
  }))
    vi.stubEnv(k, v);
  await db.exec(
    "RESET ROLE;TRUNCATE spicy_photo_jobs;TRUNCATE job_runs CASCADE;TRUNCATE photo_reference_state CASCADE;TRUNCATE conversations CASCADE;",
  );
  const ch = (await db.query<{ id: string }>("select id from characters where key='tess'"))
    .rows[0]!;
  await db.query<Record<string, unknown>>(
    "insert into conversations(id,user_id,character_id,mature_photography,photo_boundary) values($1,$2,$3,true,'none')",
    [conv, user, ch.id],
  );
  await db.query<Record<string, unknown>>(
    "insert into photo_reference_state(user_id,character_key,spicy_enabled,adult_confirmed) values($1,'tess',true,true)",
    [user],
  );
  await db.query(
    "insert into tess_state(conversation_id,user_id,comfort,trust,emotional_intimacy,romantic_attraction,romantic_intent) values($1,$2,75,75,60,60,60)",
    [conv, user],
  );
  action = crypto.randomUUID();
  await reserve(action);
  fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ code: 200, data: { taskId: "job_one", state: "queued" } }, { status: 202 }),
    );
  vi.stubGlobal("fetch", fetcher);
  files.clear();
});
async function reserve(id: string) {
  await db.query<Record<string, unknown>>(
    "insert into job_runs(id,job,status,detail) values($1,$2,'running',$3)",
    [id, `photo-turn:${conv}`, { userId: user, conversationId: conv, phase: "generating" }],
  );
  await db.query<Record<string, unknown>>(
    "insert into media_attempts(action_id,user_id,conversation_id) values($1,$2,$3)",
    [id, user, conv],
  );
}
async function submit(id = action) {
  return submitSpicyPhoto(
    admin,
    user,
    conv,
    "tess",
    id,
    "One fictional adult in opaque clothing",
    ["https://refs.example.com/canonical?token=private"],
    hash,
    { scene: "at home", expression: null, style: { clothing_category: "blue sweater" } },
  );
}
async function pending() {
  await db.query<Record<string, unknown>>(
    "insert into messages(id,user_id,conversation_id,sender,body,metadata) values($1,$2,$3,'tess','',$4)",
    [
      crypto.randomUUID(),
      user,
      conv,
      { generated_path: null, photo_pending: { actionId: action, status: "processing" } },
    ],
  );
  await db.query<Record<string, unknown>>(
    "update spicy_photo_jobs set next_poll_at=now()-interval '1 second' where action_id=$1",
    [action],
  );
}
it("persists a task and stable key before returning pending, never resubmits on retry", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const row = (await db.query<Record<string, unknown>>("select * from spicy_photo_jobs")).rows[0]!;
  expect(row["status"]).toBe("processing");
  expect(row["idempotency_key"]).toBe(`photo-msg-${action}-render-1`);
  expect(JSON.stringify(row)).not.toContain("token=private");
  expect(JSON.stringify(row)).not.toContain("unit-test-only");
});
it("handles concurrent submissions with one winner and keeps unknown charges reserved", async () => {
  const results = await Promise.allSettled([submit(), submit()]);
  expect(results.every((r) => r.status === "rejected")).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("a lost POST response is not resubmitted and does not release its reservation", async () => {
  fetcher.mockRejectedValue(new Error("network lost"));
  await expect(submit()).rejects.toThrow("could not be confirmed");
  await expect(submit()).rejects.toThrow("already_reserved");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const row = (
    await db.query<Record<string, unknown>>("select status,reserved_cents from spicy_photo_jobs")
  ).rows[0]!;
  expect(row).toMatchObject({ status: "unknown", reserved_cents: 30 });
});
it("completes the original pending message once after a new worker instance resumes it", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await pending();
  fetcher.mockReset().mockImplementation(async (url: string) =>
    url.includes("recordInfo")
      ? Response.json({
          code: 200,
          data: {
            taskId: "job_one",
            state: "succeeded",
            cost: "0.2",
            settled: true,
            output: { assets: [{ url: "https://cdn.example.com/output.png" }] },
          },
        })
      : new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
          headers: { "content-type": "image/png" },
        }),
  );
  const worker = await import("@/lib/spicy-jobs.server");
  await worker.processSpicyPhotos(admin);
  await worker.processSpicyPhotos(admin);
  expect(
    (await db.query<Record<string, unknown>>("select count(*)::int as n from generated_images"))
      .rows[0]!["n"],
  ).toBe(1);
  const msg = (await db.query<Record<string, unknown>>("select metadata from messages")).rows[0]![
    "metadata"
  ] as Record<string, unknown>;
  expect(msg["generated_path"]).toBe(`${user}/${action}.png`);
  expect(msg["photo_pending"]).toBeUndefined();
  expect(
    (await db.query<Record<string, unknown>>("select status,cost_usd from spicy_photo_jobs"))
      .rows[0]!["status"],
  ).toBe("completed");
  expect(fetcher.mock.calls.every((c) => c[1]?.method !== "POST")).toBe(true);
});
it("failed generation clears the pending attachment and records an explicit failure", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await pending();
  fetcher.mockResolvedValue(
    Response.json({ code: 200, data: { taskId: "job_one", state: "failed" } }),
  );
  await processSpicyPhotos(admin);
  const md = (await db.query<Record<string, unknown>>("select metadata from messages")).rows[0]![
    "metadata"
  ] as Record<string, unknown>;
  expect(md["photo_pending"]).toBeUndefined();
  expect(md["photo_failure"]).toBeTruthy();
  expect(
    (await db.query<Record<string, unknown>>("select count(*)::int as n from generated_images"))
      .rows[0]!["n"],
  ).toBe(0);
});
it("polling rate limits retain the task without another POST", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await pending();
  fetcher
    .mockReset()
    .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "45" } }));
  await processSpicyPhotos(admin);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    (await db.query<Record<string, unknown>>("select status from spicy_photo_jobs")).rows[0]![
      "status"
    ],
  ).toBe("processing");
});
it("database RLS denies client reads and writes, and prevents cross-owner reservations", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await db.exec("SET ROLE authenticated");
  await expect(db.query<Record<string, unknown>>("select * from spicy_photo_jobs")).rejects.toThrow(
    "permission denied",
  );
  await db.exec("RESET ROLE");
  const r = await admin.rpc("spicy_photo_reserve", {
    p_user: other,
    p_action: action,
    p_conversation: conv,
    p_character: "tess",
    p_hash: "a".repeat(64),
    p_model: SPICY_MODELS[0],
    p_payload: {},
    p_cents: 30,
    p_daily: 60,
    p_monthly: 90,
  });
  expect(r.error).toBeTruthy();
});
it("database spending caps survive independent actions and primary reference approvals", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await db.query<Record<string, unknown>>(
    "update spicy_photo_jobs set status='failed' where action_id=$1",
    [action],
  );
  await db.query("update job_runs set status='ok' where id=$1", [action]);
  fetcher.mockResolvedValue(
    Response.json({ code: 200, data: { taskId: "job_two", state: "queued" } }),
  );
  const next = crypto.randomUUID();
  await reserve(next);
  await expect(submit(next)).rejects.toBeInstanceOf(PendingPhotoTask);
  await db.query<Record<string, unknown>>(
    "update spicy_photo_jobs set status='failed' where action_id=$1",
    [next],
  );
  await db.query("update job_runs set status='ok' where id=$1", [next]);
  const third = crypto.randomUUID();
  await reserve(third);
  await expect(submit(third)).rejects.toThrow("budget_or_action");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("ordinary categories never consult SpicyAPI, and Ben cannot use it", async () => {
  const normal = { name: "normal", model: "normal", generate: vi.fn() };
  expect(await configuredPhotoProvider(admin, user, "tess", "casual_selfie", normal)).toBe(normal);
  await expect(
    configuredPhotoProvider(admin, user, "ben", "mature_romantic", normal),
  ).rejects.toThrow("unavailable");
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not retain a conversation generation lock while the photo remains pending", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await pending();
  // The existing atomic outbox finishes this turn; a later text turn can reserve
  // its own operation while the provider task remains durable and pending.
  await db.query("update job_runs set status='ok',finished_at=now() where id=$1", [action]);
  await expect(reserve(crypto.randomUUID())).resolves.toBeUndefined();
  expect(
    (await db.query<Record<string, unknown>>("select status from spicy_photo_jobs")).rows[0]![
      "status"
    ],
  ).toBe("processing");
});
it("rechecks revoked consent atomically and never delivers the image", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await pending();
  const c = await admin.rpc("spicy_photo_claim", { p_action: action });
  const job = c.data as { lease_token: string };
  await db.query("update photo_reference_state set spicy_enabled=false where user_id=$1", [user]);
  const result = await admin.rpc("spicy_photo_finish", {
    p_action: action,
    p_token: job.lease_token,
    p_metadata: {},
    p_failure: null,
  });
  expect(result.error).toBeNull();
  expect(result.data).toBe(true);
  expect(
    (await db.query<Record<string, unknown>>("select failure_code from spicy_photo_jobs")).rows[0]![
      "failure_code"
    ],
  ).toBe("spicy_permission_changed");
  expect(
    (await db.query<Record<string, unknown>>("select count(*)::int as n from generated_images"))
      .rows[0]!["n"],
  ).toBe(0);
});
it("does not finalize without a valid worker lease", async () => {
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  await pending();
  const r = await admin.rpc("spicy_photo_finish", {
    p_action: action,
    p_token: null as unknown as string,
    p_metadata: {},
    p_failure: "spicy_test",
  });
  expect(r.data).toBe(false);
  expect(
    (await db.query<Record<string, unknown>>("select status from spicy_photo_jobs")).rows[0]![
      "status"
    ],
  ).toBe("processing");
});
it("keeps historical API18 records separate and never calls their endpoints", async () => {
  await db.query(
    "insert into api18_jobs(user_id,action_id,conversation_id,character_key,request_hash,status,reserved_cents,cost_usd) values($1,$2,$3,'tess',$4,'completed',30,.2)",
    [user, crypto.randomUUID(), conv, "a".repeat(64)],
  );
  await expect(submit()).rejects.toBeInstanceOf(PendingPhotoTask);
  expect(
    (await db.query<Record<string, unknown>>("select count(*)::int as n from api18_jobs")).rows[0]![
      "n"
    ],
  ).toBe(1);
  expect(fetcher.mock.calls.every((c) => !String(c[0]).includes("api18.dev"))).toBe(true);
});
it("keeps developer tests isolated when an asynchronous task completes", async () => {
  await db.query(
    'update job_runs set job=$2,detail=detail||\'{"phase":"spicy_pending","category":"mature_romantic"}\' where id=$1',
    [action, `developer-photo-lab:${conv}`],
  );
  await expect(
    submitSpicyPhoto(
      admin,
      user,
      conv,
      "tess",
      action,
      "one fictional adult",
      ["https://refs.example.com/tess"],
      hash,
      { scene: "at home", expression: null, delivery: "lab" },
    ),
  ).rejects.toBeInstanceOf(PendingPhotoTask);
  await db.query(
    "update spicy_photo_jobs set next_poll_at=now()-interval '1 second' where action_id=$1",
    [action],
  );
  fetcher.mockReset().mockImplementation(async (url: string) =>
    url.includes("recordInfo")
      ? Response.json({
          code: 200,
          data: {
            taskId: "job_one",
            state: "succeeded",
            output: { assets: [{ url: "https://cdn.example.com/a.png" }] },
          },
        })
      : new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
          headers: { "content-type": "image/png" },
        }),
  );
  await processSpicyPhotos(admin);
  expect(
    (await db.query<Record<string, unknown>>("select status from job_runs where id=$1", [action]))
      .rows[0]!["status"],
  ).toBe("ok");
  expect(
    (await db.query<Record<string, unknown>>("select count(*)::int as n from messages")).rows[0]![
      "n"
    ],
  ).toBe(0);
  expect(
    (await db.query<Record<string, unknown>>("select count(*)::int as n from generated_images"))
      .rows[0]!["n"],
  ).toBe(0);
});
