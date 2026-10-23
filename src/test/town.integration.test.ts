// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import {
  initializeTown,
  townCommand,
  visitTown,
  encounterTurn,
  townSnapshot,
} from "@/lib/town.server";
import { runStructured } from "@/lib/text-ai.server";
import { npcPresent, travelMinutes, TOWN_NPCS, TOWN_PLACES } from "@/lib/town";
import { sharedCommand, runSharedWorldTick } from "@/lib/shared-world.server";
vi.mock("@/lib/text-ai.server", () => ({ runStructured: vi.fn() }));
let db: Awaited<ReturnType<typeof worldDatabase>>,
  admin: ReturnType<typeof postgresSupabase>["admin"];
const user = "a0000000-0000-4000-a000-000000000001",
  other = "a0000000-0000-4000-a000-000000000002";
const now = new Date("2026-10-22T16:00:00Z"); // Thursday noon Eastern.
const id = () => crypto.randomUUID();
async function arrive() {
  await visitTown(admin, user, "coffee:local", now);
  await db.query("update town_presence set arrives_at=$1 where user_id=$2", [
    now.toISOString(),
    user,
  ]);
}
async function count(table: string) {
  return (await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0]!.n;
}
beforeAll(async () => {
  db = await worldDatabase();
  admin = postgresSupabase(db).admin;
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(runStructured).mockResolvedValue({
    reply: "I was fixing an old touring bike this morning.",
    willingToExchangeContact: true,
  });
  await db.exec(
    "TRUNCATE town_people,town_messages,town_actions,town_connections,town_presence,town_known_plans; TRUNCATE conversations CASCADE; TRUNCATE social_plans CASCADE; TRUNCATE world_places CASCADE; TRUNCATE character_knowledge,social_links;",
  );
  await initializeTown(admin, user);
});
describe("persistent exploration and contact exchange", () => {
  it("seeds the same eleven places without changing existing primary conversations", async () => {
    await initializeTown(admin, user);
    expect(await count("world_places")).toBe(14);
    expect(await count("conversations")).toBe(0);
    expect(await count("messages")).toBe(0);
  });
  it("uses coherent schedules and real geographic travel without GPS", () => {
    expect(npcPresent(TOWN_NPCS[0], now)).toBe(true);
    expect(npcPresent(TOWN_NPCS[0], new Date("2026-10-23T04:00:00Z"))).toBe(false);
    expect(travelMinutes(TOWN_PLACES[0], TOWN_PLACES[3])).toBeGreaterThan(25);
    expect(travelMinutes(TOWN_PLACES[0], TOWN_PLACES[0])).toBe(0);
  });
  it("persists virtual travel, prevents teleporting and blocks conversations before arrival", async () => {
    await visitTown(admin, user, "coffee:local", now);
    await expect(visitTown(admin, user, "park:local", now)).rejects.toThrow("travel");
    await expect(
      encounterTurn(admin, user, id(), "rowan-ellis", "Hello", "scene", now),
    ).rejects.toThrow("not at scene");
    expect(runStructured).not.toHaveBeenCalled();
  });
  it("does not expose private character presence or unseen encounters", async () => {
    const s = await townSnapshot(admin, user, now);
    expect(s.people.every((n) => !n.present && !n.connection)).toBe(true);
    expect(s.plans).toEqual([]);
    expect(s.presence).toBeNull();
  });
  it("delivers an encounter atomically, remembers the thread and requires mutual contact consent", async () => {
    await arrive();
    await encounterTurn(admin, user, id(), "rowan-ellis", "What are you working on?", "scene", now);
    await expect(
      townCommand(admin, user, id(), "contact", { npc: "rowan-ellis" }, now),
    ).rejects.toThrow("consent");
    await encounterTurn(
      admin,
      user,
      id(),
      "rowan-ellis",
      "That sounds interesting. Would you like to stay in touch?",
      "scene",
      now,
    );
    await townCommand(admin, user, id(), "contact", { npc: "rowan-ellis" }, now);
    const s = await townSnapshot(admin, user, now);
    expect(s.people[0]!.connection?.contact).toBe(true);
    expect(s.messages).toHaveLength(4);
    expect(vi.mocked(runStructured).mock.calls[1]![2]).toContain("touring bike");
    expect(await count("tess_state")).toBe(0);
  });
  it("does not grant contact if the NPC declines", async () => {
    await arrive();
    vi.mocked(runStructured).mockResolvedValue({
      reply: "I prefer not to exchange numbers.",
      willingToExchangeContact: false,
    });
    for (let i = 0; i < 2; i++)
      await encounterTurn(
        admin,
        user,
        id(),
        "rowan-ellis",
        "May I have your number?",
        "scene",
        now,
      );
    await expect(
      townCommand(admin, user, id(), "contact", { npc: "rowan-ellis" }, now),
    ).rejects.toThrow();
  });
  it("deduplicates retries and prevents request IDs being reused with different input", async () => {
    await arrive();
    const action = id();
    await encounterTurn(admin, user, action, "rowan-ellis", "Hello", "scene", now);
    await encounterTurn(admin, user, action, "rowan-ellis", "Hello", "scene", now);
    expect(runStructured).toHaveBeenCalledTimes(1);
    expect(await count("town_messages")).toBe(2);
    await expect(
      encounterTurn(admin, user, action, "rowan-ellis", "Different", "scene", now),
    ).rejects.toThrow("reused");
  });
  it("counts provider failures and never retries them or saves a misleading reply", async () => {
    await arrive();
    vi.mocked(runStructured).mockRejectedValue(new Error("private provider detail"));
    const action = id();
    await expect(
      encounterTurn(admin, user, action, "rowan-ellis", "Hi", "scene", now),
    ).rejects.toThrow("could not be confirmed");
    const replay = await encounterTurn(admin, user, action, "rowan-ellis", "Hi", "scene", now);
    expect(replay.status).toBe("failed");
    expect(await count("town_messages")).toBe(0);
    expect(runStructured).toHaveBeenCalledTimes(1);
  });
  it("blocks concurrent inference and enforces durable daily spending limit", async () => {
    await arrive();
    await townCommand(
      admin,
      user,
      id(),
      "start",
      { npc: "rowan-ellis", text: "Hi", mode: "scene", place: "coffee:local" },
      now,
    );
    await expect(
      townCommand(
        admin,
        user,
        id(),
        "start",
        { npc: "rowan-ellis", text: "Hi again", mode: "scene", place: "coffee:local" },
        now,
      ),
    ).rejects.toThrow("processing");
    await db.exec("UPDATE town_actions SET status='failed'");
    for (let i = 1; i < 40; i++)
      await db.query(
        "insert into town_actions values($1,$2,'rowan-ellis','Hi','scene','failed',$3)",
        [user, id(), now.toISOString()],
      );
    await expect(
      encounterTurn(admin, user, id(), "rowan-ellis", "Hello", "scene", now),
    ).rejects.toThrow("daily");
    expect(runStructured).not.toHaveBeenCalled();
  });
  it("requires contact access before remote messaging; keeps tenants separate", async () => {
    await initializeTown(admin, other);
    await expect(
      encounterTurn(admin, user, id(), "rowan-ellis", "Hi", "message", now),
    ).rejects.toThrow("exchange");
    await arrive();
    await encounterTurn(admin, user, id(), "rowan-ellis", "Hi", "scene", now);
    const snapshot = await townSnapshot(admin, other, now);
    expect(snapshot.messages).toHaveLength(0);
    expect(snapshot.people[0]!.connection).toBeNull();
    expect(
      (
        await db.query(
          "select has_function_privilege('authenticated','town_command(uuid,uuid,text,jsonb,timestamptz)','execute') allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
  });
  it("rejects closed or absent encounters without paid calls", async () => {
    await expect(
      visitTown(admin, user, "coffee:local", new Date("2026-10-23T04:00:00Z")),
    ).rejects.toThrow("closed");
    await expect(
      encounterTurn(admin, user, id(), "nolan-reed", "Hi", "scene", now),
    ).rejects.toThrow("not here");
    expect(runStructured).not.toHaveBeenCalled();
  });
  it("generalizes meetings to Tess and Maya, keeps them private until user-arranged, and creates normal follow-ups", async () => {
    for (const key of ["tess", "maya"])
      await db.query(
        "insert into conversations(user_id,character_id,real_time_mode) select $1,id,true from characters where key=$2",
        [user, key],
      );
    const planId = id();
    let p = await sharedCommand(
      admin,
      user,
      planId,
      "create",
      {
        organizer: "tess",
        place: "coffee:local",
        title: "A quiet weekend coffee",
        startsAt: "2026-10-25T18:00:00Z",
        endsAt: "2026-10-25T19:00:00Z",
      },
      now,
      0,
    );
    expect((await townSnapshot(admin, user, now)).plans).toHaveLength(0);
    p = await sharedCommand(
      admin,
      user,
      planId,
      "invite",
      { actor: "tess", character: "maya", channel: "user_relay" },
      now,
      p.version,
    );
    p = await sharedCommand(
      admin,
      user,
      planId,
      "respond",
      { character: "maya", response: "accepted" },
      now,
      p.version,
    );
    await runSharedWorldTick(admin, user, new Date("2026-10-25T21:00:00Z"));
    expect(await count("social_exchanges")).toBe(1);
    expect(await count("world_records")).toBe(2);
    expect(
      (
        await db.query(
          "select character_key from character_knowledge where character_key not in('tess','maya')",
        )
      ).rows,
    ).toHaveLength(0);
  });
});
describe("calendar transaction and preservation", () => {
  it("records a user-arranged plan and invitation atomically, exposes only known plans, and deduplicates retries", async () => {
    for (const key of ["ben", "claire"])
      await db.query(
        "insert into conversations(user_id,character_id,real_time_mode) select $1,id,true from characters where key=$2",
        [user, key],
      );
    const planId = id();
    const args = {
      p_user: user,
      p_id: planId,
      p_payload: {
        organizer: "ben",
        place: "coffee:local",
        title: "A small public gathering",
        startsAt: "2026-10-25T18:00:00Z",
        endsAt: "2026-10-25T19:00:00Z",
        invitees: ["claire"],
      },
      p_now: now.toISOString(),
    };
    expect((await admin.rpc("town_propose_plan", args)).error).toBeNull();
    expect((await admin.rpc("town_propose_plan", args)).error).toBeNull();
    const snapshot = await townSnapshot(admin, user, now);
    expect(snapshot.plans).toHaveLength(1);
    expect(snapshot.invitations.find((r) => r.character_key === "claire")?.response).toBe(
      "invited",
    );
    expect(await count("town_known_plans")).toBe(1);
    expect(snapshot.plans[0]?.user_attendance).toBe("not_reported");
  });
  it("rolls back an entire proposal when the invitee is unavailable to the system", async () => {
    await db.query(
      "insert into conversations(user_id,character_id,real_time_mode) select $1,id,true from characters where key='ben'",
      [user],
    );
    const r = await admin.rpc("town_propose_plan", {
      p_user: user,
      p_id: id(),
      p_payload: {
        organizer: "ben",
        place: "coffee:local",
        title: "A failed proposal",
        startsAt: "2026-10-25T18:00:00Z",
        endsAt: "2026-10-25T19:00:00Z",
        invitees: ["claire"],
      },
      p_now: now.toISOString(),
    });
    expect(r.error).not.toBeNull();
    expect(await count("social_plans")).toBe(0);
    expect(await count("character_knowledge")).toBe(0);
    expect(await count("town_known_plans")).toBe(0);
  });
  it("retains an established place label and existing profile records during initialization", async () => {
    await db.query(
      "update world_places set label='An already established cafe',metadata='{}' where user_id=$1 and key='coffee:local'",
      [user],
    );
    await initializeTown(admin, user);
    const row = (
      await db.query<{ label: string; metadata: { public: boolean } }>(
        "select * from world_places where user_id=$1 and key='coffee:local'",
        [user],
      )
    ).rows[0]!;
    expect(row.label).toBe("An already established cafe");
    expect(row.metadata.public).toBe(true);
    expect(await count("town_people")).toBe(10);
  });
  it("a message insert failure rolls back both bubbles and retains a recoverable reserved action", async () => {
    await arrive();
    const action = id();
    await townCommand(
      admin,
      user,
      action,
      "start",
      { npc: "rowan-ellis", text: "Hi", mode: "scene", place: "coffee:local" },
      now,
    );
    await db.exec(
      "CREATE FUNCTION test_town_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role='assistant' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_town_failure BEFORE INSERT ON town_messages FOR EACH ROW EXECUTE FUNCTION test_town_failure();",
    );
    try {
      await expect(
        townCommand(admin, user, action, "finish", { reply: "Hello", contact: false }, now),
      ).rejects.toThrow();
      expect(await count("town_messages")).toBe(0);
      expect(
        (
          await db.query<{ status: string }>("select status from town_actions where id=$1", [
            action,
          ])
        ).rows[0]!.status,
      ).toBe("reserved");
    } finally {
      await db.exec(
        "DROP TRIGGER test_town_failure ON town_messages; DROP FUNCTION test_town_failure();",
      );
    }
  });
});
describe("provider acknowledgement and character isolation", () => {
  it("recognizes a committed reply after a lost acknowledgement without another model call", async () => {
    await arrive();
    const rpc = admin.rpc.bind(admin);
    let lost = false;
    const faulty = {
      ...admin,
      rpc: async (name: string, args: Record<string, unknown>) => {
        const result = await rpc(name as never, args as never);
        if (!lost && name === "town_command" && args["p_command"] === "finish") {
          lost = true;
          return { data: null, error: { code: "network", message: "lost acknowledgement" } };
        }
        return result;
      },
    } as unknown as typeof admin;
    const result = await encounterTurn(faulty, user, id(), "rowan-ellis", "Hello", "scene", now);
    expect(result.status).toBe("completed");
    expect(result.replayed).toBe(true);
    expect(await count("town_messages")).toBe(2);
    expect(runStructured).toHaveBeenCalledTimes(1);
  });
  it("uses the persisted identity and does not give a second NPC the first NPC conversation", async () => {
    await db.query(
      "update town_people set profile=jsonb_set(profile,'{personality}','\"A canonically patient mechanic with a quiet sense of humor.\"') where user_id=$1 and key='rowan-ellis'",
      [user],
    );
    await initializeTown(admin, user);
    await arrive();
    await encounterTurn(
      admin,
      user,
      id(),
      "rowan-ellis",
      "A private detail about my brother.",
      "scene",
      now,
    );
    expect(vi.mocked(runStructured).mock.calls[0]![1]).toContain("canonically patient mechanic");
    await db.query("update town_presence set place_key='books:hollidaysburg' where user_id=$1", [
      user,
    ]);
    await encounterTurn(
      admin,
      user,
      id(),
      "leah-moss",
      "Hello, what are you reading?",
      "scene",
      now,
    );
    const [schema, instructions, input] = vi.mocked(runStructured).mock.calls[1]!;
    expect(instructions).toContain("Leah Moss");
    expect(input).not.toContain("my brother");
    expect(input).not.toContain("touring bike");
    expect(schema).toBeDefined();
  });
});
