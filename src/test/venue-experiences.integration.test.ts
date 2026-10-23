// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { initializeTown, visitTown, townSnapshot } from "@/lib/town.server";
import {
  calendarScheduleAllows,
  syncCalendar,
  calendarPlans,
  interactiveSnapshot,
  actAtVenue,
} from "@/lib/interactive-world.server";
import { progressVenue } from "@/lib/venue-experiences.server";
import { runSocialTick } from "@/lib/social.server";
import { currentActivity } from "@/lib/world-continuity";
import { characterFor } from "@/lib/characters";
import type { ExperienceState } from "@/lib/venue-experiences";
let db: Awaited<ReturnType<typeof worldDatabase>>,
  admin: ReturnType<typeof postgresSupabase>["admin"];
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  id = () => crypto.randomUUID(),
  noon = new Date("2026-10-22T16:00:00Z"),
  at = new Date("2026-10-22T23:01:00Z");
beforeAll(async () => {
  db = await worldDatabase();
  admin = postgresSupabase(db).admin;
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE conversations CASCADE; TRUNCATE town_messages,town_actions,town_connections,town_presence,town_people CASCADE; TRUNCATE social_plans CASCADE; TRUNCATE world_places CASCADE; TRUNCATE character_knowledge; TRUNCATE user_profile;",
  );
  await db.query("update interactive_world_installation set installed_at=$1", [
    "2026-10-22T00:00:00Z",
  ]);
  await db.query(
    "insert into conversations(user_id,character_id,real_time_mode) select $1,id,true from characters where key='claire'",
    [user],
  );
  await initializeTown(admin, user);
  await syncCalendar(admin, user, noon);
});
async function startBook() {
  for (const [i, sender, body] of [
    [0, "tess", "Want to come to book club tonight at 7 PM at Lantern Reading Room?"],
    [1, "user", "Yes!"],
  ] as const)
    await db.query(
      "insert into messages(user_id,conversation_id,sender,body,created_at,visible_at) select $1,id,$2,$3,$4,$4 from conversations where user_id=$1",
      [user, sender, body, new Date(noon.getTime() + i * 1000).toISOString()],
    );
  await syncCalendar(admin, user, new Date(noon.getTime() + 2000));
  const plan = (await calendarPlans(admin, user))[0]!;
  await visitTown(admin, user, "reading:lantern", new Date("2026-10-22T22:30:00Z"));
  await interactiveSnapshot(admin, user, at);
  return plan;
}
async function play(
  place: string,
  kind: "trivia" | "book_club",
  step: number,
  choice: number,
  planId?: string,
  aid = id(),
  userId = user,
) {
  return progressVenue(
    admin,
    userId,
    { id: aid, place, kind, step, choice, ...(planId ? { planId } : {}) },
    at,
  ) as Promise<{ experience: ExperienceState; replayed?: boolean }>;
}
describe("persistent venue progression on real PostgreSQL", () => {
  it("records book-club choices, shared memory, departure and returning-visit history without touching another character", async () => {
    const p = await startBook();
    expect(p.status).toBe("accepted");
    await play("reading:lantern", "book_club", -1, -1, p.id);
    for (let step = 0; step < 3; step++)
      await play("reading:lantern", "book_club", step, step, p.id);
    let snap = await interactiveSnapshot(admin, user, at);
    expect(
      (snap.session!.state as { experiences: Record<string, ExperienceState> }).experiences[p.id]!
        .status,
    ).toBe("completed");
    const memories = (await db.query<{ summary: string }>("select * from memories")).rows;
    expect(memories).toHaveLength(1);
    expect(memories[0]!.summary).toContain("A character's difficult decision");
    expect(memories[0]!.summary).not.toContain("became friends");
    expect(
      (await db.query("select * from character_knowledge where character_key<>'claire'")).rows,
    ).toHaveLength(0);
    await actAtVenue(
      admin,
      user,
      { id: id(), place: "reading:lantern", action: "leave", text: "" },
      new Date("2026-10-22T23:30:00Z"),
    );
    expect((await calendarPlans(admin, user))[0]!.status).toBe("completed");
    await visitTown(admin, user, "reading:lantern", new Date("2026-10-23T16:00:00Z"));
    snap = await interactiveSnapshot(admin, user, new Date("2026-10-23T16:20:00Z"));
    expect(snap.recentVisits.filter((v) => v.place_key === "reading:lantern")).toHaveLength(2);
    expect(snap.recentVisits.some((v) => (v.state as { experiences?: unknown }).experiences)).toBe(
      true,
    );
  });
  it("completes recorded participation when the user travels elsewhere without pressing Leave", async () => {
    const p = await startBook();
    await play("reading:lantern", "book_club", -1, -1, p.id);
    const departure = new Date("2026-10-22T23:30:00Z");
    await visitTown(admin, user, "trivia:foundry", departure);
    const next = await interactiveSnapshot(admin, user, departure);
    expect(next.session).toBeNull();
    expect((await calendarPlans(admin, user))[0]!.status).toBe("completed");
    const count = (await db.query("select * from memories")).rows.length;
    await interactiveSnapshot(admin, user, departure);
    expect((await db.query("select * from memories")).rows).toHaveLength(count);
    expect(
      next.recentVisits.find((v) => v.place_key === "reading:lantern")?.departed_at,
    ).not.toBeNull();
  });
  it("scores actual trivia answers once, rejects stale steps and permits no score rerolls", async () => {
    await visitTown(admin, user, "trivia:foundry", new Date("2026-10-22T22:30:00Z"));
    await play("trivia:foundry", "trivia", -1, -1);
    const aid = id();
    const first = await play("trivia:foundry", "trivia", 0, 0, undefined, aid);
    expect(first.experience.score).toBe(0);
    expect((await play("trivia:foundry", "trivia", 0, 0, undefined, aid)).replayed).toBe(true);
    await expect(play("trivia:foundry", "trivia", 0, 1)).rejects.toThrow("refresh");
    await expect(play("trivia:foundry", "trivia", 0, 1, undefined, aid)).rejects.toThrow(
      "different request",
    );
    await play("trivia:foundry", "trivia", 1, 2);
    const last = await play("trivia:foundry", "trivia", 2, 0);
    expect(last.experience).toMatchObject({ status: "completed", score: 2, step: 3 });
    expect((await play("trivia:foundry", "trivia", -1, -1)).experience.score).toBe(2);
    expect((await db.query("select * from memories")).rows).toHaveLength(0);
  });
  it("requires arrival, venue compatibility, available options and owner-confirmed companion presence", async () => {
    await expect(play("reading:lantern", "book_club", -1, -1)).rejects.toThrow("Arrive");
    const p = await startBook();
    await expect(play("reading:lantern", "trivia", -1, -1)).rejects.toThrow("unavailable");
    await expect(play("reading:lantern", "book_club", -1, -1, p.id, id(), other)).rejects.toThrow(
      "Arrive",
    );
    await play("reading:lantern", "book_club", -1, -1, p.id);
    await expect(play("reading:lantern", "book_club", 0, 99, p.id)).rejects.toThrow(
      "available option",
    );
    await db.query("delete from social_presence where user_id=$1", [user]);
    await expect(play("reading:lantern", "book_club", 0, 0, p.id)).rejects.toThrow("companion");
  });
  it("serializes different concurrent answers and records only one contribution for the expected step", async () => {
    await visitTown(admin, user, "trivia:foundry", new Date("2026-10-22T22:30:00Z"));
    await play("trivia:foundry", "trivia", -1, -1);
    const results = await Promise.allSettled([
      play("trivia:foundry", "trivia", 0, 1),
      play("trivia:foundry", "trivia", 0, 2),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const state = (await interactiveSnapshot(admin, user, at)).session!.state as {
      experiences: Record<string, ExperienceState>;
    };
    expect(state.experiences["solo:trivia"]!.answers).toHaveLength(1);
  });
  it("preserves Tess's independent Thursday trivia and established teammate identities without user involvement", async () => {
    expect((await db.query("select * from messages")).rows).toHaveLength(0);
    expect(currentActivity(characterFor("tess"), at)).toMatchObject({
      activity: "at trivia",
    });
    expect(calendarScheduleAllows("tess", "2026-10-22", "19:00", "diner:valley")).toBe(false);
    await runSocialTick(admin, user, at);
    const events = await db.query(
      "select e.id from shared_events e join event_participants p on p.event_id=e.id and p.user_id=e.user_id where e.user_id=$1 and e.kind='trivia' and p.participant_key='tess'",
      [user],
    );
    expect(events.rows.length).toBeGreaterThan(0);
    const count = events.rows.length;
    await runSocialTick(admin, user, at);
    expect(
      (
        await db.query(
          "select e.id from shared_events e join event_participants p on p.event_id=e.id and p.user_id=e.user_id where e.user_id=$1 and e.kind='trivia' and p.participant_key='tess'",
          [user],
        )
      ).rows,
    ).toHaveLength(count);
    expect((await db.query("select * from messages")).rows).toHaveLength(0);
  });
  it("persists owner-scoped saved places with idempotent add/remove and service-only writes", async () => {
    await initializeTown(admin, other);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await admin.rpc("town_favorite", {
            p_user: user,
            p_place: "coffee:local",
            p_enabled: true,
          })
        ).error,
      ).toBeNull();
    expect((await townSnapshot(admin, user, noon)).favorites).toEqual(["coffee:local"]);
    expect((await townSnapshot(admin, other, noon)).favorites).toEqual([]);
    await admin.rpc("town_favorite", { p_user: user, p_place: "coffee:local", p_enabled: false });
    expect((await townSnapshot(admin, user, noon)).favorites).toEqual([]);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','venue_progress(uuid,uuid,text,text,integer,integer,timestamptz,uuid)','EXECUTE') allowed",
        )
      ).rows[0]!.allowed,
    ).toBe(false);
  });
});
