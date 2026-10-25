// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const model = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: model.reply,
  generateContactReply: model.reply,
}));
vi.mock("@/lib/tess.functions", () => ({ runTurn: vi.fn() }));
import {
  experienceSeed,
  experienceCommand,
  generateExperience,
  livingHistory,
} from "@/lib/living-experiences.server";
import { registerInteractivePlaces } from "@/lib/interactive-world.server";
let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  conv = "20000000-0000-4000-a000-000000000001",
  plan = "30000000-0000-4000-a000-000000000001";
const now = new Date("2026-10-24T21:10Z"),
  id = () => crypto.randomUUID(),
  client = () => postgresSupabase(db).admin;
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(
    "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$",
  );
  for (const file of [
    "0024_verify_phone_calls",
    "0025_living_experiences",
    "0026_complete_living_experiences",
    "0033_riley_living_experience_guards",
    "0034_experience_retry_recovery",
    "0035_remove_experience_daily_cap",
    "0036_mutual_calendar_confirmation",
    "0037_all_character_calendar_proposers",
    "0038_canonical_scheduling",
    "0039_experience_live_scene",
  ])
    await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
  await db.exec(readFileSync("docs/sql/20261024_riley_night_shift.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "true");
  model.reply.mockReset().mockResolvedValue({
    messages: ["Riley smiles. “That was a good evening.”"],
    state_delta: { trust: 1 },
    photo: null,
  });
  await db.exec(
    "TRUNCATE conversations CASCADE;TRUNCATE world_places CASCADE;TRUNCATE shared_events CASCADE;TRUNCATE character_knowledge;UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00Z'",
  );
  await db.query(
    "INSERT INTO conversations(id,user_id,character_id,real_time_mode) SELECT $1,$2,id,true FROM characters WHERE key='riley'",
    [conv, user],
  );
  await db.query("INSERT INTO tess_state(user_id,conversation_id) VALUES($1,$2)", [user, conv]);
  await registerInteractivePlaces(client(), user);
  await db.query(
    "INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at,status,origin,conversation_id,category,date_local,time_local,user_response,character_response) VALUES($1,$2,'riley','A walk','park:local','2026-10-24T21:00Z','2026-10-24T22:00Z','accepted','conversation',$3,'walk','2026-10-24','17:00','accepted','accepted')",
    [user, plan, conv],
  );
  await experienceSeed(client(), user, now);
  await experienceCommand(client(), user, plan, id(), "claim", null, {}, now);
});
async function turn(text: string, operation = id()) {
  return generateExperience(client(), user, plan, operation, "turn", text, null, false, now);
}
it("persists the full park → restaurant → car → home sequence across refresh, retry, pause and completion", async () => {
  for (const [text, key, activity] of [
    ["We finished the walk and drive to Valley Table.", "vehicle:current", "driving"],
    ["We arrive at Valley Table.", "diner:valley", "arriving"],
    ["We order dinner.", "diner:valley", "ordering"],
    ["We've finished dinner.", "diner:valley", "finished_meal"],
    ["We get back in the car and I drive you home.", "vehicle:current", "driving"],
    ["We arrive at your house.", "home:riley", "arriving"],
    ["I walk you to your front door.", "home:riley", "at_front_door"],
  ]) {
    const operation = id();
    await turn(text!, operation);
    const h = await livingHistory(client(), user, plan);
    expect(h.scene.live_scene).toMatchObject({ locationKey: key, activity });
    const args = model.reply.mock.calls.at(-1)![0];
    expect(args.availabilityDetail).toContain(key);
    expect(args.experience.instruction).toContain("AUTHORITATIVE LIVE SCENE");
    expect(args.worldKnowledge.join(" ")).not.toContain("Authoritative outing:");
    const calls = model.reply.mock.calls.length;
    await turn(text!, operation);
    expect(model.reply.mock.calls).toHaveLength(calls);
  }
  const before = await livingHistory(client(), user, plan);
  await experienceCommand(client(), user, plan, id(), "pause", null, {}, now);
  expect((await livingHistory(postgresSupabase(db).admin, user, plan)).scene.live_scene).toEqual(
    before.scene.live_scene,
  );
  await experienceCommand(client(), user, plan, id(), "resume", null, {}, now);
  await turn("It was lovely spending this evening together.");
  expect((await livingHistory(client(), user, plan)).scene.live_scene?.locationKey).toBe(
    "home:riley",
  );
  const p = (await db.query("SELECT title,place_key,status FROM social_plans WHERE id=$1", [plan]))
    .rows[0];
  expect(p).toEqual({ title: "A walk", place_key: "park:local", status: "in_progress" });
  await generateExperience(client(), user, plan, id(), "finish", "close_now", null, false, now);
  expect(
    (
      await db.query(
        "SELECT location,facts->'final_scene'->>'locationKey' final_location FROM shared_events WHERE kind='living_experience'",
      )
    ).rows,
  ).toEqual([{ location: "park:local", final_location: "home:riley" }]);
  expect(
    (await db.query("SELECT count(*)::int n FROM experience_scene_transitions WHERE changed"))
      .rows[0],
  ).toEqual({ n: 7 });
});
it("rejects an AI teleport without delivering it or resetting scene state", async () => {
  await turn("We arrive at your front door.");
  const before = await livingHistory(client(), user, plan);
  const trustBefore = (await db.query("SELECT trust FROM tess_state")).rows[0];
  model.reply.mockResolvedValue({
    messages: ["Riley smiles as we walk along the park path."],
    state_delta: { trust: 3 },
    photo: null,
  });
  await expect(turn("I enjoyed the evening.")).rejects.toThrow("earlier location");
  const h = await livingHistory(client(), user, plan);
  expect(h.scene.live_scene).toEqual(before.scene.live_scene);
  expect(h.moments.filter((m) => m.source === "character")).toHaveLength(1);
  expect((await db.query("SELECT trust FROM tess_state")).rows[0]).toEqual(trustBefore);
});
it("requires real owner-scoped evidence and rejects stale scene revisions", async () => {
  await turn("We arrive at Valley Table.");
  const h = await livingHistory(client(), user, plan),
    source = h.moments.find((m) => m.source === "user")!;
  const forged = await client().rpc(
    "experience_scene_apply" as never,
    {
      p_user: other,
      p_plan: plan,
      p_source: source.id,
      p_revision: 0,
      p_scene: null,
      p_quote: source.body,
    } as never,
  );
  expect(forged.error).not.toBeNull();
  const faked = await client().rpc(
    "experience_scene_apply" as never,
    {
      p_user: user,
      p_plan: plan,
      p_source: source.id,
      p_revision: 0,
      p_scene: null,
      p_quote: "invented action",
    } as never,
  );
  expect(faked.error).not.toBeNull();
  await experienceCommand(
    client(),
    user,
    plan,
    id(),
    "turn",
    null,
    { body: "We arrive at your house." },
    now,
  );
  const after = await livingHistory(client(), user, plan),
    last = after.moments.filter((m) => m.source === "user").at(-1)!;
  const stale = await client().rpc(
    "experience_scene_apply" as never,
    {
      p_user: user,
      p_plan: plan,
      p_source: last.id,
      p_revision: 0,
      p_scene: null,
      p_quote: last.body,
    } as never,
  );
  expect(stale.error).not.toBeNull();
  expect(after.scene.live_scene?.locationKey).toBe("diner:valley");
});
it("reads later transitions beyond the old 200-moment cutoff", async () => {
  const h = await livingHistory(client(), user, plan);
  await db.query(
    "INSERT INTO living_experience_moments(user_id,id,experience_id,ordinal,kind,body,source,confirmed) SELECT $1,md5(n::text||':history')::uuid,$2,n,'conversation','A recorded ordinary conversation.','user',true FROM generate_series(1,220) n",
    [user, h.scene.id],
  );
  await turn("We arrive at your house.");
  expect((await livingHistory(client(), user, plan)).scene.live_scene?.locationKey).toBe(
    "home:riley",
  );
  expect(model.reply.mock.calls.at(-1)![0].experience.instruction).toContain(
    "We arrive at your house.",
  );
}, 30000);

it("persists the bench across refresh and rejects an unrecorded return to walking", async () => {
  await turn("We sit on a bench.");
  const saved = await livingHistory(postgresSupabase(db).admin, user, plan);
  expect(saved.scene.live_scene).toMatchObject({
    activity: "talking",
    area: "seated on a bench",
    locationKey: "park:local",
  });
  model.reply.mockResolvedValueOnce({
    messages: ["Riley smiles as we walk along the park path."],
    state_delta: {},
    photo: null,
  });
  await expect(turn("I smile at you.")).rejects.toThrow("current scene is preserved");
  expect((await livingHistory(client(), user, plan)).scene.live_scene?.area).toBe(
    "seated on a bench",
  );
  expect(
    (await db.query("SELECT place_key FROM social_plans WHERE id=$1", [plan])).rows[0],
  ).toEqual({ place_key: "park:local" });
});
