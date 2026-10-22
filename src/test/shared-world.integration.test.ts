// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { sharedCommand, runSharedWorldTick, sharedPlanContext } from "@/lib/shared-world.server";
import {
  previewSharedPlan,
  sharedRsvpDecision,
  scheduleAllows,
  type SharedPlan,
} from "@/lib/shared-world";
let db: Awaited<ReturnType<typeof worldDatabase>>;
let admin: ReturnType<typeof postgresSupabase>["admin"];
const user = "10000000-0000-4000-a000-000000000001";
const other = "10000000-0000-4000-a000-000000000002";
const now = new Date("2026-10-22T18:00:00Z");
const start = "2026-10-25T18:00:00Z",
  end = "2026-10-25T20:00:00Z"; // Sunday 2–4 PM Eastern.
let id: string;
async function create(planId = id) {
  return sharedCommand(
    admin,
    user,
    planId,
    "create",
    {
      organizer: "ben",
      place: "home:ben",
      title: "A small family gathering",
      startsAt: start,
      endsAt: end,
    },
    now,
    0,
  );
}
async function read() {
  return (
    await db.query<SharedPlan>("select * from social_plans where user_id=$1 and id=$2", [user, id])
  ).rows[0]!;
}
async function invite(plan: SharedPlan) {
  return sharedCommand(
    admin,
    user,
    id,
    "invite",
    { actor: "ben", character: "claire", channel: "user_relay" },
    now,
    plan.version,
  );
}
const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::integer n from ${table}`)).rows[0]!.n;
beforeAll(async () => {
  db = await worldDatabase();
  admin = postgresSupabase(db).admin;
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE conversations CASCADE; TRUNCATE job_runs CASCADE; TRUNCATE world_control; TRUNCATE social_plans CASCADE; TRUNCATE world_places CASCADE; TRUNCATE npcs,social_links,shared_events,event_participants,character_knowledge;",
  );
  for (const [n, key] of ["ben", "claire", "tess"].entries()) {
    const cid = `20000000-0000-4000-a000-${String(n + 1).padStart(12, "0")}`;
    await db.query(
      "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key=$3",
      [cid, user, key],
    );
    await db.query("insert into tess_state(conversation_id,user_id) values($1,$2)", [cid, user]);
    await db.query(
      "insert into memories(conversation_id,user_id,summary) values($1,$2,'An existing private history remains unchanged')",
      [cid, user],
    );
  }
  for (let n = 1; n < 100; n++) {
    id = `30000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
    if (
      sharedRsvpDecision({ id, starts_at: start, ends_at: end }, "claire", "user_relay", now)
        .response === "accepted"
    )
      break;
  }
});
describe("transactional shared-world proof without paid inference", () => {
  it("Ben's proposal leaves Claire unaware until a real invitation is relayed", async () => {
    let plan = await create();
    expect(
      (await db.query("select * from character_knowledge where character_key='claire'")).rows,
    ).toHaveLength(0);
    plan = await invite(plan);
    const knowledge = (
      await db.query<{ summary: string }>(
        "select summary from character_knowledge where character_key='claire'",
      )
    ).rows;
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0]!.summary).toContain("Invitation from ben via user_relay");
    expect(await count("memories")).toBe(3); // No invented attendance or private-chat copying.
    expect(plan.user_attendance).toBe("not_reported");
  });
  it("runs invitation, independent RSVP, one meeting, separate memories, normal follow-up intentions and completion offline", async () => {
    await invite(await create());
    expect(await runSharedWorldTick(admin, user, now)).toMatchObject({
      checked: 1,
      transitions: 1,
    });
    expect(
      (
        await db.query<{ response: string }>(
          "select response from social_rsvps where character_key='claire'",
        )
      ).rows[0]!.response,
    ).toBe("accepted");
    await runSharedWorldTick(admin, user, new Date(start));
    expect((await read()).status).toBe("active");
    expect(await count("social_exchanges")).toBe(1);
    expect(await sharedPlanContext(admin, user, "ben", new Date(start))).toMatchObject({
      activity: "at home:ben",
    });
    expect(await sharedPlanContext(admin, user, "tess", new Date(start))).toBeNull();
    expect(await count("social_presence")).toBe(2);
    await runSharedWorldTick(admin, user, new Date(end));
    await runSharedWorldTick(admin, user, new Date(end)); // Worker retry cannot repeat the encounter/memories.
    expect((await read()).status).toBe("completed");
    expect(await count("social_presence")).toBe(0);
    expect(await count("social_exchanges")).toBe(1);
    expect(await count("memories")).toBe(5);
    const memories = (
      await db.query<{ summary: string }>(
        "select summary from memories where summary like '%I hosted%' or summary like '%I attended%'",
      )
    ).rows.map((r) => r.summary);
    expect(memories.some((m) => m.startsWith("I hosted"))).toBe(true);
    expect(memories.some((m) => m.startsWith("I attended"))).toBe(true);
    expect(
      (await db.query("select * from character_knowledge where character_key='tess'")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query<{ level: string }>("select level from social_links")).rows.every(
        (r) => r.level === "acquaintance",
      ),
    ).toBe(true);
    expect(
      (await db.query("select * from world_records where kind='check_in' and status='pending'"))
        .rows,
    ).toHaveLength(2);
    expect(await count("messages")).toBe(0); // Not a fake incoming message or notification.
  });
  it("allows independent declines and does not manufacture a meeting", async () => {
    await invite(await create());
    const plan = await read();
    await sharedCommand(
      admin,
      user,
      id,
      "respond",
      { character: "claire", response: "declined", reason: "prefers_other_plans" },
      now,
      plan.version,
    );
    await runSharedWorldTick(admin, user, new Date(end));
    expect((await read()).status).toBe("missed");
    expect(await count("social_exchanges")).toBe(0);
  });
  it("supports bounded catch-up for previously accepted plans without replaying AI conversations", async () => {
    await invite(await create());
    await runSharedWorldTick(admin, user, now);
    await runSharedWorldTick(admin, user, new Date("2026-10-28T18:00:00Z"));
    expect((await read()).status).toBe("completed");
    expect(await count("social_exchanges")).toBe(1);
    expect(await count("social_presence")).toBe(0);
  });
  it("rescheduling requires fresh decisions and cancellation does not erase history", async () => {
    let plan = await invite(await create());
    plan = await sharedCommand(
      admin,
      user,
      id,
      "respond",
      { character: "claire", response: "accepted" },
      now,
      plan.version,
    );
    plan = await sharedCommand(
      admin,
      user,
      id,
      "reschedule",
      { startsAt: "2026-10-26T23:00:00Z", endsAt: "2026-10-27T01:00:00Z" },
      now,
      plan.version,
    );
    expect(
      (
        await db.query<{ response: string }>(
          "select response from social_rsvps where character_key='claire'",
        )
      ).rows[0]!.response,
    ).toBe("invited");
    plan = await sharedCommand(admin, user, id, "cancel", {}, now, plan.version);
    expect(plan.status).toBe("cancelled");
    expect(await count("character_knowledge")).toBeGreaterThan(0);
  });
  it("rejects simultaneous/travel-overlapping plans and stale concurrent transitions", async () => {
    let plan = await invite(await create());
    await expect(sharedCommand(admin, user, id, "cancel", {}, now, 0)).rejects.toThrow("rejected");
    const second = "30000000-0000-4000-a000-999999999999";
    await expect(create(second)).rejects.toThrow("rejected");
    plan = await sharedCommand(
      admin,
      user,
      id,
      "respond",
      { character: "claire", response: "accepted" },
      now,
      plan.version,
    );
    const inviteClaire = () =>
      sharedCommand(admin, user, id, "advance", {}, new Date(start), plan.version);
    await Promise.allSettled([inviteClaire(), inviteClaire()]);
    expect(await count("social_exchanges")).toBe(1);
  });
  it("denies browser-role mutation and cross-user plan access", async () => {
    await create();
    await expect(
      sharedCommand(admin, other, id, "advance", {}, new Date(end), 0),
    ).rejects.toThrow();
    await db.exec("SET ROLE authenticated");
    try {
      await expect(create()).rejects.toThrow();
      expect((await db.query("select * from social_plans")).rows).toHaveLength(0);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("retries creation without duplicating places, plans or proposals", async () => {
    await create();
    await create();
    expect(await count("social_plans")).toBe(1);
    expect(await count("world_places")).toBe(6);
    expect(await count("character_knowledge")).toBe(1);
  });
  it("multi-day Practice preview changes no database, user action or relationship state", async () => {
    const plan = await create(),
      before = JSON.stringify(plan),
      records = await count("character_knowledge");
    const preview = previewSharedPlan(plan, "claire", now, 7);
    expect(preview.timeline.at(-1)?.state).toBe("completed");
    expect(JSON.stringify(plan)).toBe(before);
    expect(await count("character_knowledge")).toBe(records);
    expect(preview.userAttendance).toBe("not_reported");
    expect(scheduleAllows("claire", "2026-10-23T14:00:00Z", "2026-10-23T16:00:00Z")).toBe(false);
  });
  it("does not transmit an invitation without the organizer's valid channel", async () => {
    const plan = await create();
    await expect(
      sharedCommand(
        admin,
        user,
        id,
        "invite",
        { actor: "tess", character: "claire", channel: "direct_invitation" },
        now,
        plan.version,
      ),
    ).rejects.toThrow();
    expect(
      (await db.query("select * from character_knowledge where character_key='claire'")).rows,
    ).toHaveLength(0);
  });
  it("retains per-character uniqueness while allowing multiple characters per user", async () => {
    expect(await count("conversations")).toBe(3);
    await expect(
      db.query(
        "insert into conversations(user_id,character_id) select $1,id from characters where key='ben'",
        [user],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select * from memories where summary='An existing private history remains unchanged'",
        )
      ).rows,
    ).toHaveLength(3);
  });
  it("rolls back all meeting projections on a worker/database failure and repairs once on retry", async () => {
    let plan = await invite(await create());
    plan = await sharedCommand(
      admin,
      user,
      id,
      "respond",
      { character: "claire", response: "accepted" },
      now,
      plan.version,
    );
    await db.exec(
      `CREATE FUNCTION test_meeting_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.summary LIKE 'I attended%' THEN RAISE EXCEPTION 'test fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER meeting_fault BEFORE INSERT ON memories FOR EACH ROW EXECUTE FUNCTION test_meeting_fault();`,
    );
    try {
      await expect(
        sharedCommand(admin, user, id, "advance", {}, new Date(start), plan.version),
      ).rejects.toThrow();
      expect(await count("social_exchanges")).toBe(0);
      expect(await count("social_presence")).toBe(0);
      expect(await count("memories")).toBe(3);
      expect((await read()).status).toBe("proposed");
    } finally {
      await db.exec("DROP TRIGGER meeting_fault ON memories; DROP FUNCTION test_meeting_fault();");
    }
    await sharedCommand(admin, user, id, "advance", {}, new Date(start), plan.version);
    expect(await count("social_exchanges")).toBe(1);
    expect(await count("memories")).toBe(5);
  });
});
