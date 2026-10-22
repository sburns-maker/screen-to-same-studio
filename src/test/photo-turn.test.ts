import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_STATE, STATE_KEYS } from "@/lib/tess-logic";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  reserve: vi.fn(),
  prepare: vi.fn(),
  fail: vi.fn(),
  recover: vi.fn(),
  existing: vi.fn(),
  admin: {} as Record<string, unknown>,
  realTime: true,
  schedule: { activity: "at work", availability: "limited", detail: "brief clinic office break" },
}));
vi.mock("@/lib/tess.server", async (original) => ({
  ...(await original<object>()),
  generateTessReply: mocks.generate,
  generateContactReply: mocks.generate,
}));
vi.mock("@/lib/tess-weather.server", () => ({ getWeatherContext: async () => null }));
vi.mock("@/lib/social.server", () => ({ knowledgeForCharacter: async () => [] }));
vi.mock("@/lib/storyline.server", () => ({
  storylineContext: async () => ({ lines: [], event: null }),
}));
vi.mock("@/lib/daily-disruptions", () => ({
  applyDisruption: (s: unknown) => s,
  disruptionFor: () => null,
}));
vi.mock("@/lib/tess-life", async (original) => ({
  ...(await original<object>()),
  scheduleFor: () => mocks.schedule,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mocks.admin }));
vi.mock("@/lib/photo-delivery.server", () => ({
  reservePhotoAction: mocks.reserve,
  preparePhotoDelivery: mocks.prepare,
  failPhotoAction: mocks.fail,
  recoverPhotoDelivery: mocks.recover,
  existingPhotoAction: mocks.existing,
}));

