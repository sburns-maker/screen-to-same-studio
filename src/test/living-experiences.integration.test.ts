// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const model = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: model.reply,
  generateContactReply: model.reply,
}));
import {
  experienceSeed,
  experienceCommand,
  livingHistory,
  generateExperience,
  runExperienceTick,
} from "@/lib/living-experiences.server";
import { experienceClock, experienceInstructions } from "@/lib/living-experiences";
let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  conv = "20000000-0000-4000-a000-000000000001",
  plan = "30000000-0000-4000-a000-000000000001";
const now = new Date("2026-10-25T18:00:00Z");
const id = () => crypto.randomUUID();
const client = () => postgresSupabase(db).admin;
async function cmd(
  command: string,
  revision: number | null = null,
  payload = {},
  action = id(),
  at = now,
) {
  return experienceCommand(client(), user, plan, action, command, revision, payload, at);
}
async function claim() {
  await experienceSeed(client(), user, now);
  return cmd("claim", 0);
}
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(
    "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$",
  );
  for (const f of [
    "0024_verify_phone_calls",
    "0025_living_experiences",
    "0026_complete_living_experiences",
  ])
    await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "true");
  model.reply.mockReset().mockResolvedValue({
    messages: ["She settles her coffee on the table. “Good to see you.”"],
    state_delta: { trust: 2 },
    photo: null,
  });
  await db.exec(`TRUNCATE conversations CASCADE;TRUNCATE world_places CASCADE;TRUNCATE character_knowledge;TRUNCATE shared_events CASCADE;
 UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00:00Z';
 INSERT INTO conversations(id,user_id,character_id,difficulty,real_time_mode) SELECT '${conv}','${user}',id,'realistic',true FROM characters WHERE key='maya';
 INSERT INTO tess_state(conversation_id,user_id) VALUES('${conv}','${user}');
 INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES('${user}','coffee:local','Switchyard Coffee','cafe','{}');
 INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,status,origin,conversation_id,category,date_local,time_local,user_response,character_response) VALUES('${user}','${plan}','maya','coffee:local','Coffee together','2026-10-25T18:00:00Z','2026-10-25T19:00:00Z','accepted','conversation','${conv}','coffee','2026-10-25','14:00','accepted','accepted');`);
});
describe("Living Experiences against real PostgreSQL engine and real migrations", () => {
  it("supports late starts, pause and resume without browser ownership", async () => {
    await experienceSeed(client(), user, now);
    const r = await cmd("claim", 0, {}, id(), new Date("2026-10-25T21:59:59Z"));
    expect(r.experience.mode).toBe("interactive");
    await cmd("pause", 1);
    await expect(
      cmd("automatic", null, {}, id(), new Date("2026-11-03T00:00:00Z")),
    ).rejects.toThrow();
    const h = await livingHistory(client(), user, plan);
    expect(h.scene.state).toBe("paused");
    expect(experienceClock(h.scene, [])).toBe("2026-10-25T18:00:00.000Z");
    expect((await cmd("resume", 2)).experience.state).toBe("interactive");
  });
  it("rejects a stale screen revision without consuming the contribution, then accepts the same action after refresh", async () => {
    await claim();
    const operation = id();
    await expect(
      generateExperience(
        client(),
        user,
        plan,
        operation,
        "turn",
        "Keep walking with me.",
        0,
        false,
        now,
      ),
    ).rejects.toThrow("changed while this screen was open");
    expect(model.reply).not.toHaveBeenCalled();
    const saved = await livingHistory(client(), user, plan);
    expect(saved.scene.state).toBe("interactive");
    expect(saved.moments).toHaveLength(0);
    await generateExperience(
      client(),
      user,
      plan,
      operation,
      "turn",
      "Keep walking with me.",
      saved.scene.revision,
      false,
      now,
    );
    expect(model.reply).toHaveBeenCalledTimes(1);
    const updated = await livingHistory(client(), user, plan);
    expect(updated.moments.filter((m) => m.source === "user").map((m) => m.body)).toEqual([
      "Keep walking with me.",
    ]);
  });
  it("rejects expired start but permits worker claim, never an interactive theft", async () => {
    await experienceSeed(client(), user, now);
    const late = new Date("2026-10-25T22:00:00Z");
    await expect(cmd("claim", 0, {}, id(), late)).rejects.toThrow();
    await cmd("automatic", 0, {}, id(), late);
    await expect(cmd("claim", null)).rejects.toThrow();
  });
  it("excludes protected plans from older calendar worker and rejects direct completion", async () => {
    await claim();
    await cmd("pause", 1);
    await client().rpc("calendar_advance", {
      p_user: user,
      p_now: "2026-11-01T22:00:00Z",
      p_blocked: [],
    });
    expect((await db.query(`SELECT status FROM social_plans WHERE id='${plan}'`)).rows[0]).toEqual({
      status: "accepted",
    });
    await expect(
      db.exec(`UPDATE social_plans SET status='completed' WHERE id='${plan}'`),
    ).rejects.toThrow("Resolve");
  });
  it("character context shares memories and separate scene transport, then commits once", async () => {
    await db.exec(
      `INSERT INTO memories(user_id,conversation_id,memory_type,summary,importance) VALUES('${user}','${conv}','relationship','User brought black coffee without sugar',5)`,
    );
    await claim();
    const turn = id();
    await generateExperience(client(), user, plan, turn, "turn", "Nice to see you.", 1, false, now);
    expect(model.reply.mock.calls[0]![0]!.memories.join(" ")).toContain("black coffee");
    expect(model.reply.mock.calls[0]![0]!.experience.instruction).toContain("IN PERSON");
    expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 0 });
    const h = await livingHistory(client(), user, plan);
    expect(h.moments.map((m) => m.source)).toEqual(["user", "character"]);
    await generateExperience(client(), user, plan, turn, "turn", "Nice to see you.", 1, false, now);
    expect(model.reply).toHaveBeenCalledTimes(1);
    const finish = id();
    model.reply.mockResolvedValueOnce({
      messages: ["They finished the coffee outing quietly. The user said it was nice to see Maya."],
      state_delta: { trust: 5 },
    });
    await generateExperience(client(), user, plan, finish, "finish", "", 2, false, now);
    await generateExperience(client(), user, plan, finish, "finish", "", 2, false, now);
    expect((await livingHistory(client(), user, plan)).scene.synced_at).toBeTruthy();
    expect((await db.query("SELECT count(*)::int n FROM shared_events")).rows[0]).toEqual({ n: 1 });
    expect(
      (await db.query(`SELECT trust FROM tess_state WHERE conversation_id='${conv}'`)).rows[0],
    ).toEqual({ trust: 27 });
    expect((await db.query(`SELECT status FROM social_plans WHERE id='${plan}'`)).rows[0]).toEqual({
      status: "completed",
    });
  });
  it("Claire's book club preserves a failed reply diagnostic across reload and retries the same contribution once", async () => {
    await db.exec(`UPDATE conversations SET character_id=(SELECT id FROM characters WHERE key='claire') WHERE id='${conv}';
      INSERT INTO world_places(user_id,key,label,kind,metadata) VALUES('${user}','books:hollidaysburg','Paper & Fern','bookshop','{}');
      UPDATE social_plans SET organizer='claire',place_key='books:hollidaysburg',title='Book club',category='book_club',starts_at='2026-10-25T20:00Z',ends_at='2026-10-25T21:00Z',date_local='2026-10-25',time_local='16:00' WHERE id='${plan}';`);
    const at = new Date("2026-10-25T21:09Z");
    await experienceSeed(client(), user, at);
    await cmd("claim", null, {}, id(), at);
    const operation = id();
    model.reply.mockRejectedValueOnce(
      new Error("Character AI is temporarily unavailable; please try again later"),
    );
    await expect(
      generateExperience(
        client(),
        user,
        plan,
        operation,
        "turn",
        "What did you think about the ending?",
        null,
        false,
        at,
      ),
    ).rejects.toThrow("Failure reference: " + operation);
    const reloaded = await livingHistory(postgresSupabase(db).admin, user, plan);
    expect(reloaded.scene).toMatchObject({ state: "interactive", outcome_id: null });
    expect(reloaded.moments.map((m) => m.body)).toEqual(["What did you think about the ending?"]);
    expect(reloaded.pending).toMatchObject({
      id: operation,
      status: "failed",
      failure: { phase: "generation", code: "model_unavailable" },
    });
    expect((await db.query("SELECT count(*)::int n FROM memories")).rows[0]).toEqual({ n: 0 });
    await expect(livingHistory(client(), other, plan)).rejects.toThrow();
    model.reply.mockResolvedValueOnce({
      messages: [
        "Claire sets her book down. “The ending worked for me, though I wanted another chapter.”",
      ],
      state_delta: {},
      photo: null,
    });
    await generateExperience(
      client(),
      user,
      plan,
      operation,
      "turn",
      "What did you think about the ending?",
      null,
      false,
      at,
    );
    await generateExperience(
      client(),
      user,
      plan,
      operation,
      "turn",
      "What did you think about the ending?",
      null,
      false,
      at,
    );
    const recovered = await livingHistory(client(), user, plan);
    expect(recovered.pending).toBeNull();
    expect(recovered.moments.map((m) => m.source)).toEqual(["user", "character"]);
    expect(recovered.scene.state).toBe("interactive");
    expect(model.reply).toHaveBeenCalledTimes(2);
    expect(model.reply.mock.calls.at(-1)![0].character.key).toBe("claire");
  });
  it("provider failure retains the contribution and retries without duplicates", async () => {
    await claim();
    const turn = id();
    model.reply.mockRejectedValueOnce(new Error("provider secret must not escape"));
    await expect(
      generateExperience(client(), user, plan, turn, "turn", "Hello", 1, false, now),
    ).rejects.toThrow("recorded progress is safe");
    expect((await livingHistory(client(), user, plan)).moments).toHaveLength(1);
    await generateExperience(client(), user, plan, turn, "turn", "Hello", 1, false, now);
    expect((await livingHistory(client(), user, plan)).moments).toHaveLength(2);
    await generateExperience(client(), user, plan, turn, "turn", "Hello", 1, false, now);
    expect(model.reply).toHaveBeenCalledTimes(2);
    expect((await livingHistory(client(), user, plan)).moments.map((m) => m.source)).toEqual([
      "user",
      "character",
    ]);
    expect((await db.query("SELECT count(*)::int n FROM memories")).rows[0]).toEqual({ n: 0 });
    expect((await db.query("SELECT trust FROM tess_state")).rows[0]).toEqual({ trust: 25 });
    expect((await livingHistory(client(), user, plan)).scene.state).toBe("interactive");
  });
  it("blocks concurrent same-ID retries before a second model call", async () => {
    await claim();
    const action = id();
    let release:
      ((value: { messages: string[]; state_delta: { trust: number } }) => void) | undefined;
    const waiting = new Promise<{ messages: string[]; state_delta: { trust: number } }>(
      (resolve) => {
        release = resolve;
      },
    );
    model.reply.mockReturnValueOnce(waiting);
    const first = generateExperience(client(), user, plan, action, "turn", "Hello", 1, false, now);
    await vi.waitFor(() => expect(model.reply).toHaveBeenCalledTimes(1));
    await expect(
      generateExperience(client(), user, plan, action, "turn", "Hello", 1, false, now),
    ).rejects.toThrow();
    release?.({ messages: ["Good to see you."], state_delta: { trust: 2 } });
    await first;
    expect(model.reply).toHaveBeenCalledTimes(1);
    expect((await livingHistory(client(), user, plan)).moments).toHaveLength(2);
  });
  it("keeps exhausted pending turns and claim unchanged without calling the model", async () => {
    const claimed = await claim();
    const action = id();
    model.reply.mockRejectedValue(new Error("Character AI capacity limit reached; try later"));
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(
        generateExperience(client(), user, plan, action, "turn", "Hello", 1, false, now),
      ).rejects.toThrow("capacity limit");
    await expect(
      generateExperience(client(), user, plan, action, "turn", "Hello", 1, false, now),
    ).rejects.toThrow("retry limit");
    const h = await livingHistory(client(), user, plan);
    expect(model.reply).toHaveBeenCalledTimes(3);
    expect(h.moments).toHaveLength(1);
    expect(h.pending).toMatchObject({ id: action, status: "failed", attempts: 3 });
    expect(Date.parse(h.scene.claimed_at ?? "")).toBe(
      Date.parse(claimed.experience.claimed_at ?? ""),
    );
    expect(h.scene).toMatchObject({ state: "interactive", revision: 1, outcome_id: null });
  });
  it("rejects cross-user commands and context", async () => {
    await claim();
    await expect(experienceCommand(client(), other, plan, id(), "pause", null)).rejects.toThrow();
    await expect(livingHistory(client(), other, plan)).rejects.toThrow();
  });
  it("fully automatic offline tick completes one modest outcome and no relationship award", async () => {
    await experienceSeed(client(), user, now);
    await runExperienceTick(client(), user, new Date("2026-10-25T22:00:00Z"));
    expect((await livingHistory(client(), user, plan)).scene.state).toBe("completed");
    expect(model.reply.mock.calls[0]![0]!.experience.instruction).toContain("not user dialogue");
    expect(
      (await db.query(`SELECT trust FROM tess_state WHERE conversation_id='${conv}'`)).rows[0],
    ).toEqual({ trust: 25 });
  });
  it("partial automatic completion sees actual earlier moments, not a replacement evening", async () => {
    await claim();
    await generateExperience(
      client(),
      user,
      plan,
      id(),
      "turn",
      "I liked our quiet walk before coffee.",
      1,
      false,
      now,
    );
    await cmd("pause", 2);
    await generateExperience(client(), user, plan, id(), "finish", "", 3, false, now);
    const a = model.reply.mock.calls[1]![0]!;
    expect(a.experience.instruction).toContain("ONLY the remaining portion");
    expect(a.experience.instruction).toContain("I liked our quiet walk before coffee.");
    expect((await livingHistory(client(), user, plan)).moments[0]!.body).toBe(
      "I liked our quiet walk before coffee.",
    );
  });
  it("does not mark the failed automatic job completed", async () => {
    await experienceSeed(client(), user, now);
    model.reply.mockRejectedValueOnce(new Error("offline"));
    await expect(
      runExperienceTick(client(), user, new Date("2026-10-25T22:00:00Z")),
    ).rejects.toThrow();
    const h = await livingHistory(client(), user, plan);
    expect(h.scene.state).toBe("auto_running");
    expect(h.scene.outcome_id).toBeNull();
    expect((await db.query("SELECT count(*)::int n FROM memories")).rows[0]).toEqual({ n: 0 });
  });
  it("zero inference when feature is disabled", async () => {
    vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "false");
    await runExperienceTick(client(), user, now);
    expect(model.reply).not.toHaveBeenCalled();
  });
  it("context explicitly preserves consent, non-romantic agency and no scripted milestone", () => {
    const s = experienceInstructions("turn", "Coffee", "Cafe", []);
    expect(s).toContain("never a checklist");
    expect(s).toContain("Do not speak, act, feel, consent");
  });
  it("replays transition receipts without changing revision", async () => {
    await experienceSeed(client(), user, now);
    const action = id();
    const a = await cmd("claim", 0, {}, action);
    const b = await cmd("claim", 0, {}, action);
    expect(b.experience.revision).toBe(a.experience.revision);
  });
  it("adjusts the start window transactionally and freezes it after claiming", async () => {
    await experienceSeed(client(), user, now);
    await cmd("window", 0, { hours: 8 });
    expect((await livingHistory(client(), user, plan)).scene.claim_deadline).toContain(
      "2026-10-26T02:00:00",
    );
    await cmd("claim", 1);
    await expect(cmd("window", 2, { hours: 12 })).rejects.toThrow();
  });
  it("fences a stalled generation after its reservation is recovered", async () => {
    await claim();
    const action = id();
    const a = await cmd("turn", 1, { body: "Hello" }, action);
    const b = await cmd("turn", 1, { body: "Hello" }, action, new Date(now.getTime() + 121000));
    await expect(
      cmd("commit", null, { token: a.operation!.token, body: "Stale reply" }, action),
    ).rejects.toThrow();
    await cmd("commit", null, { token: b.operation!.token, body: "Recovered reply" }, action);
    expect((await livingHistory(client(), user, plan)).moments).toHaveLength(2);
  });
  it("does not save proposals or relationship changes before actual completion", async () => {
    await claim();
    await generateExperience(
      client(),
      user,
      plan,
      id(),
      "turn",
      "A meaningful honest conversation.",
      1,
      false,
      now,
    );
    expect((await db.query("SELECT count(*)::int n FROM memories")).rows[0]).toEqual({ n: 0 });
    expect((await db.query("SELECT trust FROM tess_state")).rows[0]).toEqual({ trust: 25 });
  });
  it("does not discard a pending user contribution when a new action ID arrives", async () => {
    await claim();
    const action = id();
    await cmd("turn", 1, { body: "An actual choice" }, action);
    await cmd(
      "fail",
      null,
      {
        token: (await db.query<{ token: string }>("SELECT token FROM experience_operations"))
          .rows[0]!.token,
      },
      action,
    );
    await expect(cmd("turn", 1, { body: "An actual choice" }, id())).rejects.toThrow();
    expect((await livingHistory(client(), user, plan)).moments).toHaveLength(1);
  });
  it("enforces the shared durable daily generation cap before calling the model", async () => {
    await claim();
    await db.exec(
      `INSERT INTO experience_operations(user_id,id,experience_id,kind,status,token,lease_until,revision,created_at) SELECT '${user}',gen_random_uuid(),id,'turn','done',gen_random_uuid(),'2026-10-25T19:00Z',revision,'2026-10-25T18:00Z' FROM living_experiences CROSS JOIN generate_series(1,40)`,
    );
    await expect(
      generateExperience(client(), user, plan, id(), "turn", "Hello", 1, false, now),
    ).rejects.toThrow("limit");
    expect(model.reply).not.toHaveBeenCalled();
  });
  it("handles the Eastern DST fall transition as four elapsed hours", async () => {
    await db.exec(
      `UPDATE social_plans SET starts_at='2026-11-01T05:30Z',ends_at='2026-11-01T07:30Z' WHERE id='${plan}'`,
    );
    await experienceSeed(client(), user, now);
    const h = await livingHistory(client(), user, plan);
    expect(Date.parse(h.scene.claim_deadline) - Date.parse(h.scene.start_at)).toBe(14400000);
    expect(
      new Date(h.scene.start_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }),
    ).toBe("1:30 AM");
    expect(
      new Date(h.scene.claim_deadline).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }),
    ).toBe("4:30 AM");
  });
  it("Practice mode requires explicit simulation; background does not consume the outing", async () => {
    await db.exec(`UPDATE conversations SET real_time_mode=false WHERE id='${conv}'`);
    await runExperienceTick(client(), user, new Date("2026-10-25T22:00Z"));
    expect(model.reply).not.toHaveBeenCalled();
    expect((await livingHistory(client(), user, plan)).scene.state).toBe("scheduled");
    await generateExperience(client(), user, plan, id(), "automatic", "", 0, true, now);
    expect((await livingHistory(client(), user, plan)).scene.state).toBe("completed");
  });
  it("rejects obvious fabricated off-screen intimacy before canonical synchronization", async () => {
    await experienceSeed(client(), user, now);
    model.reply.mockResolvedValueOnce({
      messages: ['They kissed and became exclusive. The user said "I love you."'],
      state_delta: {},
    });
    await expect(
      generateExperience(client(), user, plan, id(), "automatic", "", 0, true, now),
    ).rejects.toThrow("recorded progress is safe");
    expect((await db.query("SELECT count(*)::int n FROM memories")).rows[0]).toEqual({ n: 0 });
    expect((await livingHistory(client(), user, plan)).scene.state).toBe("auto_running");
  });
  it("Tess dinner uses Jessica canon through the shared engine and no late-arrival penalty", async () => {
    await db.exec(
      `UPDATE conversations SET character_id=(SELECT id FROM characters WHERE key='tess') WHERE id='${conv}';UPDATE experience_settings SET installed_at='2026-10-22T00:00Z';UPDATE social_plans SET organizer='tess',title='Dinner with Tess',category='dinner',starts_at='2026-10-23T21:30Z',ends_at='2026-10-23T23:00Z',date_local='2026-10-23',time_local='17:30' WHERE id='${plan}';`,
    );
    await experienceSeed(client(), user, now);
    await cmd("claim", 0, {}, id(), new Date("2026-10-24T00:00:00Z"));
    await generateExperience(
      client(),
      user,
      plan,
      id(),
      "turn",
      "",
      1,
      false,
      new Date("2026-10-24T00:00:00Z"),
    );
    const args = model.reply.mock.calls[0]![0]!;
    expect(args.experience.at).toBe("2026-10-23T21:30:00.000Z");
    expect(args.experience.instruction).toContain("no late-arrival accusations");
    expect((await db.query("SELECT trust FROM tess_state")).rows[0]).toEqual({ trust: 25 });
  });
  it("filters exhausted jobs before selecting a bounded due candidate", async () => {
    await db.exec(
      `INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,status,origin,conversation_id,category,date_local,time_local) SELECT '${user}',gen_random_uuid(),'maya','coffee:local','Earlier outing','2026-10-25T17:00Z','2026-10-25T17:30Z','accepted','conversation','${conv}','coffee','2026-10-25','13:00' FROM generate_series(1,6)`,
    );
    await experienceSeed(client(), user, now);
    await db.exec(
      `INSERT INTO experience_operations(user_id,id,experience_id,kind,status,attempts,token,lease_until,revision) SELECT user_id,gen_random_uuid(),id,'automatic','failed',3,gen_random_uuid(),'2026-10-25T18:00Z',revision FROM living_experiences WHERE plan_id<>'${plan}'`,
    );
    const r = await client().rpc("experience_candidates", {
      p_user: user,
      p_now: "2026-10-25T22:00:00Z",
    });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([expect.objectContaining({ plan_id: plan })]);
  });
  it("rescheduling an unclaimed plan moves its window without losing the user adjustment", async () => {
    await experienceSeed(client(), user, now);
    await cmd("window", 0, { hours: 8 });
    await db.exec(
      `UPDATE social_plans SET starts_at='2026-10-26T18:00Z',ends_at='2026-10-26T19:00Z',version=version+1 WHERE id='${plan}'`,
    );
    await experienceSeed(client(), user, now);
    const h = await livingHistory(client(), user, plan);
    expect(h.scene.start_at).toContain("2026-10-26T18:00");
    expect(Date.parse(h.scene.claim_deadline) - Date.parse(h.scene.start_at)).toBe(8 * 3600000);
  });
  it("never automatically completes a cancelled plan", async () => {
    await experienceSeed(client(), user, now);
    await db.exec(
      `UPDATE social_plans SET status='cancelled',version=version+1 WHERE id='${plan}'`,
    );
    await runExperienceTick(client(), user, new Date("2026-10-25T22:00Z"));
    expect(model.reply).not.toHaveBeenCalled();
    await expect(cmd("automatic", null, { explicit: true })).rejects.toThrow();
  });
});

