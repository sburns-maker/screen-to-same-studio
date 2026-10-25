// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const model = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/tess-image.server", async (original) => ({
  ...(await original<object>()),
  generateTessImage: model.generate,
}));
import {
  generatePhotoLabTest,
  photoLabHistory,
  releasePhotoLabTest,
} from "@/lib/developer-photo-lab.server";
import { PHOTO_LAB_TYPES, PHOTO_LAB_PRESETS } from "@/lib/developer-photo-lab";
import { photoActionId } from "@/lib/photo-delivery.server";
import * as identity from "@/lib/profile-media.server";
import { safePhotoScene } from "@/lib/photo-policy";
let db: Awaited<ReturnType<typeof worldDatabase>>, backing: ReturnType<typeof postgresSupabase>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  conv = "20000000-0000-4000-a000-000000000001";
const id = () => crypto.randomUUID();
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(readFileSync("docs/sql/20261024_riley_night_shift.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  vi.stubEnv("ENABLE_DEV_PHOTO_ACTIONS", "true");
  vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", user);
  vi.stubEnv("OPENAI_API_KEY", "test-only-key");
  model.generate.mockReset().mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    mime: "image/png",
    diagnostics: {
      provider: "mock",
      model: "mock-image",
      referenceConditioning: true,
      validationStatus: "screen_passed",
      retryCount: 0,
    },
  });
  await db.exec(`TRUNCATE conversations CASCADE;TRUNCATE job_runs CASCADE;
    INSERT INTO conversations(id,user_id,character_id,photo_boundary,mature_photography,photo_frequency) SELECT '${conv}','${user}',id,'all_photos',false,'off' FROM characters WHERE key='riley';
    INSERT INTO tess_state(user_id,conversation_id,romantic_intent,comfort) VALUES('${user}','${conv}',0,1);`);
  backing = postgresSupabase(db);
});
describe("isolated developer category generation", () => {
  it.each(PHOTO_LAB_TYPES)(
    "generates exact %s despite chat restrictions, using Riley's original identity",
    async (category) => {
      expect(safePhotoScene(PHOTO_LAB_PRESETS[category].scene)).toBe(true);
      const before = await db.query("SELECT * FROM conversations");
      const state = await db.query("SELECT * FROM tess_state");
      await db.query("INSERT INTO job_runs(job,detail) VALUES($1,$2)", [
        `photo-turn:${conv}`,
        JSON.stringify({ userId: user, conversationId: conv, phase: "generating" }),
      ]);
      const result = await generatePhotoLabTest(backing.admin, user, conv, id(), category);
      expect(result.status).toBe("ready");
      expect(result.category).toBe(category);
      expect(result.url).toContain("developer-photo-tests");
      expect(model.generate).toHaveBeenCalledTimes(1);
      const args = model.generate.mock.calls[0]![0];
      expect(args.type).toBe(category);
      expect(args.identity.key).toBe("riley");
      if (category !== "object") expect(args.canonical.asset).toContain("riley");
      expect((await db.query("SELECT * FROM conversations")).rows).toEqual(before.rows);
      expect((await db.query("SELECT * FROM tess_state")).rows).toEqual(state.rows);
      expect((await db.query("SELECT count(*)::int n FROM messages")).rows[0]).toEqual({ n: 0 });
      expect((await db.query("SELECT count(*)::int n FROM memories")).rows[0]).toEqual({ n: 0 });
      expect(
        (await db.query("SELECT status FROM job_runs WHERE job=$1", [`photo-turn:${conv}`]))
          .rows[0],
      ).toEqual({ status: "running" });
      expect((await db.query("SELECT count(*)::int n FROM media_attempts")).rows[0]).toEqual({
        n: 1,
      });
    },
  );
  it("never regenerates a successful or failed request ID and refreshes a stored preview", async () => {
    const request = id();
    const first = await generatePhotoLabTest(backing.admin, user, conv, request, "casual_selfie");
    expect(
      (await generatePhotoLabTest(backing.admin, user, conv, request, "casual_selfie")).id,
    ).toBe(first.id);
    expect((await photoLabHistory(backing.admin, user, conv)).results[0]!.url).toBe(first.url);
    expect(model.generate).toHaveBeenCalledTimes(1);
    await expect(
      generatePhotoLabTest(backing.admin, user, conv, request, "mature_romantic"),
    ).rejects.toThrow("another category");
    const failed = id();
    model.generate.mockRejectedValueOnce(new Error("private provider body"));
    expect(
      (await generatePhotoLabTest(backing.admin, user, conv, failed, "personal_selfie")).status,
    ).toBe("failed");
    const replay = await generatePhotoLabTest(backing.admin, user, conv, failed, "personal_selfie");
    expect(replay.reason).not.toContain("private provider body");
    expect(model.generate).toHaveBeenCalledTimes(2);
  });
  it("enforces developer authorization, adult status, ownership and shared budgets", async () => {
    await expect(
      generatePhotoLabTest(backing.admin, other, conv, id(), "casual_selfie"),
    ).rejects.toThrow("disabled");
    vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", `${user},${other}`);
    await expect(
      generatePhotoLabTest(backing.admin, other, conv, id(), "casual_selfie"),
    ).rejects.toThrow("Owned");
    vi.stubEnv("IMAGE_DAILY_LIMIT", "0");
    const result = await generatePhotoLabTest(backing.admin, user, conv, id(), "casual_selfie");
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("budget");
    expect(model.generate).not.toHaveBeenCalled();
    await db.exec("UPDATE characters SET age=17 WHERE key='riley'");
    await expect(
      generatePhotoLabTest(backing.admin, user, conv, id(), "casual_selfie"),
    ).rejects.toThrow("Owned");
    await db.exec("UPDATE characters SET age=28 WHERE key='riley'");
  });
  it("releases only an expired lab request without touching a normal chat reservation or recharging", async () => {
    const request = id();
    const action = await photoActionId(`developer-photo-lab:${user}:${conv}:${request}`);
    await db.query(
      "INSERT INTO job_runs(id,job,detail,started_at) VALUES($1,$2,$3,now()-interval '6 minutes')",
      [
        action,
        `developer-photo-lab:${conv}`,
        JSON.stringify({
          userId: user,
          conversationId: conv,
          category: "object",
          phase: "generating",
          requestId: request,
        }),
      ],
    );
    const normal = id();
    await db.query("INSERT INTO job_runs(id,job,detail) VALUES($1,$2,$3)", [
      normal,
      `photo-turn:${conv}`,
      JSON.stringify({ userId: user, phase: "generating" }),
    ]);
    await releasePhotoLabTest(backing.admin, user, conv, action);
    expect((await generatePhotoLabTest(backing.admin, user, conv, request, "object")).status).toBe(
      "failed",
    );
    expect(model.generate).not.toHaveBeenCalled();
    expect((await db.query("SELECT status FROM job_runs WHERE id=$1", [normal])).rows[0]).toEqual({
      status: "running",
    });
    await expect(releasePhotoLabTest(backing.admin, other, conv, action)).rejects.toThrow();
  });
});

