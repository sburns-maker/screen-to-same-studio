// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const model = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: model.reply,
  generateContactReply: model.reply,
}));
vi.mock("@/lib/tess.functions", () => ({ runTurn: vi.fn() }));
import {
  syncCalendar,
  calendarPlans,
  registerInteractivePlaces,
} from "@/lib/interactive-world.server";
import {
  prepareScheduleActions,
  syncExperienceScheduling,
} from "@/lib/calendar-coordinator.server";
import {
  experienceSeed,
  experienceCommand,
  generateExperience,
  livingHistory,
} from "@/lib/living-experiences.server";
import { schedulingAgenda } from "@/lib/scheduling-agenda.server";
import { zonedInstant } from "@/lib/calendar-time";
import { scheduleActionSchema } from "@/lib/calendar-contract";
let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002";
let conv: string, clock: Date;
let preservedHistoricalRecords = false;
const client = () => postgresSupabase(db).admin;
const id = () => crypto.randomUUID();
async function msg(body: string, sender = "user") {
  const mid = id();
  await db.query(
    "INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,$4,$5,$6,$6)",
    [mid, user, conv, sender, body, clock.toISOString()],
  );
  clock = new Date(clock.getTime() + 1000);
  await syncCalendar(client(), user, clock);
  return mid;
}
async function rawMessage(body: string, sender = "tess") {
  const mid = id();
  await db.query(
    "INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,$4,$5,$6,$6)",
    [mid, user, conv, sender, body, clock.toISOString()],
  );
  return mid;
}
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await client().rpc(name as never, args as never);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function plans() {
  return calendarPlans(client(), user);
}
const action = (a: Record<string, unknown>) =>
  scheduleActionSchema.parse({
    action: "invite",
    planId: null,
    parentPlanId: null,
    title: "Dinner",
    description: null,
    category: "dinner",
    date: null,
    time: null,
    timeHint: null,
    timeZone: null,
    place: null,
    durationMinutes: null,
    userQuote: null,
    ...a,
  });
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
  ]) {
    if (f === "0038_canonical_scheduling") {
      await db.exec(`INSERT INTO conversations(id,user_id,character_id) SELECT '90000000-0000-4000-a000-000000000001','${other}',id FROM characters WHERE key='tess';
      INSERT INTO world_places(user_id,key,label,kind) VALUES('${other}','historic:place','Existing place','cafe');
      INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at,status,origin,conversation_id,category) VALUES('${other}','90000000-0000-4000-a000-000000000002','tess','Existing accepted plan','historic:place','2026-09-01T17:00Z','2026-09-01T18:00Z','accepted','conversation','90000000-0000-4000-a000-000000000001','coffee');
      INSERT INTO memories(user_id,conversation_id,summary) VALUES('${other}','90000000-0000-4000-a000-000000000001','Established history remains untouched');`);
      const before = await db.query(
        "SELECT id,title,status,starts_at,ends_at,version FROM social_plans",
      );
      const memoryBefore = await db.query("SELECT id,summary,importance FROM memories");
      await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
      expect(
        (await db.query("SELECT id,title,status,starts_at,ends_at,version FROM social_plans")).rows,
      ).toEqual(before.rows);
      expect((await db.query("SELECT id,summary,importance FROM memories")).rows).toEqual(
        memoryBefore.rows,
      );
      preservedHistoricalRecords = true;
    } else await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
  }
  await db.exec(readFileSync("docs/sql/20261024_riley_night_shift.sql", "utf8"));
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.close();
});
beforeEach(async () => {
  vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "true");
  model.reply.mockReset().mockResolvedValue({
    messages: ["“Good to see you.”"],
    state_delta: {},
    photo: null,
    schedule_actions: null,
  });
  clock = new Date("2026-10-24T18:00:00Z");
  await db.exec(
    "TRUNCATE conversations CASCADE;TRUNCATE world_places CASCADE;TRUNCATE character_knowledge;TRUNCATE shared_events CASCADE;UPDATE interactive_world_installation SET installed_at='2026-10-23T00:00Z';UPDATE experience_settings SET enabled=true,installed_at='2026-10-23T00:00Z';",
  );
  conv = id();
  await db.query(
    "INSERT INTO conversations(id,user_id,character_id,real_time_mode) SELECT $1,$2,id,true FROM characters WHERE key='maya'",
    [conv, user],
  );
  await db.query("INSERT INTO tess_state(user_id,conversation_id) VALUES($1,$2)", [user, conv]);
  await registerInteractivePlaces(client(), user);
});
describe("one canonical scheduling lifecycle", () => {
  it("migration preserves preexisting accepted plans and memories without a backfill", () => {
    expect(preservedHistoricalRecords).toBe(true);
  });
  it("AI invites and player accepts naturally without another confirmation button", async () => {
    await msg("Want to walk tomorrow at 1 at Juniper Commons?", "tess");
    await msg("Absolutely.");
    const p = (await plans())[0]!;
    expect(p.status).toBe("accepted");
    expect(p.time_local).toBe("13:00");
    expect(p.date_local).toBe("2026-10-25");
  });
  it("player invites and character accepts, with one visible canonical event", async () => {
    await msg("Dinner Monday at 7 PM at Fanelli's?");
    await msg("I'd love to.", "tess");
    const p = (await plans())[0]!;
    expect(p.status).toBe("accepted");
    expect(p.user_response).toBe("accepted");
    expect(p.character_response).toBe("accepted");
  });
  it("an agreement without an exact time remains pending with its actual hint", async () => {
    await msg("Want coffee tomorrow after lunch at Switchyard Coffee?", "tess");
    await msg("Yes.");
    const p = (await plans())[0]!;
    expect(p.status).toBe("awaiting_details");
    expect(p.time_local).toBeNull();
    expect(p.time_hint).toBe("after lunch");
  });
  it("counterproposals replace the same event and require the other person to agree to changed time", async () => {
    await msg("Want dinner Sunday at 7 PM at Fanelli's?", "tess");
    await msg("How about 8 PM instead?");
    await msg("Yes, 8 PM works for me.", "tess");
    const rows = await plans();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.time_local).toBe("20:00");
    expect(rows[0]?.status).toBe("accepted");
  });
  it("reprocessing and refreshing retain IDs and never duplicate events", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const p = (await plans())[0]!;
    await syncCalendar(client(), user, clock);
    await syncCalendar(postgresSupabase(db).admin, user, clock);
    expect((await plans()).map((p) => p.id)).toEqual([p.id]);
  });
  it("cancellation preserves the same event and updates canonical plan context", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const p = (await plans())[0]!;
    await msg("Please cancel our coffee plan.");
    expect((await plans())[0]?.status).toBe("cancelled");
    const memories = await db.query<{ summary: string }>(
      "SELECT summary FROM memories WHERE user_id=$1",
      [user],
    );
    expect(memories.rows.map((m) => m.summary).join(" ")).toContain("status cancelled");
    expect((await plans())[0]?.id).toBe(p.id);
  });
  it("structured acceptance uses the same event and cannot fabricate user consent", async () => {
    await msg("Coffee Sunday at 2 PM at Switchyard Coffee?");
    const p = (await plans())[0]!;
    const source = await rawMessage("I'd love to.");
    const actions = await prepareScheduleActions(
      client(),
      user,
      conv,
      {
        messages: ["I'd love to."],
        schedule_actions: [action({ action: "accept", planId: p.id, category: null, title: null })],
      },
      clock,
    );
    await rpc("calendar_apply_actions", {
      p_user: user,
      p_kind: "message",
      p_source: source,
      p_actions: actions,
      p_now: clock.toISOString(),
    });
    expect((await plans())[0]?.status).toBe("accepted");
    await expect(
      prepareScheduleActions(
        client(),
        user,
        conv,
        {
          messages: ["Fine"],
          schedule_actions: [action({ action: "accept", planId: p.id, userQuote: "Yes" })],
        },
        clock,
        { userText: "No thanks" },
      ),
    ).rejects.toThrow("exact current user evidence");
  });
  it("cross-user source and event IDs fail closed", async () => {
    const source = await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    const p = (await plans())[0]!;
    await expect(
      rpc("calendar_event_action", {
        p_user: other,
        p_kind: "message",
        p_source: source,
        p_ordinal: 0,
        p_payload: { action: "accept", planId: p.id },
        p_now: clock.toISOString(),
      }),
    ).rejects.toThrow();
  });
  it("accepted appointments override the weekly baseline and remain accepted on repeat acknowledgement", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const p = (await plans())[0]!;
    await db.query(
      "UPDATE social_plans SET starts_at='2026-10-26T14:00Z',ends_at='2026-10-26T15:00Z',date_local='2026-10-26',time_local='10:00' WHERE id=$1",
      [p.id],
    );
    await msg("Yes, see you there.", "tess");
    expect((await plans())[0]?.status).toBe("accepted");
    await experienceSeed(client(), user, clock);
    clock = new Date("2026-10-26T14:30Z");
    await experienceCommand(client(), user, p.id, id(), "claim", null, {}, clock);
    await generateExperience(client(), user, p.id, id(), "turn", "", null, false, clock);
    expect((await livingHistory(client(), user, p.id)).scene.state).toBe("interactive");
    expect(model.reply.mock.calls[0]?.[0].availabilityDetail).toContain("Attending the confirmed");
  });
  it("an active Riley park walk can agree to burgers without replacing or conflicting with the walk", async () => {
    await db.query(
      "UPDATE conversations SET character_id=(SELECT id FROM characters WHERE key='riley') WHERE id=$1",
      [conv],
    );
    await msg("Want to walk today at 5 PM at Juniper Commons?", "tess");
    await msg("Absolutely.");
    const parent = (await plans())[0]!;
    expect(parent.status).toBe("accepted");
    clock = new Date("2026-10-24T21:10Z");
    await experienceSeed(client(), user, clock);
    const claimId = id();
    await experienceCommand(client(), user, parent.id, claimId, "claim", null, {}, clock);
    model.reply.mockResolvedValue({
      messages: ["“Yes, burgers afterward sounds good.”"],
      state_delta: { trust: 1 },
      photo: null,
      schedule_actions: null,
    });
    const turn = id();
    await generateExperience(
      client(),
      user,
      parent.id,
      turn,
      "turn",
      "Want burgers afterward at Valley Table?",
      null,
      false,
      clock,
    );
    const records = await plans(),
      child = records.find((p) => p.parent_plan_id === parent.id)!;
    expect(records).toHaveLength(2);
    expect(child.status).toBe("accepted");
    expect(child.conflicts).toEqual([]);
    expect(child.time_hint).toBe("after_parent");
    expect(Date.parse(child.starts_at!)).toBeGreaterThanOrEqual(Date.parse(parent.ends_at!));
    expect(records.find((p) => p.id === parent.id)?.status).toBe("in_progress");
    const h = await livingHistory(client(), user, parent.id);
    expect(h.moments.filter((m) => m.source === "user").map((m) => m.body)).toEqual([
      "Want burgers afterward at Valley Table?",
    ]);
    expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 2 });
    await syncExperienceScheduling(client(), user, parent.id, clock);
    await generateExperience(
      client(),
      user,
      parent.id,
      turn,
      "turn",
      "Want burgers afterward at Valley Table?",
      null,
      false,
      clock,
    );
    expect(await plans()).toHaveLength(2);
    await experienceCommand(client(), user, parent.id, id(), "pause", null, {}, clock);
    await syncCalendar(client(), user, new Date("2026-10-30T18:00Z"));
    expect((await livingHistory(client(), user, parent.id)).scene.state).toBe("paused");
    await experienceSeed(client(), user, clock);
    await expect(
      experienceCommand(
        client(),
        user,
        child.id,
        id(),
        "automatic",
        null,
        { explicit: true },
        new Date("2026-10-25T05:00Z"),
      ),
    ).rejects.toThrow("Finish the earlier experience");
    const candidates = await rpc("experience_candidates", {
      p_user: user,
      p_now: "2026-10-25T05:00Z",
    });
    expect(candidates).toEqual([]);
    model.reply.mockResolvedValue({
      messages: [
        "The walk ends quietly. The agreed next outing remains a plan, not invented attendance.",
      ],
      state_delta: {},
      photo: null,
    });
    clock = new Date("2026-10-30T18:00Z");
    await generateExperience(
      client(),
      user,
      parent.id,
      id(),
      "finish",
      "close_now",
      null,
      false,
      clock,
    );
    // A replayed claim must not revive a completed event.
    await experienceCommand(client(), user, parent.id, claimId, "claim", null, {}, clock);
    expect((await plans()).find((p) => p.id === parent.id)?.status).toBe("completed");
    await experienceSeed(client(), user, clock);
    expect(
      Date.parse((await livingHistory(client(), user, child.id)).scene.claim_deadline),
    ).toBeGreaterThanOrEqual(clock.getTime() + 4 * 3600000);
    expect(
      await rpc("experience_candidates", {
        p_user: user,
        p_now: new Date(clock.getTime() + 3600000).toISOString(),
      }),
    ).toEqual([]);
    await experienceCommand(client(), user, child.id, id(), "window", null, { hours: 6 }, clock);
    expect(Date.parse((await livingHistory(client(), user, child.id)).scene.claim_deadline)).toBe(
      clock.getTime() + 6 * 3600000,
    );
    await experienceCommand(client(), user, child.id, id(), "claim", null, {}, clock);
    expect((await livingHistory(client(), user, child.id)).scene.state).toBe("interactive");
    expect(
      (await db.query("SELECT count(*)::int n FROM shared_events WHERE kind='living_experience'"))
        .rows[0],
    ).toEqual({ n: 1 });
  });
  it("rejects conflicting confirmed commitments with another contact, without leaking private plans", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const first = (await plans())[0]!;
    conv = id();
    await db.query(
      "INSERT INTO conversations(id,user_id,character_id) SELECT $1,$2,id FROM characters WHERE key='claire'",
      [conv, user],
    );
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const second = (await plans()).find((p) => p.id !== first.id)!;
    expect(second.status).toBe("proposed");
    expect(second.conflicts).toContain("calendar_or_travel_overlap");
  });
  it("rescheduling an accepted plan resets the other RSVP and preserves its identifier", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const original = (await plans())[0]!;
    await msg("Can we reschedule our coffee to Sunday at 3 PM instead?");
    expect((await plans())[0]?.id).toBe(original.id);
    expect((await plans())[0]?.character_response).toBe("invited");
    await msg("Yes, 3 PM works for me.", "tess");
    expect((await plans())[0]?.status).toBe("accepted");
    expect((await plans())[0]?.time_local).toBe("15:00");
  });
  it("adds missing details to the same pending invitation rather than creating a second plan", async () => {
    await msg("Would you like coffee tomorrow?", "tess");
    await msg("Absolutely.");
    const original = (await plans())[0]!;
    await msg("Meet me at Switchyard Coffee at 2 PM.", "tess");
    await msg("Yes.");
    const records = await plans();
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(original.id);
    expect(records[0]?.status).toBe("accepted");
  });
  it("resolves tomorrow from Eastern message time across UTC midnight", async () => {
    clock = new Date("2026-10-25T03:59:00Z");
    await msg("Want coffee tomorrow at 2 PM at Switchyard Coffee?", "tess");
    expect((await plans())[0]?.date_local).toBe("2026-10-25");
  });
  it.each([
    ["2027-03-14", "02:30"],
    ["2026-11-01", "01:30"],
  ])("refuses DST ambiguity or a nonexistent time: %s %s", async (date, time) => {
    const source = await rawMessage("A specific local time proposal");
    const actions = await prepareScheduleActions(
      client(),
      user,
      conv,
      {
        messages: ["Let us choose a clear time."],
        schedule_actions: [
          action({ date, time, category: "coffee", title: "Coffee", place: "coffee:local" }),
        ],
      },
      clock,
    );
    await rpc("calendar_apply_actions", {
      p_user: user,
      p_kind: "message",
      p_source: source,
      p_actions: actions,
      p_now: clock.toISOString(),
    });
    const p = (await plans())[0]!;
    expect(p.status).toBe("awaiting_details");
    expect(p.starts_at).toBeNull();
    expect(p.missing_details).toContain("unambiguous local time");
    expect(zonedInstant(date, time)).toBeNull();
  });
  it("never reveals an unknown supporting-character gathering through the unified agenda", async () => {
    const hidden = id();
    await db.query(
      "INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at) VALUES($1,$2,'ben','Private family gathering','coffee:local','2026-10-25T18:00Z','2026-10-25T19:00Z')",
      [user, hidden],
    );
    expect((await schedulingAgenda(client(), user, clock)).events).toEqual([]);
    await db.query("INSERT INTO town_known_plans VALUES($1,$2)", [user, hidden]);
    expect((await schedulingAgenda(client(), user, clock)).events.map((p) => p.id)).toEqual([
      hidden,
    ]);
  });
  it("does not confirm hypothetical or declined invitations", async () => {
    await msg("Maybe someday we could get coffee.", "tess");
    expect(await plans()).toHaveLength(0);
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Maybe, if I finish work.");
    expect((await plans())[0]?.user_response).toBe("invited");
    await msg("No thanks.");
    expect((await plans())[0]?.status).toBe("declined");
  });
  it("blocks a contact’s accepted legacy gathering but does not treat unrelated NPC events as player commitments", async () => {
    const shared = id();
    await db.query(
      "INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at,status) VALUES($1,$2,'ben','Existing family gathering','coffee:local','2026-10-25T18:00Z','2026-10-25T19:00Z','proposed')",
      [user, shared],
    );
    await db.query(
      "INSERT INTO social_rsvps(user_id,plan_id,character_key,response,channel) VALUES($1,$2,'maya','accepted','direct_invitation')",
      [user, shared],
    );
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    expect((await plans())[0]?.conflicts).toContain("calendar_or_travel_overlap");
  });
  it("an unrelated off-screen NPC gathering cannot block an already confirmed experience", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const plan = (await plans())[0]!;
    const hidden = id();
    await db.query(
      "INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at,status) VALUES($1,$2,'ben','Private NPC gathering','coffee:local','2026-10-25T18:00Z','2026-10-25T19:00Z','active')",
      [user, hidden],
    );
    await db.query(
      "INSERT INTO social_rsvps(user_id,plan_id,character_key,response,channel) VALUES($1,$2,'claire','accepted','direct_invitation')",
      [user, hidden],
    );
    clock = new Date("2026-10-25T18:10Z");
    await experienceSeed(client(), user, clock);
    await expect(
      experienceCommand(client(), user, plan.id, id(), "claim", null, {}, clock),
    ).resolves.toMatchObject({ experience: { state: "interactive" } });
  });
  it("structured delivery retains an address follow-through instead of dropping it after marking evidence processed", async () => {
    await msg("Want coffee tomorrow?", "tess");
    await msg("Yes.");
    const plan = (await plans())[0]!;
    const body = "I'll send you the address and time.";
    const source = await rawMessage(body);
    const actions = await prepareScheduleActions(
      client(),
      user,
      conv,
      {
        messages: [body],
        schedule_actions: [
          action({ action: "details", planId: plan.id, title: null, category: null }),
        ],
      },
      clock,
    );
    await rpc("calendar_apply_actions", {
      p_user: user,
      p_kind: "message",
      p_source: source,
      p_actions: actions,
      p_now: clock.toISOString(),
    });
    expect((await plans())[0]?.followthrough).toMatchObject({
      kind: "venue_details",
      status: "awaiting_details",
      source,
    });
  });
  it("an approximate reschedule cannot silently retain the old precise time", async () => {
    await msg("Want coffee Sunday at 2 PM at Switchyard Coffee?", "tess");
    await msg("Absolutely.");
    const original = (await plans())[0]!;
    await msg("Can we reschedule coffee to tomorrow after lunch instead?");
    const pending = (await plans())[0]!;
    expect(pending.id).toBe(original.id);
    expect(pending.time_local).toBeNull();
    expect(pending.starts_at).toBeNull();
    expect(pending.status).toBe("awaiting_details");
    expect(pending.time_hint).toBe("after lunch");
  });
});
