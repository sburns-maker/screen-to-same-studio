// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { initializeTown, visitTown, encounterTurn, townCommand } from "@/lib/town.server";
import {
  syncCalendar,
  calendarPlans,
  interactiveSnapshot,
  calendarContext,
  actAtVenue,
} from "@/lib/interactive-world.server";
import { runSharedWorldTick } from "@/lib/shared-world.server";
import { runStructured } from "@/lib/text-ai.server";
vi.mock("@/lib/text-ai.server", () => ({ runStructured: vi.fn() }));
vi.mock("@/lib/tess.functions", () => ({ runTurn: vi.fn().mockResolvedValue({ replied: true }) }));
import { runTurn } from "@/lib/tess.functions";
let db: Awaited<ReturnType<typeof worldDatabase>>,
  admin: ReturnType<typeof postgresSupabase>["admin"];
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002";
const base = new Date("2026-10-22T16:00:00Z");
let clock: Date;
const id = () => crypto.randomUUID();
async function message(character: string, sender: string, body: string) {
  const mid = id();
  await db.query(
    "insert into messages(id,user_id,conversation_id,sender,body,created_at,visible_at) select $1,$2,c.id,$3,$4,$5,$5 from conversations c join characters ch on ch.id=c.character_id where c.user_id=$2 and ch.key=$6",
    [mid, user, sender, body, clock.toISOString(), character],
  );
  clock = new Date(clock.getTime() + 1000);
  await syncCalendar(admin, user, clock);
  return mid;
}
async function book() {
  await message("claire", "tess", "Want to come along to book club tonight?");
  await message("claire", "user", "Yes! Want me to pick you up or meet you there?");
  await message("claire", "tess", "Meet me there. I'll send you the address.");
  await message("claire", "tess", "Let's use Lantern Reading Room at 7 PM.");
  return (await calendarPlans(admin, user))[0]!;
}
async function venue(action: string, at: Date, plan?: string, actionId = id()) {
  const r = await admin.rpc("venue_act", {
    p_user: user,
    p_id: actionId,
    p_place: "reading:lantern",
    p_action: action,
    p_detail: "",
    p_now: at.toISOString(),
    ...(plan ? { p_plan: plan } : {}),
  });
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
beforeAll(async () => {
  db = await worldDatabase();
  admin = postgresSupabase(db).admin;
}, 30000);
beforeEach(async () => {
  clock = new Date(base);
  await db.exec(
    "TRUNCATE conversations CASCADE; TRUNCATE town_messages,town_actions,town_connections,town_presence,town_people CASCADE; TRUNCATE social_plans CASCADE; TRUNCATE world_places CASCADE; TRUNCATE character_knowledge;",
  );
  await db.query("update interactive_world_installation set installed_at=$1", [
    new Date(base.getTime() - 1000).toISOString(),
  ]);
  for (const key of ["claire", "tess", "maya", "jordan", "ben"])
    await db.query(
      "insert into conversations(user_id,character_id,real_time_mode) select $1,id,true from characters where key=$2",
      [user, key],
    );
  await initializeTown(admin, user);
  vi.mocked(runStructured).mockReset().mockResolvedValue({
    reply: "I enjoy hearing different perspectives on a book.",
    willingToExchangeContact: true,
    memories: null,
    followup: null,
  });
});
afterAll(async () => {
  await db.close();
});
describe("Claire book-club end-to-end — actual persistent services", () => {
  it("creates one invitation, accepts ordinary chat, fills details and never fabricates an address", async () => {
    await message("claire", "tess", "Want to come along to book club tonight?");
    let p = (await calendarPlans(admin, user))[0]!;
    expect(p.status).toBe("awaiting_details");
    expect(p.date_local).toBe("2026-10-22");
    expect(p.starts_at).toBeNull();
    await message("claire", "user", "Yes! Want me to pick you up or meet you there?");
    p = (await calendarPlans(admin, user))[0]!;
    expect(p.user_response).toBe("accepted");
    expect(p.status).toBe("awaiting_details");
    await message("claire", "tess", "Meet me there. I'll send you the address.");
    expect((await calendarPlans(admin, user))[0]!.followthrough).toMatchObject({
      kind: "venue_details",
      status: "awaiting_details",
    });
    await message("claire", "tess", "Let's use Lantern Reading Room at 7 PM.");
    const plans = await calendarPlans(admin, user);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: p.id,
      status: "accepted",
      place_key: "reading:lantern",
    });
    expect(new Date(plans[0]!.starts_at!).toISOString()).toBe("2026-10-22T23:00:00.000Z");
    await syncCalendar(admin, user, clock);
    expect(await calendarPlans(admin, user)).toHaveLength(1);
    const context = await calendarContext(admin, user, p.conversation_id!, "claire", clock);
    expect(context.join("\n")).toContain("NO VERIFIED STREET ADDRESS");
    expect(context.join("\n")).toContain("Lantern Reading Room");
  });
  it("travels, waits, meets Claire/NPCs, participates and remembers only explicit actions", async () => {
    const p = await book(),
      depart = new Date("2026-10-22T22:30:00Z");
    await visitTown(admin, user, "reading:lantern", depart);
    await expect(venue("join", depart, p.id)).rejects.toThrow("Arrive");
    const early = await interactiveSnapshot(admin, user, new Date("2026-10-22T22:50:00Z"));
    expect(early.session?.place_key).toBe("reading:lantern");
    expect(early.companions).toHaveLength(0);
    await venue("wait", new Date("2026-10-22T22:50:00Z"));
    const during = new Date("2026-10-22T23:01:00Z"),
      snap = await interactiveSnapshot(admin, user, during);
    expect(snap.companions.map((c) => c.character_key)).toEqual(["claire"]);
    expect((await calendarPlans(admin, user))[0]!.user_attendance).toBe("not_reported");
    await venue("join", during, p.id);
    const orderId = id();
    await venue("discuss", during, p.id, orderId);
    await venue("discuss", during, p.id, orderId);
    await venue("seat", during, p.id);
    expect((await calendarPlans(admin, user))[0]!.user_attendance).toBe("participated");
    await encounterTurn(
      admin,
      user,
      id(),
      "orla-june",
      "Hello, I am joining the discussion.",
      "scene",
      during,
    );
    expect(
      (await db.query("select * from town_connections where npc_key='orla-june'")).rows,
    ).toHaveLength(1);
    await venue("leave", new Date("2026-10-22T23:40:00Z"));
    const done = (await calendarPlans(admin, user))[0]!;
    expect(done.status).toBe("completed");
    const memories = (await db.query<{ summary: string }>("select * from memories")).rows;
    expect(memories).toHaveLength(1);
    expect(memories[0]!.summary).toContain("Book club");
    expect(
      (await db.query("select * from character_knowledge where character_key='maya'")).rows,
    ).toHaveLength(0);
    expect(
      new Date(
        (await db.query<{ arrives_at: string }>("select * from town_presence")).rows[0]!.arrives_at,
      ).toISOString(),
    ).toBe("2026-10-22T23:55:00.000Z");
  });
  it("uses ordinary primary conversation delivery for explicit in-venue speech", async () => {
    const p = await book(),
      during = new Date("2026-10-22T23:01:00Z");
    await visitTown(admin, user, "reading:lantern", new Date("2026-10-22T22:30:00Z"));
    await interactiveSnapshot(admin, user, during);
    const data = {
      id: id(),
      place: "reading:lantern",
      action: "speak" as const,
      text: "I liked the discussion about the ending.",
      planId: p.id,
      character: "claire" as const,
    };
    vi.mocked(runTurn).mockClear();
    await actAtVenue(admin, user, data, during);
    expect(runTurn).toHaveBeenCalledWith(admin, user, p.conversation_id, "America/New_York");
    const rows = (
      await db.query<{ sender: string; body: string }>("select * from messages where id=$1", [
        data.id,
      ])
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender: "user", body: data.text });
    await actAtVenue(admin, user, data, during);
    expect((await db.query("select * from messages where id=$1", [data.id])).rows).toHaveLength(1);
    await expect(
      actAtVenue(admin, user, { ...data, text: "Changed request" }, during),
    ).rejects.toThrow("different request");
  });
  it("does not force character presence through a current schedule block", async () => {
    await book();
    const at = "2026-10-22T23:01:00Z";
    const r = await admin.rpc("calendar_advance", {
      p_user: user,
      p_now: at,
      p_blocked: ["claire"],
    });
    expect(r.error).toBeNull();
    expect((await db.query("select * from social_presence")).rows).toHaveLength(0);
    await syncCalendar(admin, user, new Date(at));
    expect((await db.query("select * from social_presence")).rows).toHaveLength(1);
    await admin.rpc("calendar_advance", { p_user: user, p_now: at, p_blocked: ["claire"] });
    expect((await db.query("select * from social_presence")).rows).toHaveLength(0);
  });
  it("does not erase an ongoing accepted event when a companion repeats meeting details", async () => {
    const p = await book();
    clock = new Date("2026-10-22T23:01:00Z");
    await syncCalendar(admin, user, clock);
    await message("claire", "tess", "Meet me there. I'll send you the address.");
    const plans = await calendarPlans(admin, user);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: p.id, status: "in_progress", missing_details: [] });
  });
  it("does not complete or invent user attendance after an unattended event expires", async () => {
    await book();
    await syncCalendar(admin, user, new Date("2026-10-23T01:00:00Z"));
    expect((await calendarPlans(admin, user))[0]!.status).toBe("missed");
    expect((await db.query("select * from memories")).rows).toHaveLength(0);
  });
});
describe("calendar reliability and isolated state", () => {
  it("accepts a player invitation through the character’s ordinary response", async () => {
    await message("tess", "user", "Let's have dinner Friday at 6 PM at Valley Table.");
    await message("tess", "tess", "Yes, that works for me.");
    const p = (await calendarPlans(admin, user))[0]!;
    expect(p.status).toBe("accepted");
    expect(p.category).toBe("dinner");
    expect(p.date_local).toBe("2026-10-23");
  });
  it("supports Maya Saturday without silently accepting a work conflict", async () => {
    await message("maya", "tess", "Want to meet at Switchyard Coffee Saturday at 2 PM?");
    await message("maya", "user", "Yes!");
    const p = (await calendarPlans(admin, user))[0]!;
    expect(p.status).toBe("proposed");
    expect(p.conflicts).toContain("character_schedule_or_venue_hours");
  });
  it("warns about overlapping user commitments and preserves the first event", async () => {
    const p = await book();
    await message("ben", "tess", "Want to get coffee tonight at 7 PM at Switchyard Coffee?");
    await message("ben", "user", "Yes!");
    const plans = await calendarPlans(admin, user);
    expect(plans.find((x) => x.id === p.id)?.status).toBe("accepted");
    expect(plans.find((x) => x.organizer === "ben")?.conflicts).toContain(
      "calendar_or_travel_overlap",
    );
  });
  it("reschedules the same invitation, requires renewed consent and supports cancellation", async () => {
    const p = await book();
    await message("claire", "user", "Can we reschedule book club to Friday at 7 PM instead?");
    const current = (await calendarPlans(admin, user))[0]!;
    expect(current.id).toBe(p.id);
    expect(current.status).toBe("rescheduled");
    expect(current.character_response).toBe("invited");
    await message("claire", "tess", "Yes, that works for me.");
    expect((await calendarPlans(admin, user))[0]!.status).toBe("accepted");
    await message("claire", "user", "Please cancel our book club plan.");
    expect((await calendarPlans(admin, user))[0]!.status).toBe("cancelled");
    expect(await calendarPlans(admin, user)).toHaveLength(1);
  });
  it("keeps JSON order/seating state and prevents actions elsewhere or with another tenant’s plan", async () => {
    await syncCalendar(admin, user, clock);
    await visitTown(admin, user, "coffee:local", clock);
    const at = new Date(clock.getTime() + 16 * 60000);
    const aid = id();
    await actAtVenue(
      admin,
      user,
      { id: aid, place: "coffee:local", action: "freeform", text: "Order coffee for two" },
      at,
    );
    await actAtVenue(
      admin,
      user,
      { id: aid, place: "coffee:local", action: "freeform", text: "Order coffee for two" },
      at,
    );
    const snap = await interactiveSnapshot(admin, user, at);
    expect(snap.session?.state).toMatchObject({ order: { item: "coffee", quantity: 2 } });
    expect(snap.actions).toHaveLength(1);
    await expect(
      actAtVenue(admin, user, { id: aid, place: "coffee:local", action: "seat", text: "" }, at),
    ).rejects.toThrow("different request");
    await expect(
      actAtVenue(admin, other, { id: id(), place: "coffee:local", action: "seat", text: "" }, at),
    ).rejects.toThrow("Arrive");
  });
  it("keeps unsupported actions and unavailable host confirmations honest", async () => {
    await syncCalendar(admin, user, clock);
    await visitTown(admin, user, "reading:lantern", clock);
    await expect(
      actAtVenue(
        admin,
        user,
        {
          id: id(),
          place: "reading:lantern",
          action: "freeform",
          text: "Make Claire fall in love",
        },
        new Date(clock.getTime() + 16 * 60000),
      ),
    ).rejects.toThrow("conversation");
    const p = await book();
    await message("claire", "tess", "I'll confirm with the host.");
    expect(
      (await calendarPlans(admin, user)).find((x) => x.id === p.id)?.followthrough,
    ).toMatchObject({ kind: "host_unavailable", status: "unavailable_no_host_tool" });
  });
  it("keeps legacy worker behavior and existing user history, without replaying old chat", async () => {
    await db.query("update interactive_world_installation set installed_at=$1", [
      new Date(clock.getTime() + 86400000).toISOString(),
    ]);
    await message("jordan", "tess", "Want to take a walk tomorrow?");
    expect(await calendarPlans(admin, user)).toHaveLength(0);
    expect((await db.query("select * from messages")).rows).toHaveLength(1);
    expect(await runSharedWorldTick(admin, user, clock)).toMatchObject({ transitions: 0 });
  });
  it("does not break an explicitly requested conversation reset or reactivate its detached plans", async () => {
    const p = await book();
    await db.query("delete from conversations where id=$1", [p.conversation_id]);
    expect(await calendarPlans(admin, user)).toHaveLength(0);
    await syncCalendar(admin, user, new Date("2026-10-22T23:01:00Z"));
    expect(
      (await db.query("select * from social_presence where plan_id=$1", [p.id])).rows,
    ).toHaveLength(0);
  });
  it("enforces service-only calendar/venue mutation and owner-scoped evidence", async () => {
    await book();
    const denied = await admin.rpc("calendar_apply", {
      p_user: other,
      p_message: (await calendarPlans(admin, user))[0]!.source_message_id!,
      p_payload: { action: "accept", planId: (await calendarPlans(admin, user))[0]!.id },
      p_now: clock.toISOString(),
    });
    expect(denied.error).not.toBeNull();
    const result = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','public.calendar_apply(uuid,uuid,jsonb,timestamptz)','EXECUTE') allowed",
    );
    expect(result.rows[0]!.allowed).toBe(false);
  });
});
