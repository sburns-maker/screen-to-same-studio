// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const mocks = vi.hoisted(() => ({ admin: null as SupabaseClient<Database> | null, text: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mocks.admin;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain = { middleware: () => chain, inputValidator: () => chain, handler: () => chain };
    return chain;
  },
}));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: mocks.text,
  generateContactReply: mocks.text,
}));
vi.mock("@/lib/tess-weather.server", () => ({ getWeatherContext: async () => null }));
import { runTurn } from "@/lib/tess.functions";
import {
  syncCalendar,
  calendarPlans,
  registerInteractivePlaces,
} from "@/lib/interactive-world.server";
import { scheduleActionSchema } from "@/lib/calendar-contract";
let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001",
  conv = "20000000-0000-4000-a000-000000000001",
  now = new Date("2026-10-24T18:00Z");
const client = () => mocks.admin!;
let plan: string;
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(
    "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$",
  );
  for (const f of [
    "0024_verify_phone_calls",
    "0025_living_experiences",
    "0026_complete_living_experiences",
    "0033_riley_living_experience_guards",
    "0034_experience_retry_recovery",
    "0035_remove_experience_daily_cap",
    "0036_mutual_calendar_confirmation",
    "0037_all_character_calendar_proposers",
    "0038_canonical_scheduling",
  ])
    await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  await db.exec(
    "TRUNCATE conversations CASCADE;TRUNCATE world_places CASCADE;TRUNCATE job_runs CASCADE;UPDATE interactive_world_installation SET installed_at='2026-10-23T00:00Z';",
  );
  mocks.admin = postgresSupabase(db).admin;
  await db.query(
    "INSERT INTO conversations(id,user_id,character_id,real_time_mode,photo_frequency) SELECT $1,$2,id,true,'off' FROM characters WHERE key='maya'",
    [conv, user],
  );
  await db.query("INSERT INTO tess_state(user_id,conversation_id) VALUES($1,$2)", [user, conv]);
  await registerInteractivePlaces(client(), user);
  await db.query(
    "INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'user','Coffee Sunday at 2 PM at Switchyard Coffee?',$4,$4)",
    [crypto.randomUUID(), user, conv, now.toISOString()],
  );
  await syncCalendar(client(), user, now);
  plan = (await calendarPlans(client(), user))[0]!.id;
  mocks.text.mockReset().mockResolvedValue({
    messages: ["I'd love to. Two o'clock works for me."],
    schedule_actions: [
      scheduleActionSchema.parse({
        action: "accept",
        planId: plan,
        parentPlanId: null,
        title: null,
        description: null,
        category: null,
        date: null,
        time: null,
        timeHint: null,
        timeZone: null,
        place: null,
        durationMinutes: null,
        userQuote: null,
      }),
    ],
    tone: "warm",
    state_delta: { trust: 1 },
    photo: null,
    event_tags: [],
    send_delay_seconds: 3,
    memory_candidates: [],
    photo_boundary_decision: "unchanged",
    continuity: null,
    character_perspective: null,
  });
});
it("the real text turn atomically persists the character acceptance and calendar before returning", async () => {
  await runTurn(client(), user, conv, "America/New_York");
  expect((await calendarPlans(client(), user))[0]?.status).toBe("accepted");
  const rows = await db.query<{ body: string; visible: boolean }>(
    "SELECT body,visible_at<=created_at visible FROM messages WHERE sender='tess'",
  );
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0]?.visible).toBe(true);
  await syncCalendar(client(), user, now);
  expect(await calendarPlans(client(), user)).toHaveLength(1);
});
it("a calendar write failure rolls back reply, relationship change and receipt; delivery retry uses the same prepared turn", async () => {
  const before = (await db.query("SELECT trust FROM tess_state")).rows[0];
  await db.exec(
    "CREATE FUNCTION fail_calendar_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test calendar unavailable';END $$;CREATE TRIGGER fail_calendar_test BEFORE INSERT ON calendar_action_receipts FOR EACH ROW EXECUTE FUNCTION fail_calendar_test()",
  );
  try {
    await expect(runTurn(client(), user, conv, "America/New_York")).rejects.toThrow();
    expect((await db.query("SELECT * FROM messages WHERE sender='tess'")).rows).toHaveLength(0);
    expect((await db.query("SELECT trust FROM tess_state")).rows[0]).toEqual(before);
    expect((await calendarPlans(client(), user))[0]?.status).toBe("proposed");
  } finally {
    await db.exec(
      "DROP TRIGGER fail_calendar_test ON calendar_action_receipts;DROP FUNCTION fail_calendar_test()",
    );
  }
  await runTurn(client(), user, conv, "America/New_York");
  expect(mocks.text).toHaveBeenCalledTimes(1);
  expect((await calendarPlans(client(), user))[0]?.status).toBe("accepted");
  expect((await db.query("SELECT * FROM messages WHERE sender='tess'")).rows).toHaveLength(1);
});
it("rejects an unpersisted calendar-success claim instead of delivering it", async () => {
  mocks.text.mockResolvedValue({
    messages: ["I've added it to your calendar."],
    schedule_actions: null,
    state_delta: {},
    photo: null,
  });
  await expect(runTurn(client(), user, conv, "America/New_York")).rejects.toThrow(
    "Unverified calendar success",
  );
  expect((await db.query("SELECT * FROM messages WHERE sender='tess'")).rows).toHaveLength(0);
});