it("retains a rejected request and its exact action without automatically retrying a permanent provider failure", async () => {
  const { CharacterAIError, characterAIDiagnostic } = await import("@/lib/character-ai-error");
  await experienceSeed(client(), user, now);
  model.reply.mockRejectedValueOnce(new CharacterAIError("generic", characterAIDiagnostic("gpt-6-luna", 400, { error: { code: "invalid_json_schema", param: "text.format.schema", message: "private" } }, "req_safe")));
  const at = new Date("2026-10-25T22:00:00Z");
  await expect(runExperienceTick(client(), user, at)).rejects.toThrow("before retrying");
  const failed = await livingHistory(client(), user, plan);
  expect(failed.pending).toMatchObject({ attempts: 1, failure: { phase: "generation", code: "model_request_invalid", diagnostic: { statusCode: 400, retryable: false } } });
  expect(await runExperienceTick(client(), user, new Date(at.getTime() + 60000))).toBe(0);
  expect(model.reply).toHaveBeenCalledTimes(1);
  expect((await livingHistory(client(), user, plan)).scene.outcome_id).toBeNull();
});

it("preserves a failed interactive action and forwards the same operation reference on explicit retry", async () => {
  const { CharacterAIError, characterAIDiagnostic } = await import("@/lib/character-ai-error");
  await claim();
  const turn = id();
  const body = "Yes, let's continue the afternoon at Juniper Commons.";
  model.reply.mockRejectedValueOnce(new CharacterAIError("generic", characterAIDiagnostic("gpt-6-luna", 400, null, null)));
  await expect(generateExperience(client(), user, plan, turn, "turn", body, 1, false, now)).rejects.toThrow("Provider HTTP 400");
  const failed = await livingHistory(client(), user, plan);
  expect(failed.pending).toMatchObject({ id: turn, body, status: "failed", attempts: 1 });
  expect(failed.moments.map(m => m.body)).toEqual([body]);
  expect(model.reply.mock.calls.at(-1)?.[0].operationId).toBe(turn);
  model.reply.mockResolvedValueOnce({ messages: ["We can decide what to do next over coffee."], state_delta: { trust: 2 }, photo: null });
  await generateExperience(client(), user, plan, turn, "turn", body, 1, false, now);
  await generateExperience(client(), user, plan, turn, "turn", body, 1, false, now);
  const recovered = await livingHistory(client(), user, plan);
  expect(recovered.moments.filter(m => m.source === "user").map(m => m.body)).toEqual([body]);
  expect(recovered.moments.filter(m => m.source === "character")).toHaveLength(1);
  expect(model.reply).toHaveBeenCalledTimes(2);
  expect((await db.query("SELECT trust FROM tess_state")).rows[0]).toEqual({ trust: 25 });
});