it("fails closed on an unavailable approved identity without making a paid request", async () => {
  vi.spyOn(identity, "currentCanonical").mockRejectedValueOnce(
    new Error("Canonical identity is not approved"),
  );
  const r = await generatePhotoLabTest(backing.admin, user, conv, id(), "casual_selfie");
  expect(r.status).toBe("failed");
  expect(r.reason).toBe("Canonical identity is not approved");
  expect(model.generate).not.toHaveBeenCalled();
  expect((await db.query("SELECT count(*)::int n FROM media_attempts")).rows[0]).toEqual({ n: 0 });
});
it("keeps unsupported romantic categories disabled for Ben", async () => {
  await db.exec(
    `UPDATE conversations SET character_id=(SELECT id FROM characters WHERE key='ben') WHERE id='${conv}'`,
  );
  await expect(
    generatePhotoLabTest(backing.admin, user, conv, id(), "mature_romantic"),
  ).rejects.toThrow("unavailable");
  expect(model.generate).not.toHaveBeenCalled();
});
it("allows one active lab test per contact while preserving the stable request", async () => {
  let finish!: (value: unknown) => void;
  model.generate.mockReturnValueOnce(
    new Promise((r) => {
      finish = r;
    }),
  );
  const request = id();
  const first = generatePhotoLabTest(backing.admin, user, conv, request, "casual_selfie");
  await vi.waitFor(() => expect(model.generate).toHaveBeenCalledOnce());
  const second = await generatePhotoLabTest(backing.admin, user, conv, id(), "personal_selfie");
  expect(second.status).toBe("running");
  expect(second.category).toBe("casual_selfie");
  finish({
    bytes: new Uint8Array([1]),
    mime: "image/png",
    diagnostics: { validationStatus: "screen_passed" },
  });
  expect((await first).status).toBe("ready");
  expect(model.generate).toHaveBeenCalledOnce();
});
it.each(["tess", "maya", "claire", "jordan", "ben"] as const)(
  "routes %s to that character's own approved anchor",
  async (key) => {
    await db.query(
      "UPDATE conversations SET character_id=(SELECT id FROM characters WHERE key=$1) WHERE id=$2",
      [key, conv],
    );
    const r = await generatePhotoLabTest(backing.admin, user, conv, id(), "casual_selfie");
    expect(r.status).toBe("ready");
    const args = model.generate.mock.calls[0]![0];
    expect(args.identity.key).toBe(key);
    expect(args.canonical.asset).toContain(key);
  },
);
