import * as opportunities from "@/lib/photo-opportunities";
import * as canonical from "@/lib/canonical-profile.server";
// Paid visual-screen boundary is mocked here; dedicated identity tests exercise its HTTP contract.
vi.mock("@/lib/photo-identity-qc.server", () => ({ requireVisualScreen: () => {}, screenPhotoVisuals: mocks.visual }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_STATE, STATE_KEYS } from "@/lib/tess-logic";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  visual: vi.fn(),
  reserve: vi.fn(),
  inspect: vi.fn(),
  prepare: vi.fn(),
  fail: vi.fn(),
  recover: vi.fn(),
  existing: vi.fn(),
  admin: {} as Record<string, unknown>,
  realTime: true,
  character: "tess",
  userBody: "How is your morning?",
  schedule: { activity: "at work", availability: "limited", detail: "brief clinic office break" },
}));
vi.mock("@/lib/tess.server", async (original) => ({
  ...(await original<object>()),
  generateTessReply: mocks.generate,
  generateContactReply: mocks.generate,
}));
vi.mock("@/lib/overnight-wake", () => ({ overnightWake: () => null }));
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
  inspectPhotoReservation: mocks.inspect,
  pendingPhotoResult: (reservation: unknown) => ({ count: 0, lastVisibleAt: null, reservation, reason: "A response is in progress" }),
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
let historyError = false;
let historyRows: Record<string, unknown>[] = [];
let mutations = vi.fn<(table: string, method: string) => void>();
let client: Parameters<typeof import("@/lib/tess.functions").runTurn>[0];

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-openai-only");
  vi.stubEnv("LOVABLE_API_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.visual.mockReset().mockResolvedValue({status:"screen_passed",method:"fictional_visual_design",reason:"features_consistent"});
  mocks.schedule.availability = "limited";
  mocks.realTime = true;
  mocks.character = "tess";
  mocks.userBody = "How is your morning?";
  mocks.inspect.mockReset().mockResolvedValue(null);
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
  historyRows = [];
  historyError = false;
  download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(["canonical"], { type: "image/jpeg" }), error: null });
  upload = vi.fn().mockResolvedValue({ error: null });
  mutations = vi.fn();
  const from = (table: string) => {
    let single = false;
    let photoOnly = false;
    let historyQuery = false;
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq", "lte", "gt", "gte", "in", "order", "limit", "is", "not"])
      query[name] = () => query;
    for (const name of ["single", "maybeSingle"])
      query[name] = () => {
        single = true;
        return query;
      };
    query["not"] = () => { photoOnly = true; historyQuery = true; return query; };
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
              character: { key: mocks.character },
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
                    body: mocks.userBody,
                    metadata: {},
                    created_at: new Date(Date.now() - 3_600_000).toISOString(),
                  },
                ]
              : table === "messages" && photoOnly && !single
                ? historyRows
              : single
                ? null
                : [];
      return Promise.resolve({ data, error: historyError && historyQuery ? {code:"unavailable"} : null }).then(resolve);
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
  it('provides character photography and separate scene-matched caption guidance through the normal turn', async()=>{
    const fetchMock=vi.fn().mockResolvedValue(Response.json({data:[{b64_json:'aW1hZ2U='}]}));vi.stubGlobal('fetch',fetchMock);
    const {runTurn}=await import('@/lib/tess.functions');
    const preview = await runTurn(client,uid,cid,'America/New_York',{reason:'brief clinic office break',gapHours:2,developerPhoto:'preview'});
    expect(preview).toMatchObject({photography:{profile:'tess',location:'clinic'}});
    expect(fetchMock).not.toHaveBeenCalled();
    await runTurn(client,uid,cid,'America/New_York');
    expect(mocks.prepare.mock.calls[0]![4].rows[0].metadata.in_reply_to).toBe("user-anchor");
    expect(mocks.generate.mock.calls.at(-1)![0].photoHint).toContain('PHOTOGRAPHY PERSONALITY');
    expect(mocks.generate.mock.calls.at(-1)![0].photoHint).toContain('Captions are separate messages');
  });

  it("offers the photo decision on a selected ordinary chat turn without forcing a generated image", async () => {
    const original = opportunities.photoOpportunity;
    vi.spyOn(opportunities, "photoOpportunity").mockImplementation((args) => ({
      ...original(args),
      eligible: true,
      selected: true,
      reason: "contextual photo opportunity",
      hint: "PHOTO OPPORTUNITY (optional, not an obligation): ordinary current scene. Respect eligibility and your independent willingness",
    }));
    const reply = await mocks.generate();
    mocks.generate.mockClear().mockResolvedValue({ ...reply, photo: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    const result = await runTurn(client, uid, cid, "America/New_York");
    expect(result.count).toBe(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0]![0].photoMomentSelected).toBe(true);
    expect(mocks.generate.mock.calls[0]![0].photoHint).toContain("PHOTO OPPORTUNITY");
    expect(mocks.prepare.mock.calls[0]![4].generated).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets Riley consider a direct everyday selfie despite a skipped random opportunity, without forcing one", async () => {
    // Riley sleeps 9 AM–4 PM; this test is about a direct ordinary photo request,
    // not about scheduling. Pin the clock to an awake off-shift hour.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T22:00:00.000Z"));
    mocks.character = "riley";
    mocks.userBody = "Would you send me a quick normal selfie, Riley?";
    vi.spyOn(opportunities, "photoOpportunity").mockImplementation((args) => ({
      eligible: true,
      selected: false,
      reason: "chooses not to share this random opportunity",
      key: args.conversationId,
      hint: "Unsolicited photo opportunity was skipped.",
    }));
    const sample = await mocks.generate();
    mocks.generate.mockClear().mockResolvedValue({ ...sample, photo: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runTurn } = await import("@/lib/tess.functions");
    const result = await runTurn(client, uid, cid, "America/New_York");
    expect(result.count).toBe(1);
    const guidance = mocks.generate.mock.calls.at(-1)![0];
    expect(guidance.character.key).toBe("riley");
    expect(guidance.directOrdinaryPhotoRequest).toBe(true);
    expect(guidance.photoHint).toContain("RILEY ORDINARY PHOTO REQUEST");
    expect(mocks.prepare.mock.calls.at(-1)![4].generated).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses delivered styles outside the chat window, varies the final capture and persists it once", async () => {
    const reply = await mocks.generate();
    historyRows = [{ sender:"tess", created_at:new Date(Date.now()-600000).toISOString(),
      metadata:{generated_path:`${uid}/old.png`,photo_type:"casual_selfie",
        photo_identity:{validationStatus:"screen_passed"},
        photo_visual:{version:1,character:"tess",location:"clinic",style:{...reply.photo},objects:[]}} }];
    mocks.generate.mockClear();
    const fetchMock=vi.fn().mockResolvedValue(Response.json({data:[{b64_json:btoa("png")}]}));
    vi.stubGlobal("fetch",fetchMock);
    const {runTurn}=await import("@/lib/tess.functions");
    await runTurn(client,uid,cid,"America/New_York",{gapHours:3});
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent=mocks.prepare.mock.calls[0]![4].rows[0].metadata;
    expect(sent.photo_visual.style.crop_type).not.toBe(reply.photo.crop_type);
    expect(sent.photo_identity.photography).toMatchObject({recentDeliveredCount:1,captureDecision:"avoided_recent_capture"});
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });

  it("disables photo generation when delivered history fails, without blocking text", async () => {
    historyError=true;
    const reply=await mocks.generate();
    mocks.generate.mockResolvedValue({...reply,photo:null});
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    const {runTurn}=await import("@/lib/tess.functions");
    const result=await runTurn(client,uid,cid,"America/New_York");
    expect(result.count).toBe(1);
    expect(mocks.generate.mock.calls.at(-1)![0].generateTypes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

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
  it("honors a worker-selected photo opportunity without a second random decision, and records an actual silent choice", async()=>{
    const original=await mocks.generate();
    mocks.generate.mockResolvedValue({...original,photo:null,messages:[]}).mockClear();
    vi.spyOn(opportunities,"photoOpportunity").mockReturnValue({eligible:true,selected:false,key:"moment",reason:"not selected by second draw",hint:"PHOTO OPPORTUNITY: ordinary desk break, no special event required"});
    const {runTurn}=await import("@/lib/tess.functions");
    const result=await runTurn(client,uid,cid,"America/New_York",{gapHours:3,photoKey:"moment",spontaneousPhoto:true});
    expect(mocks.generate.mock.calls[0]![0].photoHint).toContain("PHOTO OPPORTUNITY: ordinary desk break");
    expect(result).toMatchObject({count:0,reason:"Character chose not to send a photo or message for this moment."});
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("blocks preview on the same in-flight reservation before any model or image call", async () => {
    mocks.inspect.mockResolvedValue({ actionId: action, phase: "generating", recoverable: false });
    const { runTurn } = await import("@/lib/tess.functions");
    const result = await runTurn(client, uid, cid, "America/New_York", { gapHours: 3, developerPhoto: "preview" });
    expect(result).toMatchObject({ count: 0, reservation: { actionId: action, phase: "generating" } });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled();
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
    expect(download).not.toHaveBeenCalled(); // No independent storage alias can override the profile.
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(request.body.get("model")).toBe("gpt-image-2.5-sunburst");
    expect(request.body.get("prompt")).toContain(
      "Preserve the exact same recognizable fictional woman",
    );
    expect(request.body.getAll("image")).toHaveLength(1);
    expect(upload).toHaveBeenCalledWith(`${uid}/${action}.png`, expect.any(Uint8Array), {
      contentType: "image/png",
    });
    const plan = mocks.prepare.mock.calls[0]![4];
    expect(plan.rows[0].body).toBe(caption);
    expect(plan.rows[0].metadata.in_reply_to).toBeUndefined(); // An autonomous photo is not a read receipt.
    expect(plan.rows[0].metadata.photo_identity.photography).toMatchObject({profile:'tess',location:'clinic',style:{hairstyle:'clipped_up'}});
    expect(plan.rows[0].metadata.photo_visual).toMatchObject({version:1,character:'tess',location:'clinic',style:{clothing_category:'ordinary work cardigan'}});
    expect(plan.rows[0].metadata.photo_decision.decision).toBe('chosen');
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
    expect(mutations.mock.calls.every(([table]) => table === "world_events")).toBe(true);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "private request details",
    );
  });
  it("fails closed without the canonical identity or successful storage", async () => {
    vi.spyOn(canonical, "canonicalProfile").mockRejectedValueOnce(new Error("missing profile bytes"));
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
  it("does not upload or deliver a required-text photo when its lettering fails screening", async () => {
    const original=await mocks.generate();
    mocks.generate.mockResolvedValue({...original,photo:{...original.photo,text_spec:{exact:"AUTUMN READS",surface:"a small paper sign"}}});
    vi.stubEnv("IMAGE_TEXT_QC","true");
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(Response.json({data:[{b64_json:btoa("png")}]}))
      .mockResolvedValueOnce(Response.json({choices:[{message:{content:JSON.stringify({legible:false,transcription:"AUTUNN REAOS",prominent_garbled_text:true})}}]}));
    vi.stubGlobal("fetch",fetchMock);
    const {runTurn}=await import("@/lib/tess.functions");
    expect((await runTurn(client,uid,cid,"America/New_York",{gapHours:3})).count).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2); // One image, one vision call; never a regeneration.
    expect(upload).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledTimes(1);
  });

  it("never uploads or delivers a visually mismatched character image",async()=>{
    mocks.visual.mockRejectedValue(new Error("face_structure_drift"));
    const fetchMock=vi.fn().mockImplementation(async()=>Response.json({data:[{b64_json:btoa("png")}]}));vi.stubGlobal("fetch",fetchMock);
    const {runTurn}=await import("@/lib/tess.functions");
    expect((await runTurn(client,uid,cid,"America/New_York",{gapHours:3,photoKey:"mismatch"})).count).toBe(0);
    expect(upload).not.toHaveBeenCalled();expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.fail).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mutations).toHaveBeenCalledWith("world_events","insert");
  });

});