const action = "30000000-0000-4000-a000-000000000001";
const uid = "10000000-0000-4000-a000-000000000001";
const cid = "20000000-0000-4000-a000-000000000001";
const caption = "The schedule is putting up more of a fight than the coffee.";
let download: ReturnType<typeof vi.fn>;
let upload: ReturnType<typeof vi.fn>;
let mutations = vi.fn<(table: string, method: string) => void>();
let client: Parameters<typeof import("@/lib/tess.functions").runTurn>[0];

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-openai-only");
  vi.stubEnv("LOVABLE_API_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.schedule.availability = "limited";
  mocks.realTime = true;
  mocks.reserve.mockReset().mockResolvedValueOnce(action).mockResolvedValue(null);
  mocks.prepare
    .mockReset()
    .mockResolvedValue({ count: 1, lastVisibleAt: new Date().toISOString() });
  mocks.fail.mockReset().mockResolvedValue(undefined);
  mocks.recover.mockReset().mockResolvedValue(null);
  mocks.existing.mockReset().mockResolvedValue(null);
  mocks.generate.mockReset().mockImplementation(async () => ({
    messages: [caption],
    send_delay_seconds: 10,
    state_delta: Object.fromEntries(STATE_KEYS.map((key) => [key, 0])),
    memory_candidates: [
      { memory_type: "relationship", summary: "An established shared moment", importance: 4 },
    ],
    photo: {
      action: "generate",
      asset_id: null,
      type: "casual_selfie",
      willing: true,
      contextual: true,
      framing: "ordinary",
      scene:
        "a casual desk selfie at the clinic during a quiet break; no people, patients, paperwork or screens visible",
      expression: "amused",
      reason: "sharing an ordinary moment",
      pose_type: "seated at desk",
      camera_angle: "front_camera",
      crop_type: "chest_up",
      hairstyle: "clipped_up",
      clothing_category: "ordinary work cardigan",
      setting: "clinic office",
      selfie_type: "selfie",
    },
    tone: "dry",
    event_tags: [],
    photo_boundary_decision: "unchanged",
  }));
  download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(["canonical"], { type: "image/jpeg" }), error: null });
  upload = vi.fn().mockResolvedValue({ error: null });
  mutations = vi.fn();
  const from = (table: string) => {
    let single = false;
    let photoOnly = false;
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq", "lte", "gt", "order", "limit", "is"])
      query[name] = () => query;
    for (const name of ["single", "maybeSingle"])
      query[name] = () => {
        single = true;
        return query;
      };
    query["or"] = () => {
      photoOnly = true;
      return query;
    };
    for (const name of ["insert", "update", "delete"])
      query[name] = () => {
        mutations(table, name);
        return query;
      };
    query["then"] = (resolve: (r: unknown) => unknown) => {
      const data =
        table === "conversations"
          ? {
              id: cid,
              user_id: uid,
              character: { key: "tess" },
              difficulty: "realistic",
              real_time_mode: mocks.realTime,
              photo_boundary: "none",
              photo_frequency: "normal",
              mature_photography: false,
            }
          : table === "tess_state"
            ? { ...SEED_STATE, comfort: 65, trust: 60, updated_at: "2026-10-22T12:00:00Z" }
            : table === "messages" && !single && !photoOnly
              ? [
                  {
                    id: "user-anchor",
                    sender: "user",
                    body: "How is your morning?",
                    metadata: {},
                    created_at: new Date(Date.now() - 3_600_000).toISOString(),
                  },
                ]
              : single
                ? null
                : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return query;
  };
  const storage = { from: () => ({ download, upload }) };
  Object.assign(mocks.admin, {
    from,
    storage,
    rpc: vi.fn().mockResolvedValue({ data: { version: 1 }, error: null }),
  });
  client = { from, storage } as unknown as typeof client;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normal spontaneous photo turn pipeline", () => {
  it("keeps ordinary text working before the migration without allowing image charges", async () => {
    vi.mocked(mocks.admin["rpc"] as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { code: "PGRST202" },
    });
    const reply = await mocks.generate();
    mocks.generate.mockResolvedValue({ ...reply, photo: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    expect((await runTurn(client, uid, cid, "America/New_York")).count).toBe(1);
    expect(mocks.generate.mock.calls.at(-1)![0].generateTypes).toEqual([]);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mutations).toHaveBeenCalledWith("messages", "insert");
  });
  it.each([false, true])(
    "uses controlled photo testing and unchanged state math with real_time_mode=%s",
    async (realTime) => {
      mocks.realTime = realTime;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: btoa("png") }] })),
      );
      const { runTurn } = await import("@/lib/tess.functions");
      const started = Date.now();
      await runTurn(client, uid, cid, "America/New_York", { gapHours: 3, ...(!realTime ? { developerPhoto: "deliver" as const } : {}) });
      const plan = mocks.prepare.mock.calls[0]![4];
      expect(plan.state.comfort).toBe(65);
      expect(plan.state.trust).toBe(60);
      expect(plan.state.romantic_intent).toBe(0);
      expect(Date.parse(plan.rows[0].visible_at) - started).toBeGreaterThanOrEqual(3000);
      expect(Date.parse(plan.rows[0].visible_at) - started).toBeLessThan(5000);
    },
  );
  it("supports ordinary object photos without inventing a face or requiring a selfie reference", async () => {
    const reply = await mocks.generate();
    mocks.generate.mockResolvedValue({
      ...reply,
      photo: { ...reply.photo, type: "object", scene: "a black coffee on an ordinary desk" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ b64_json: btoa("png") }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    await runTurn(client, uid, cid, "America/New_York", { gapHours: 3 });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).prompt).toContain(
      "No people's faces visible",
    );
    expect(download).not.toHaveBeenCalled();
    expect(mocks.prepare.mock.calls[0]![4].generated.identity_reference_used).toBe("none");
  });
  it("uses the canonical reference, direct image provider, private storage and normal attachment metadata exactly once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ b64_json: btoa("png-bytes") }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    const initiation = {
      gapHours: 3,
      reason: "a current clinic desk break",
      photoKey: "same-opportunity",
    };
    expect((await runTurn(client, uid, cid, "America/New_York", initiation)).count).toBe(1);
    expect(download).toHaveBeenCalledWith("canonical.jpg");
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(request.body.get("model")).toBe("gpt-image-1-mini");
    expect(request.body.get("prompt")).toContain(
      "Preserve the exact same recognizable fictional woman",
    );
    expect(request.body.getAll("image")).toHaveLength(1);
    expect(upload).toHaveBeenCalledWith(`${uid}/${action}.png`, expect.any(Uint8Array), {
      contentType: "image/png",
    });
    const plan = mocks.prepare.mock.calls[0]![4];
    expect(plan.rows[0].body).toBe(caption);
    expect(plan.rows[0].metadata.generated_path).toBe(`${uid}/${action}.png`);
    expect(plan.rows[0].metadata.generated_image_id).toBe(plan.generated.id);
    expect(plan.generated.message_id).toBe(plan.rows[0].id);
    expect(plan.generated.identity_reference_used).toBe("tess");
    expect(plan.rows[0].metadata.push_primary).toBe(true);
    expect(plan.memories[0].summary).toBe("An established shared moment");
    expect(mutations).not.toHaveBeenCalled(); // Persisted atomically through the delivery RPC, not direct inserts.
    await runTurn(client, uid, cid, "America/New_York", initiation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it("does not retry a failed/uncertain image request or send its caption as a fake attachment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("provider error includes private request details", { status: 500 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    const args = { gapHours: 3, reason: "clinic break", photoKey: "one-action" };
    expect((await runTurn(client, uid, cid, "America/New_York", args)).count).toBe(0);
    await runTurn(client, uid, cid, "America/New_York", args);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.fail).toHaveBeenCalledWith(mocks.admin, action);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mutations).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "private request details",
    );
  });
  it("fails closed without the canonical identity or successful storage", async () => {
    download.mockResolvedValue({ data: null, error: new Error("missing identity") });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    expect((await runTurn(client, uid, cid, "America/New_York", { gapHours: 3 })).count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("does not mutate data or spend money for preview, and never photographs while asleep", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    const preview = await runTurn(client, uid, cid, "America/New_York", {
      gapHours: 3,
      reason: "clinic office break",
      developerPhoto: "preview",
    });
    expect("opportunity" in preview && preview.opportunity?.eligible).toBe(true);
    mocks.schedule.availability = "asleep";
    expect((await runTurn(client, uid, cid, "America/New_York", { gapHours: 3 })).count).toBe(0);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mutations).not.toHaveBeenCalled();
  });
  it("leaves the prepared photo for delivery recovery rather than regenerating it", async () => {
    mocks.recover.mockResolvedValue({ count: 1, lastVisibleAt: "2026-10-22T12:00:00Z" });
    const { runTurn } = await import("@/lib/tess.functions");
    expect((await runTurn(client, uid, cid, "America/New_York", { gapHours: 3 })).count).toBe(1);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it("also persists autonomous text bubbles idempotently without changing relationship acceleration", async () => {
    const original = await mocks.generate();
    mocks.generate.mockResolvedValue({
      ...original,
      photo: null,
      messages: ["First thought.", "And another."],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    await runTurn(client, uid, cid, "America/New_York", { gapHours: 3, photoKey: "text-event" });
    const plan = mocks.prepare.mock.calls[0]![4];
    expect(plan.generated).toBe(null);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].metadata.push_primary).toBe(true);
    expect(plan.rows[1].metadata.push_primary).toBe(false);
    expect(plan.rows[0].metadata.notification_group).toBe(plan.rows[1].metadata.notification_group);
    expect(plan.state.comfort).toBe(65);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not deliver a paid attachment if private storage fails", async () => {
    upload.mockResolvedValue({ error: new Error("storage failed") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: btoa("png") }] })),
    );
    const { runTurn } = await import("@/lib/tess.functions");
    expect((await runTurn(client, uid, cid, "America/New_York", { gapHours: 3 })).count).toBe(0);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledTimes(1);
  });
});