it("holds an old unclassified provider failure for diagnosis instead of consuming further automatic attempts", async () => {
  await experienceSeed(client(), user, now);
  model.reply.mockRejectedValueOnce(new Error("Character AI is temporarily unavailable; please try again later"));
  const at = new Date("2026-10-25T22:00:00Z");
  await expect(runExperienceTick(client(), user, at)).rejects.toThrow("Investigate");
  expect(await runExperienceTick(client(), user, new Date(at.getTime() + 60000))).toBe(0);
  expect(model.reply).toHaveBeenCalledTimes(1);
  expect((await livingHistory(client(), user, plan)).pending?.attempts).toBe(1);
});

it("keeps a genuinely transient typed provider failure eligible for one bounded worker retry", async () => {
  const { CharacterAIError, characterAIDiagnostic } = await import("@/lib/character-ai-error");
  await experienceSeed(client(), user, now);
  model.reply.mockRejectedValueOnce(new CharacterAIError("generic", characterAIDiagnostic("gpt-6-luna", 503, { error: { code: "server_error" } }, "req_safe")));
  const at = new Date("2026-10-25T22:00:00Z");
  await expect(runExperienceTick(client(), user, at)).rejects.toThrow("HTTP 503");
  expect(await runExperienceTick(client(), user, new Date(at.getTime() + 60000))).toBe(1);
  expect(model.reply).toHaveBeenCalledTimes(2);
  expect((await livingHistory(client(), user, plan)).scene.state).toBe("completed");
});
