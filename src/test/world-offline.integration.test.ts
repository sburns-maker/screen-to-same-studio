// @vitest-environment node
// Paid visual-screen boundary is mocked here; dedicated identity tests exercise its HTTP contract.
vi.mock("@/lib/photo-identity-qc.server", () => ({
  requireVisualScreen: () => {},
  screenPhotoVisuals: async () => ({
    status: "screen_passed",
    method: "fictional_visual_design",
    reason: "features_consistent",
  }),
}));
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { SEED_STATE } from "@/lib/tess-logic";
import { characterFor } from "@/lib/characters";
import { photoOpportunity } from "@/lib/photo-opportunities";
import { currentActivity } from "@/lib/world-continuity";
const mocks = vi.hoisted(() => ({
  admin: null as SupabaseClient<Database> | null,
  text: vi.fn(),
  image: vi.fn(),
  push: vi.fn(),
}));
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
vi.mock("@/lib/webpush.server", () => ({ sendWebPush: mocks.push }));
vi.mock("@/lib/tess-weather.server", () => ({ getWeatherContext: async () => null }));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: mocks.text,
  generateContactReply: mocks.text,
}));
vi.mock("@/lib/tess-image.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tess-image.server")>()),
  lovableGatewayProvider: () => ({
    name: "test",
    model: "test-image",
    referenceConditioning: true,
    generate: mocks.image,
  }),
}));
import { runWorldTickWithAdmin } from "@/lib/world.server";
let db: Awaited<ReturnType<typeof worldDatabase>>;
let files: Map<string, Uint8Array>;
const user = "10000000-0000-4000-a000-000000000001";
const now = new Date("2026-10-22T16:05:00Z");
const state = { ...SEED_STATE, comfort: 65, trust: 60, curiosity: 65 };
let cid: string;
const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::integer n from ${table}`)).rows[0]!.n;
beforeAll(async () => {
  db = await worldDatabase();
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-not-a-real-key");
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  await db.exec(
    "TRUNCATE conversations CASCADE; TRUNCATE job_runs CASCADE; TRUNCATE world_control; TRUNCATE social_plans CASCADE; TRUNCATE npcs,social_links,shared_events,event_participants,character_knowledge;",
  );
  const adapter = postgresSupabase(db);
  mocks.admin = adapter.admin;
  files = adapter.files;
  mocks.text.mockReset();
  mocks.image.mockReset();
  mocks.push.mockReset().mockResolvedValue({ ok: true, gone: false });
  mocks.image.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    mime: "image/png",
    provider: "test",
    model: "test-image",
  });
  // Find a stable ordinary opportunity, not a forced or developer bypass.
  for (let n = 1; n < 100; n++) {
    cid = `20000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
    if (
      photoOpportunity({
        character: "tess",
        conversationId: cid,
        now,
        schedule: currentActivity(characterFor("tess"), now),
        state,
        frequency: "normal",
        eligibleTypes: ["casual_selfie"],
        lastPhotoAt: null,
        ownSinceLastPhoto: 99,
        gapHours: 999,
        context: "clinic break",
      }).selected
    )
      break;
  }
  await db.query(
    "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='tess'",
    [cid, user],
  );
  await db.query(
    "insert into tess_state(conversation_id,user_id,comfort,trust,curiosity) values($1,$2,65,60,65)",
    [cid, user],
  );
  await db.query(
    "insert into memories(conversation_id,user_id,summary) values($1,$2,'Established clinic coffee visit and upcoming dinner remain unchanged')",
    [cid, user],
  );
  mocks.text.mockResolvedValue({
    messages: ["A rare quiet minute at the clinic. Proof before it disappears."],
    tone: "dry",
    state_delta: {},
    event_tags: [],
    send_delay_seconds: 3,
    memory_candidates: [],
    photo_boundary_decision: "unchanged",
    continuity: null,
    photo: {
      action: "generate",
      type: "casual_selfie",
      scene:
        "A casual selfie at her veterinary clinic office desk during a quiet break; no patients or paperwork",
      willing: true,
      contextual: true,
      framing: "ordinary",
      expression: "amused",
      pose_type: "seated",
      camera_angle: "front_camera",
      crop_type: "chest_up",
      hairstyle: "clipped_up",
      clothing_category: "work_cardigan",
      setting: "clinic office",
      selfie_type: "selfie",
    },
  });
});
import { afterEach } from "vitest";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("offline living world through the normal character pipeline (fake paid providers only)", () => {
  it("records independent activity, decides on a clinic selfie, preserves identity and delivers once without a user message", async () => {
    expect(await count("messages")).toBe(0);
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(report.initiated).toHaveLength(1);
    expect(mocks.text).toHaveBeenCalledTimes(1);
    expect(mocks.image).toHaveBeenCalledTimes(1);
    expect(mocks.image.mock.calls[0]![0]).toContain("canonical Tess Morgan reference");
    expect(mocks.image.mock.calls[0]![1]).toHaveLength(1);
    expect(files.size).toBe(1);
    const messages = (
      await db.query<{
        metadata: { generated_path: string; initiated: boolean; push_primary: boolean };
      }>("select metadata from messages")
    ).rows;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.metadata).toMatchObject({
      initiated: true,
      push_primary: true,
      photo_identity: {
        canonicalAsset: "src/assets/tess.jpg",
        referenceConditioning: true,
        validationStatus: "screen_passed",
      },
      photo_source: "autonomous",
    });
    expect(files.has(`tess-photos/${messages[0]!.metadata.generated_path}`)).toBe(true);
    expect(await count("generated_images")).toBe(1);
    expect(await count("character_world_state")).toBe(1);
    expect(await count("shared_events")).toBeGreaterThan(0);
    expect(await count("memories")).toBe(1);
    await runWorldTickWithAdmin(mocks.admin!, now);
    expect(await count("messages")).toBe(1);
    expect(mocks.image).toHaveBeenCalledTimes(1);
  }, 20_000);
  it("continues structured world progression when the paid-call budget is zero", async () => {
    vi.stubEnv("AUTONOMOUS_AI_DAILY_LIMIT", "0");
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(report.aiCalls).toBe(0);
    expect(await count("character_world_state")).toBe(1);
    expect(await count("shared_events")).toBeGreaterThan(0);
    expect(await count("messages")).toBe(0);
    expect(mocks.text).not.toHaveBeenCalled();
  });
  it("does not send real-clock background messages in Practice mode", async () => {
    await db.query("update conversations set real_time_mode=false where id=$1", [cid]);
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(await count("character_world_state")).toBe(1);
    expect(mocks.text).not.toHaveBeenCalled();
  });
  it("keeps failed image actions terminal and does not regenerate on the next background tick", async () => {
    mocks.image.mockRejectedValue(new Error("test provider timeout"));
    await runWorldTickWithAdmin(mocks.admin!, now);
    await runWorldTickWithAdmin(mocks.admin!, new Date(now.getTime() + 31 * 60_000));
    expect(mocks.image).toHaveBeenCalledTimes(1);
    expect(await count("messages")).toBe(0);
    expect(
      (await db.query<{ status: string }>("select status from media_attempts")).rows[0]!.status,
    ).toBe("failed");
  });
  it("fulfills an overdue photo promise through the normal offline pipeline", async () => {
    const id = "60000000-0000-4000-a000-000000000001";
    await db.query(
      "insert into world_records(id,conversation_id,user_id,character_key,kind,key,summary,status,source_quote,due_at,expires_at) values($1,$2,$3,'tess','photo','clinic-break','Share a clinic break photo','pending','I will send a picture after work',$4,$5)",
      [
        id,
        cid,
        user,
        new Date(now.getTime() - 3_600_000).toISOString(),
        new Date(now.getTime() + 86_400_000).toISOString(),
      ],
    );
    const response = await mocks.text();
    mocks.text.mockClear();
    mocks.text.mockResolvedValue({
      ...response,
      continuity: {
        fulfilled: { id, source_quote: response.messages[0] },
        intentions: [],
        facts: [],
      },
    });
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(mocks.text.mock.calls[0]![0].initiationReason).toContain("pending photo intention");
    expect(
      (await db.query<{ status: string }>("select status from world_records where id=$1", [id]))
        .rows[0]!.status,
    ).toBe("fulfilled");
    expect(await count("generated_images")).toBe(1);
  }, 20_000);
  it("leaves quiet-hour notifications unclaimed and blocks new initiation", async () => {
    await db.query("insert into user_profile(user_id,key,value) values($1,'quiet_hours','11-14')", [
      user,
    ]);
    await db.query(
      "insert into messages(conversation_id,user_id,sender,body,created_at,visible_at,metadata) values($1,$2,'tess','An earlier update',$3,$3,$4)",
      [
        cid,
        user,
        new Date(now.getTime() - 4 * 3_600_000).toISOString(),
        JSON.stringify({ push_primary: true }),
      ],
    );
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(mocks.text).not.toHaveBeenCalled();
    const recorded = (
      await db.query<{ last_initiation: { initiated: boolean; reasons: string[] } }>(
        "select last_initiation from tess_life where conversation_id=$1",
        [cid],
      )
    ).rows[0]!.last_initiation;
    expect(recorded.initiated).toBe(false);
    expect(recorded.reasons).toContain("user quiet hours");
    expect(
      (await db.query<{ metadata: Record<string, unknown> }>("select metadata from messages"))
        .rows[0]!.metadata["pushed"],
    ).toBeUndefined();
  });
  it("a shared gathering yields participant-only autonomous follow-ups and normal deduplicated push attempts", async () => {
    const { sharedCommand, runSharedWorldTick } = await import("@/lib/shared-world.server");
    const { sharedRsvpDecision } = await import("@/lib/shared-world");
    await db.query("update conversations set muted=true where id=$1", [cid]);
    for (const [n, key] of ["ben", "claire"].entries()) {
      const convId = `20000000-0000-4000-a000-${String(n + 900).padStart(12, "0")}`;
      await db.query(
        "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key=$3",
        [convId, user, key],
      );
      await db.query(
        "insert into tess_state(conversation_id,user_id,comfort,trust,curiosity) values($1,$2,65,60,65)",
        [convId, user],
      );
    }
    const startsAt = "2026-10-25T18:00:00Z",
      endsAt = "2026-10-25T20:00:00Z";
    let planId = "";
    for (let n = 1; n < 100; n++) {
      planId = `30000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
      if (
        sharedRsvpDecision(
          { id: planId, starts_at: startsAt, ends_at: endsAt },
          "claire",
          "user_relay",
          now,
        ).response === "accepted"
      )
        break;
    }
    let plan = await sharedCommand(
      mocks.admin!,
      user,
      planId,
      "create",
      { organizer: "ben", place: "home:ben", title: "A small family gathering", startsAt, endsAt },
      now,
      0,
    );
    plan = await sharedCommand(
      mocks.admin!,
      user,
      planId,
      "invite",
      { actor: "ben", character: "claire", channel: "user_relay" },
      now,
      plan.version,
    );
    await runSharedWorldTick(mocks.admin!, user, now);
    await runSharedWorldTick(mocks.admin!, user, new Date(endsAt));
    const response = await mocks.text();
    mocks.text.mockClear();
    mocks.text.mockResolvedValue({
      ...response,
      photo: null,
      messages: ["That was a nice quiet afternoon. The gathering is over now."],
    });
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-key-only");
    await db.query(
      "insert into push_subscriptions(user_id,endpoint,keys) values($1,'https://push.test/fixture',$2)",
      [user, JSON.stringify({ p256dh: "test", auth: "test" })],
    );
    const later = new Date("2026-10-25T21:00:00Z");
    vi.setSystemTime(later);
    const report = await runWorldTickWithAdmin(mocks.admin!, later);
    expect(report.errors).toEqual([]);
    expect(report.initiated).toHaveLength(2);
    expect(
      mocks.text.mock.calls.every(([args]) =>
        args.initiationReason.includes("completed gathering"),
      ),
    ).toBe(true);
    expect(
      (
        await db.query(
          "select * from character_knowledge where character_key='tess' and subject_type='shared_plan'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(await count("messages")).toBe(2);
    vi.setSystemTime(new Date(later.getTime() + 5_000));
    await runWorldTickWithAdmin(mocks.admin!, new Date(later.getTime() + 5_000));
    await runWorldTickWithAdmin(mocks.admin!, new Date(later.getTime() + 5_000));
    expect(mocks.push).toHaveBeenCalledTimes(2); // One actual message's primary notification each; mock provider only.
    expect(await count("messages")).toBe(2);
    expect(mocks.image).not.toHaveBeenCalled();
  }, 30_000);
});
