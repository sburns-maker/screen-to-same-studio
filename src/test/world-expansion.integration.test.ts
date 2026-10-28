// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { initializeTown, encounterTurn, townCommand, townSnapshot } from "@/lib/town.server";
import { runTownFollowups } from "@/lib/town-followups.server";
import { runStructured } from "@/lib/text-ai.server";
import { introductionTargets } from "@/lib/npc-introductions";
import { TOWN_NPCS } from "@/lib/town";
vi.mock("@/lib/text-ai.server", () => ({ runStructured: vi.fn() }));
let db: Awaited<ReturnType<typeof worldDatabase>>,
  admin: ReturnType<typeof postgresSupabase>["admin"];
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002";
const cid = "20000000-0000-4000-a000-000000000001",
  npc = "rowan-ellis";
const now = new Date("2026-10-22T16:00:00Z");
const id = () => crypto.randomUUID();
async function count(t: string) {
  return (await db.query<{ n: number }>(`select count(*)::int n from ${t}`)).rows[0]!.n;
}
async function scene() {
  await db.query("insert into town_presence values($1,'coffee:local',$2,$2)", [
    user,
    now.toISOString(),
  ]);
}
async function intention() {
  const next = id();
  await db.query(
    "insert into town_connections(user_id,npc_key,contact,followups_enabled) values($1,$2,true,true) on conflict(user_id,npc_key) do update set contact=true,followups_enabled=true",
    [user, npc],
  );
  await db.query(
    "insert into town_intentions(user_id,id,npc_key,summary,source_quote,due_at,expires_at) values($1,$2,$3,'Check in about the bicycle project','I will check back tomorrow.',$4,$5)",
    [user, next, npc, now.toISOString(), new Date(now.getTime() + 86400000).toISOString()],
  );
  return next;
}
beforeAll(async () => {
  db = await worldDatabase();
  admin = postgresSupabase(db).admin;
}, 30000);
afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await db.close();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "false");
  vi.stubEnv("AUTONOMOUS_AI_DAILY_LIMIT", "12");
  vi.stubEnv("TOWN_DAILY_AI_LIMIT", "40");
  await db.exec(
    "TRUNCATE conversations CASCADE; TRUNCATE town_messages,town_actions,town_connections,town_presence,town_people,town_memories,town_intentions,town_introductions,visual_identity_registry; TRUNCATE job_runs CASCADE; TRUNCATE world_control;",
  );
  await db.query(
    "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='tess'",
    [cid, user],
  );
  await initializeTown(admin, user);
  vi.mocked(runStructured).mockReset().mockResolvedValue({
    reply: "How did the bike project go?",
    willingToExchangeContact: false,
    memories: null,
    followup: null,
  });
});
describe("bounded NPC continuity and agency", () => {
  it("creates eight stable fictional profiles and leaves every unapproved visual identity disabled", async () => {
    expect(await count("town_people")).toBe(10);
    expect(await count("visual_identity_registry")).toBe(10);
    const snapshot = await townSnapshot(admin, user, now);
    expect(snapshot.places).toHaveLength(24);
    expect(snapshot.people.every((p) => !p.photosEnabled)).toBe(true);
    expect(snapshot.places.find((p) => p.key === "hope:drop-in")?.description).toContain(
      "fictional",
    );
  });
  it("remembers only evidenced user reports and records an explicit future promise atomically", async () => {
    await scene();
    vi.mocked(runStructured).mockResolvedValue({
      reply: "I will check back tomorrow.",
      willingToExchangeContact: false,
      memories: [
        { summary: "User is repairing a bicycle", source_quote: "I am fixing my bicycle." },
        { summary: "Unsupported invented fact", source_quote: "never said this" },
      ],
      followup: {
        summary: "Ask about the bicycle",
        quote: "I will check back tomorrow.",
        due_at: "2026-10-23T16:00:00Z",
      },
    });
    await encounterTurn(admin, user, id(), npc, "I am fixing my bicycle.", "scene", now);
    expect(await count("town_memories")).toBe(1);
    expect(await count("town_intentions")).toBe(1);
    expect(await count("messages")).toBe(0);
    expect(await count("tess_state")).toBe(0);
  });
  it("retrieves this NPC memory without sharing it with another NPC", async () => {
    await scene();
    await db.query(
      "insert into town_memories(user_id,npc_key,action_id,summary,source_quote) values($1,$2,$3,$4,$5)",
      [user, npc, id(), "A private bicycle project", "I am fixing my bicycle."],
    );
    await encounterTurn(admin, user, id(), npc, "Hello again", "scene", now);
    expect(vi.mocked(runStructured).mock.calls[0]![2]).toContain("private bicycle");
    await db.query("update town_presence set place_key='books:hollidaysburg' where user_id=$1", [
      user,
    ]);
    await encounterTurn(admin, user, id(), "leah-moss", "Hello", "scene", now);
    expect(vi.mocked(runStructured).mock.calls[1]![2]).not.toContain("private bicycle");
  });
  it("does not create follow-ups from invented, vague or out-of-window promises", async () => {
    await scene();
    vi.mocked(runStructured).mockResolvedValue({
      reply: "That sounds interesting.",
      willingToExchangeContact: false,
      memories: null,
      followup: {
        summary: "Check in",
        quote: "I will check back tomorrow.",
        due_at: "2026-10-23T16:00:00Z",
      },
    });
    await encounterTurn(admin, user, id(), npc, "A hobby of mine.", "scene", now);
    expect(await count("town_intentions")).toBe(0);
  });
  it("runs offline only after flag, contact exchange, opt-in and an actual due intention", async () => {
    await intention();
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 0, sent: 0 });
    expect(runStructured).not.toHaveBeenCalled();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 1, sent: 1 });
    expect(await count("town_messages")).toBe(1);
    expect((await db.query<{ role: string }>("select role from town_messages")).rows[0]!.role).toBe(
      "assistant",
    );
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 0, sent: 0 });
    expect(runStructured).toHaveBeenCalledTimes(1);
  });
  it("honors quiet/global budget suppression and does not message noncontacts or opted-out people", async () => {
    await intention();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    await runTownFollowups(admin, user, now, false);
    await db.query("update town_connections set followups_enabled=false where user_id=$1", [user]);
    await runTownFollowups(admin, user, now, true);
    expect(runStructured).not.toHaveBeenCalled();
  });
  it("suppresses all-Practice worlds and respects the shared daily AI quota", async () => {
    await intention();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    await db.query("update conversations set real_time_mode=false");
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 0, sent: 0 });
    await db.query("update conversations set real_time_mode=true");
    vi.stubEnv("AUTONOMOUS_AI_DAILY_LIMIT", "0");
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 0, sent: 0 });
    expect(runStructured).not.toHaveBeenCalled();
  });
  it("makes provider failures terminal without duplicate messages or another inference attempt", async () => {
    await intention();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    vi.mocked(runStructured).mockRejectedValue(new Error("provider private response"));
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 1, sent: 0 });
    await runTownFollowups(admin, user, now, true);
    expect(runStructured).toHaveBeenCalledTimes(1);
    expect(await count("town_messages")).toBe(0);
    expect(
      (await db.query<{ status: string }>("select status from town_intentions")).rows[0]!.status,
    ).toBe("failed");
  });
  it("allows choosing silence without fabricating a user message or retrying the intention", async () => {
    await intention();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    vi.mocked(runStructured).mockResolvedValue({
      reply: "",
      willingToExchangeContact: false,
      memories: null,
      followup: null,
    });
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 1, sent: 0 });
    await runTownFollowups(admin, user, now, true);
    expect(runStructured).toHaveBeenCalledTimes(1);
    expect(await count("town_messages")).toBe(0);
  });
  it("requires source evidence for introductions and does not create contact access", async () => {
    expect(introductionTargets("You should meet Mira Dalton.")).toHaveLength(1);
    expect(introductionTargets("Don't meet Mira Dalton.")).toHaveLength(0);
    const mid = id();
    await db.query(
      "insert into messages(id,conversation_id,user_id,sender,body,visible_at) values($1,$2,$3,'tess','You should meet Mira Dalton.',$4)",
      [mid, cid, user, now.toISOString()],
    );
    expect(
      (
        await admin.rpc("record_npc_introduction", {
          p_user: user,
          p_message: mid,
          p_npc: "mira-dalton",
        })
      ).error,
    ).toBeNull();
    expect(await count("town_introductions")).toBe(1);
    expect(await count("town_connections")).toBe(0);
    expect(
      (
        await admin.rpc("record_npc_introduction", {
          p_user: other,
          p_message: mid,
          p_npc: "mira-dalton",
        })
      ).error,
    ).not.toBeNull();
  });
});
describe("display portraits preserve permanent anchors", () => {
  async function candidate(key = "tess", type = "casual_selfie") {
    const mid = id(),
      job = id(),
      path = `${user}/${id()}.png`,
      sha = "a".repeat(64),
      asset = `src/assets/${key}.jpg`;
    await db.query(
      "insert into visual_identity_registry(user_id,entity_key,canonical_asset,canonical_sha256,approval) values($1,$2,$3,$4,'approved')",
      [user, key, asset, sha],
    );
    await db.query(
      "insert into job_runs(id,job,status,detail) values($1,'photo-turn:test','ok',$2)",
      [job, JSON.stringify({ userId: user, conversationId: cid })],
    );
    await db.query(
      "insert into media_attempts(action_id,user_id,conversation_id,status,storage_path) values($1,$2,$3,'generated',$4)",
      [job, user, cid, path],
    );
    await db.query(
      "insert into messages(id,conversation_id,user_id,sender,body,visible_at,metadata) values($1,$2,$3,'tess','A casual portrait',$4,$5)",
      [
        mid,
        cid,
        user,
        now.toISOString(),
        JSON.stringify({
          photo_type: type,
          generated_path: path,
          photo_identity: {
            canonicalSha256: sha,
            canonicalAsset: asset,
            referenceConditioning: true,
            validationStatus: "screen_passed",
          },
        }),
      ],
    );
    return { mid, sha, asset };
  }
  it("updates and resets an active profile without replacing canonical identity or creating fake messages", async () => {
    const c = await candidate();
    const args = {
      p_user: user,
      p_key: "tess",
      p_message: c.mid,
      p_reason: "A new everyday profile portrait",
    };
    expect((await admin.rpc("update_active_portrait", args)).error).toBeNull();
    await admin.rpc("update_active_portrait", args);
    expect(await count("world_events")).toBe(1);
    const row = (
      await db.query<{ canonical_sha256: string; active_message_id: string }>(
        "select * from visual_identity_registry where entity_key='tess'",
      )
    ).rows[0]!;
    expect(row.canonical_sha256).toBe(c.sha);
    expect(row.active_message_id).toBe(c.mid);
    expect(await count("messages")).toBe(1);
    expect(
      (await admin.rpc("update_active_portrait", { ...args, p_message: null as unknown as string })).error,
    ).toBeNull();
  });
  it("rejects another character, intimate/object images, missing approval and cross-tenant sources", async () => {
    const c = await candidate("tess", "object");
    expect(
      (
        await admin.rpc("update_active_portrait", {
          p_user: user,
          p_key: "tess",
          p_message: c.mid,
          p_reason: "An ordinary update",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await admin.rpc("update_active_portrait", {
          p_user: other,
          p_key: "tess",
          p_message: c.mid,
          p_reason: "An ordinary update",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await admin.rpc("update_active_portrait", {
          p_user: user,
          p_key: TOWN_NPCS[0].key,
          p_message: c.mid,
          p_reason: "An ordinary update",
        })
      ).error,
    ).not.toBeNull();
  });
  it("rejects forged screening metadata without a private generation receipt", async () => {
    const c = await candidate();
    await db.exec("TRUNCATE job_runs CASCADE");
    expect(
      (
        await admin.rpc("update_active_portrait", {
          p_user: user,
          p_key: "tess",
          p_message: c.mid,
          p_reason: "An ordinary update",
        })
      ).error,
    ).not.toBeNull();
  });
});
describe("additional continuity and spending safeguards", () => {
  it("does not create an acquaintance when the first encounter fails before any reply", async () => {
    await scene();
    vi.mocked(runStructured).mockRejectedValue(new Error("failed"));
    await expect(encounterTurn(admin, user, id(), npc, "Hello", "scene", now)).rejects.toThrow();
    expect(await count("town_connections")).toBe(0);
    expect(await count("town_messages")).toBe(0);
  });
  it("keeps a full 24-hour gap for NPC follow-ups even when another promise is due", async () => {
    await intention();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    await runTownFollowups(admin, user, now, true);
    await intention();
    await runTownFollowups(admin, user, new Date(now.getTime() + 3600000), true);
    expect(runStructured).toHaveBeenCalledTimes(1);
  });
  it("blocks paid images across a UTC midnight boundary when rolling attempts are exhausted", async () => {
    for (let i = 0; i < 2; i++) {
      const job = id();
      await db.query(
        "insert into job_runs(id,job,status,detail) values($1,'photo-turn:rolling','failed',$2)",
        [job, JSON.stringify({ userId: user, conversationId: cid })],
      );
      await db.query(
        "insert into media_attempts(action_id,user_id,conversation_id,status,created_at) values($1,$2,$3,'failed',now()-interval '20 hours')",
        [job, user, cid],
      );
    }
    const job = id();
    await db.query(
      "insert into job_runs(id,job,status,detail) values($1,'photo-turn:rolling','running',$2)",
      [job, JSON.stringify({ userId: user, conversationId: cid })],
    );
    const reserved = await admin.rpc("reserve_image_attempt", {
      p_action_id: job,
      p_conversation_id: cid,
      p_user_id: user,
      p_daily: 2,
      p_monthly: 20,
    });
    expect(reserved.error).toBeNull();
    expect(reserved.data).toBe(false);
  });
  it("does not allow assigning an approved canonical image to a second character in the same world", async () => {
    const sha = "b".repeat(64);
    await db.query(
      "insert into visual_identity_registry(user_id,entity_key,canonical_asset,canonical_sha256,approval) values($1,'tess','original-tess.jpg',$2,'approved')",
      [user, sha],
    );
    await expect(
      db.query(
        "insert into visual_identity_registry(user_id,entity_key,canonical_asset,canonical_sha256,approval) values($1,'maya','original-tess.jpg',$2,'approved')",
        [user, sha],
      ),
    ).rejects.toThrow();
  });
});
describe("unavailable media stays disabled", () => {
  it("does not record a photo promise for an NPC without an approved image pipeline", async () => {
    await scene();
    vi.mocked(runStructured).mockResolvedValue({
      reply: "I will send a selfie tomorrow.",
      willingToExchangeContact: false,
      memories: null,
      followup: {
        summary: "Send a selfie",
        quote: "I will send a selfie tomorrow.",
        due_at: "2026-10-23T16:00:00Z",
      },
    });
    await encounterTurn(admin, user, id(), npc, "Can you share a picture?", "scene", now);
    expect(await count("town_intentions")).toBe(0);
    expect(await count("generated_images")).toBe(0);
  });
});
describe("follow-up conversation closure", () => {
  it("delays a due promise while the contact conversation is recently active", async () => {
    await intention();
    vi.stubEnv("ENABLE_NPC_FOLLOWUPS", "true");
    const action = id();
    await db.query(
      "insert into town_actions values($1,$2,$3,'A recent user message','message','completed',$4)",
      [user, action, npc, new Date(now.getTime() - 5 * 60000).toISOString()],
    );
    await db.query(
      "insert into town_messages values($1,$2,$3,$4,'user','A recent user message',$5)",
      [user, id(), npc, action, new Date(now.getTime() - 5 * 60000).toISOString()],
    );
    expect(await runTownFollowups(admin, user, now, true)).toEqual({ calls: 0, sent: 0 });
    expect(runStructured).not.toHaveBeenCalled();
    expect(
      (await db.query<{ status: string }>("select status from town_intentions")).rows[0]!.status,
    ).toBe("pending");
  });
});
