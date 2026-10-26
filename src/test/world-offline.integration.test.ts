// @vitest-environment node
import { readFileSync } from "node:fs";
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
  it("runs Claire's invitation, acceptance, book-club activity and later memory through the actual primary turn service", async () => {
    const { runTurn } = await import("@/lib/tess.functions");
    const { syncCalendar, calendarPlans, interactiveSnapshot, actAtVenue } =
      await import("@/lib/interactive-world.server");
    const { visitTown } = await import("@/lib/town.server");
    const { progressVenue } = await import("@/lib/venue-experiences.server");
    await db.query("update interactive_world_installation set installed_at=$1", [
      new Date(now.getTime() - 60000).toISOString(),
    ]);
    const claire = "20000000-0000-4000-a000-999999999998";
    await db.query(
      "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='claire'",
      [claire, user],
    );
    await db.query("insert into tess_state(conversation_id,user_id) values($1,$2)", [claire, user]);
    const response = (text: string) => ({
      messages: [text],
      tone: "warm",
      state_delta: {},
      event_tags: [],
      send_delay_seconds: 0,
      memory_candidates: [],
      photo_boundary_decision: "unchanged",
      continuity: null,
      photo: null,
    });
    const sendUser = async (body: string) => {
      await db.query(
        "insert into messages(user_id,conversation_id,sender,body,created_at,visible_at) values($1,$2,'user',$3,$4,$4)",
        [user, claire, body, new Date().toISOString()],
      );
    };
    await sendUser("Any plans for tonight?");
    mocks.text.mockResolvedValue(
      response("Want to come to book club tonight at 7 PM at Lantern Reading Room?"),
    );
    await runTurn(mocks.admin!, user, claire, "America/New_York");
    vi.setSystemTime(new Date(now.getTime() + 5 * 60000));
    await syncCalendar(mocks.admin!, user, new Date());
    expect((await calendarPlans(mocks.admin!, user))[0]!.status).toBe("proposed");
    await sendUser("Yes! I'll meet you there.");
    mocks.text.mockResolvedValue(response("See you there."));
    await runTurn(mocks.admin!, user, claire, "America/New_York");
    vi.setSystemTime(new Date(now.getTime() + 10 * 60000));
    await syncCalendar(mocks.admin!, user, new Date());
    const plans = await calendarPlans(mocks.admin!, user);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("accepted");
    await visitTown(mocks.admin!, user, "reading:lantern", new Date("2026-10-22T22:30:00Z"));
    const during = new Date("2026-10-22T23:01:00Z");
    vi.setSystemTime(during);
    const snap = await interactiveSnapshot(mocks.admin!, user, during);
    expect(snap.companions.map((c) => c.character_key)).toContain("claire");
    for (const step of [-1, 0, 1, 2])
      await progressVenue(
        mocks.admin!,
        user,
        {
          id: crypto.randomUUID(),
          place: "reading:lantern",
          kind: "book_club",
          step,
          choice: step === -1 ? -1 : 0,
          planId: plans[0]!.id,
        },
        during,
      );
    await actAtVenue(
      mocks.admin!,
      user,
      { id: crypto.randomUUID(), place: "reading:lantern", action: "leave", text: "" },
      new Date("2026-10-22T23:30:00Z"),
    );
    expect((await calendarPlans(mocks.admin!, user))[0]!.status).toBe("completed");
    vi.setSystemTime(new Date("2026-10-23T14:00:00Z"));
    await sendUser("What stayed with you from book club?");
    mocks.text
      .mockClear()
      .mockResolvedValue(
        response("Your different interpretation gave me something to think about."),
      );
    await runTurn(mocks.admin!, user, claire, "America/New_York");
    expect(mocks.text.mock.calls[0]![0].memories.join("\n")).toContain(
      "A character's difficult decision",
    );
    expect(
      (await db.query("select * from character_knowledge where character_key='maya' ")).rows,
    ).toHaveLength(0);
    expect(mocks.image).not.toHaveBeenCalled();
  }, 20000);
  it("synchronizes conversational invitations and advances character arrival through the offline worker with AI budget zero", async () => {
    vi.stubEnv("AUTONOMOUS_AI_DAILY_LIMIT", "0");
    await db.query("update interactive_world_installation set installed_at=$1", [
      new Date(now.getTime() - 60000).toISOString(),
    ]);
    const claire = "20000000-0000-4000-a000-999999999999";
    await db.query(
      "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='claire'",
      [claire, user],
    );
    await db.query("insert into tess_state(conversation_id,user_id) values($1,$2)", [claire, user]);
    for (const [i, sender, body] of [
      [0, "tess", "Want to come to book club tonight at 7 PM at Lantern Reading Room?"],
      [1, "user", "Yes!"],
    ] as const)
      await db.query(
        "insert into messages(user_id,conversation_id,sender,body,created_at,visible_at) values($1,$2,$3,$4,$5,$5)",
        [user, claire, sender, body, new Date(now.getTime() - 10000 + i * 1000).toISOString()],
      );
    const first = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(first.errors).toEqual([]);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from social_plans where origin='conversation'",
        )
      ).rows,
    ).toEqual([{ status: "accepted" }]);
    const later = new Date("2026-10-22T23:01:00Z");
    vi.setSystemTime(later);
    expect((await runWorldTickWithAdmin(mocks.admin!, later)).errors).toEqual([]);
    expect(
      (
        await db.query<{ character_key: string }>(
          "select character_key from social_presence where character_key='claire'",
        )
      ).rows,
    ).toEqual([{ character_key: "claire" }]);
    expect(
      (
        await db.query<{ user_attendance: string }>(
          "select user_attendance from social_plans where origin='conversation'",
        )
      ).rows,
    ).toEqual([{ user_attendance: "not_reported" }]);
    expect(mocks.text).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
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
  it("lets Maya send an ordinary selfie offline without an invitation or special event as the photo trigger",async()=>{
    const {photoContextForSchedule}=await import("@/lib/calendar-commitment");
    const at=new Date("2026-10-25T15:00:00Z");
    vi.setSystemTime(at);
    await db.query("delete from conversations where id=$1",[cid]);
    const def=characterFor("maya");
    const schedule=currentActivity(def,at);
    for(let n=1;n<100;n++){
      cid=`20000000-0000-4000-a000-${String(n).padStart(12,"0")}`;
      if(photoOpportunity({character:"maya",conversationId:cid,now:at,schedule,state,frequency:"normal",eligibleTypes:["casual_selfie"],lastPhotoAt:null,ownSinceLastPhoto:99,gapHours:999,context:photoContextForSchedule(schedule)}).selected)break;
    }
    await db.query("insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='maya'",[cid,user]);
    await db.query("insert into tess_state(conversation_id,user_id,comfort,trust,curiosity) values($1,$2,65,60,65)",[cid,user]);
    const reply=await mocks.text();
    mocks.text.mockResolvedValue({...reply,messages:["Just felt like saying hi."],photo:{...reply.photo,scene:"a casual close front-camera selfie in ordinary clothes against a neutral background, no people or text",setting:"neutral background",expression:"relaxed",clothing_category:"ordinary casual"}}).mockClear();
    const report=await runWorldTickWithAdmin(mocks.admin!,at);
    expect(report.errors).toEqual([]);
    expect(mocks.text).toHaveBeenCalledTimes(1);
    expect(mocks.image).toHaveBeenCalledTimes(1);
    const decisions=(await db.query<{payload:{trigger:string,photoSent:boolean,generationRequested:boolean}}>("select payload from world_events where kind='photo_decision' and conversation_id=$1",[cid])).rows;
    expect(decisions[0]!.payload.trigger).not.toMatch(/Becca|weekend.*together|ongoing situation/i);
    expect(decisions[0]!.payload).toMatchObject({photoSent:true,generationRequested:true});
    expect(await count("generated_images")).toBe(1);
    await runWorldTickWithAdmin(mocks.admin!,at);
    expect(mocks.image).toHaveBeenCalledTimes(1);
  },20000);
  it("continues structured world progression when the paid-call budget is zero", async () => {
    vi.stubEnv("AUTONOMOUS_AI_DAILY_LIMIT", "0");
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(report.aiCalls).toBe(0);
    expect(await count("character_world_state")).toBe(1);
    expect(await count("shared_events")).toBeGreaterThan(0);
    expect(await count("messages")).toBe(0);
    expect(mocks.text).not.toHaveBeenCalled();
    const checkpoint = (await db.query<{value:{offered:boolean;failed:boolean};updated_at:Date}>(
      "select value,updated_at from world_control where key=$1", [`incoming_calls:${user}`])).rows[0];
    expect(checkpoint?.value).toEqual({ offered: false, failed: false });
    expect(new Date(checkpoint!.updated_at).toISOString()).toBe(now.toISOString());
  });
  it("sends background messages in Practice mode when initiation is due", async () => {
    await db.query("update conversations set real_time_mode=false where id=$1", [cid]);
    const report = await runWorldTickWithAdmin(mocks.admin!, now);
    expect(report.errors).toEqual([]);
    expect(await count("character_world_state")).toBe(1);
    expect(mocks.text).toHaveBeenCalled();
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
  it("responds to an uploaded video's caption without claiming video analysis or invoking an image provider", async () => {
    const response = await mocks.text();
    mocks.text.mockClear();
    mocks.text.mockResolvedValue({
      ...response,
      photo: null,
      messages: ["What part of the walk did you want to show me?"],
    });
    const id = "70000000-0000-4000-a000-000000000001";
    await db.query(
      "insert into messages(id,conversation_id,user_id,sender,body,metadata,created_at,visible_at) values($1,$2,$3,'user','A clip from my walk',$4,$5,$5)",
      [
        id,
        cid,
        user,
        JSON.stringify({
          user_video: {
            path: `${user}/${id}.mp4`,
            mime: "video/mp4",
            bytes: 16,
            duration_seconds: 5,
          },
          video_analysis: "not_analyzed",
        }),
        now.toISOString(),
      ],
    );
    const { runTurn } = await import("@/lib/tess.functions");
    await runTurn(mocks.admin!, user, cid, "America/New_York");
    const sent = mocks.text.mock.calls[0]![0].messages.find(
      (m: { sender: string }) => m.sender === "user",
    );
    expect(sent.body).toContain("A clip from my walk");
    expect(sent.body).toContain("NOT been analyzed");
    expect(mocks.image).not.toHaveBeenCalled();
    expect(
      (await db.query<{ body: string }>("select body from messages where id=$1", [id])).rows[0]!
        .body,
    ).toBe("A clip from my walk");
  }, 20000);
  it("the managed leased world tick completes a due Living Experience without browser activity", async () => {
    await db.exec(
      "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$",
    );
    for (const f of [
      "0024_verify_phone_calls",
      "0025_living_experiences",
      "0026_complete_living_experiences",
    ])
      await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
    vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "true");
    const appointment = "2026-10-25T18:00:00Z",
      later = new Date("2026-10-25T22:01:00Z");
    vi.setSystemTime(later);
    await db.exec(
      `UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00:00Z';UPDATE conversations SET muted=true,real_time_mode=false;`,
    );
    const maya = "20000000-0000-4000-a000-999999999997",
      plan = "30000000-0000-4000-a000-999999999997";
    await db.exec(
      `INSERT INTO conversations(user_id,id,character_id,real_time_mode,muted) SELECT '${user}','${maya}',id,true,true FROM characters WHERE key='maya';INSERT INTO tess_state(user_id,conversation_id) VALUES('${user}','${maya}');INSERT INTO world_places(user_id,key,label,kind) VALUES('${user}','coffee:local','Switchyard Coffee','cafe') ON CONFLICT DO NOTHING;INSERT INTO social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at,status,origin,conversation_id,category,date_local,time_local) VALUES('${user}','${plan}','maya','coffee:local','Quiet coffee','${appointment}','2026-10-25T19:00Z','accepted','conversation','${maya}','coffee','2026-10-25','14:00');`,
    );
    mocks.text.mockResolvedValue({
      messages: ["A modest off-screen coffee outing ended without new commitments."],
      state_delta: {},
      photo: null,
      continuity: null,
      memory_candidates: [],
      event_tags: [],
    });
    const report = await runWorldTickWithAdmin(mocks.admin!, later);
    expect(report.errors).toEqual([]);
    expect(report.aiCalls).toBe(1);
    expect(
      (
        await db.query(
          `SELECT state,synced_at IS NOT NULL synced FROM living_experiences WHERE plan_id='${plan}'`,
        )
      ).rows[0],
    ).toEqual({ state: "completed", synced: true });
    expect(
      (await db.query(`SELECT count(*)::int n FROM memories WHERE conversation_id='${maya}'`))
        .rows[0],
    ).toEqual({ n: 1 });
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("uses delivered home statements for the same selfie preview and actual normal image pipeline", async () => {
    await db.exec(
      "CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$",
    );
    const ready = (
      await db.query<{ present: string | null }>(
        "SELECT to_regprocedure('experience_status()') present",
      )
    ).rows[0]?.["present"];
    if (!ready)
      for (const f of [
        "0024_verify_phone_calls",
        "0025_living_experiences",
        "0026_complete_living_experiences",
      ])
        await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
    for (const file of [
      "0033_riley_living_experience_guards",
      "0034_experience_retry_recovery",
      "0035_remove_experience_daily_cap",
      "0036_mutual_calendar_confirmation",
      "0037_all_character_calendar_proposers",
      "0038_canonical_scheduling",
      "0039_experience_live_scene",
    ])
      await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
    vi.setSystemTime(new Date("2026-10-24T23:45:00Z"));
    for (const [body, at] of [
      ["I'm at the grocery store, picking up a few things.", "2026-10-24T23:30Z"],
      ["I'm home now. Groceries are away and I'm relaxing on the couch.", "2026-10-24T23:40Z"],
      ["I'm relaxing at home for the evening.", "2026-10-24T23:44Z"],
    ])
      await db.query(
        "INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'tess',$4,$5,$5)",
        [crypto.randomUUID(), user, cid, body, at],
      );
    const reply = await mocks.text.getMockImplementation()!();
    mocks.text.mockResolvedValue({
      ...reply,
      messages: ["The couch has won."],
      photo: {
        ...reply.photo,
        scene: "A casual front-camera selfie on the couch at home after putting groceries away",
        setting: "home living room",
        contextual: true,
        willing: true,
      },
    });
    const { runTurn } = await import("@/lib/tess.functions");
    const request = `developer:${crypto.randomUUID()}`,
      context = "A casual selfie at home";
    const preview = await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: request,
      developerPhoto: "preview",
    });
    const p = preview as unknown as {
      opportunity: { eligible: boolean };
      photoValidation: {
        allowed: boolean;
        canonicalLocation: string;
        inferredRequestedScene: string;
      };
      previewSceneVersion: string;
    };
    expect(p.opportunity.eligible).toBe(true);
    expect(p.photoValidation).toMatchObject({
      allowed: true,
      canonicalLocation: "home",
      inferredRequestedScene: "home",
    });
    expect(mocks.image).not.toHaveBeenCalled();
    expect(await count("character_scene_state")).toBe(0);
    const delivered = await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: request,
      developerPhoto: "deliver",
      expectedSceneVersion: p.previewSceneVersion,
    });
    expect(delivered.count).toBeGreaterThan(0);
    expect(mocks.image).toHaveBeenCalledTimes(1);
    expect(
      (await db.query("SELECT location FROM character_scene_state WHERE conversation_id=$1", [cid]))
        .rows,
    ).toEqual([{ location: "home" }]);
    expect(
      (
        await db.query(
          "SELECT metadata->>'generated_path' path FROM messages WHERE metadata ? 'generated_path'",
        )
      ).rows,
    ).toHaveLength(1);
    await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: request,
      developerPhoto: "deliver",
      expectedSceneVersion: p.previewSceneVersion,
    });
    expect(mocks.image).toHaveBeenCalledTimes(1);
    const badKey = `developer:${crypto.randomUUID()}`;
    const secondPreview = (await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: badKey,
      developerPhoto: "preview",
    })) as unknown as typeof p;
    expect(secondPreview.photoValidation.allowed).toBe(true);
    mocks.text.mockResolvedValue({
      ...reply,
      messages: ["A clinic picture."],
      photo: {
        ...reply.photo,
        scene: "A casual selfie at the clinic office",
        setting: "clinic office",
        contextual: true,
        willing: true,
      },
    });
    const mismatch = await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: badKey,
      developerPhoto: "deliver",
      expectedSceneVersion: secondPreview.previewSceneVersion,
    });
    expect(mismatch).toMatchObject({
      count: 0,
      photoValidation: {
        canonicalLocation: "home",
        inferredRequestedScene: "clinic",
        failedRule: "photo.location_matches_current_scene",
        stage: "generated_scene",
        imageRequested: false,
      },
    });
    expect(mocks.image).toHaveBeenCalledTimes(1);
    await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: badKey,
      developerPhoto: "deliver",
      expectedSceneVersion: secondPreview.previewSceneVersion,
    });
    expect(mocks.image).toHaveBeenCalledTimes(1);
    expect(mocks.text).toHaveBeenCalledTimes(2);
    await db.query(
      "INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'tess',$4,'2026-10-24T23:46Z','2026-10-24T23:46Z')",
      [crypto.randomUUID(), user, cid, "I'm at the clinic now."],
    );
    vi.setSystemTime(new Date("2026-10-24T23:47Z"));
    const changed = await runTurn(mocks.admin!, user, cid, "America/New_York", {
      gapHours: 1,
      reason: context,
      photoKey: `developer:${crypto.randomUUID()}`,
      developerPhoto: "deliver",
      expectedSceneVersion: p.previewSceneVersion,
    });
    expect(changed).toMatchObject({
      count: 0,
      photoValidation: {
        failedRule: "photo.preview_scene_version_matches",
        canonicalLocation: "clinic",
      },
    });
    expect(mocks.image).toHaveBeenCalledTimes(1);
  });
});
