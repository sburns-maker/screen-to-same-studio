// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const mocks = vi.hoisted(() => ({
  admin: null as SupabaseClient<Database> | null,
  text: vi.fn(),
  asr: vi.fn(),
  tts: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mocks.admin;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (f: unknown) => f,
  createServerFn: () => {
    const x = { middleware: () => x, inputValidator: () => x, handler: () => x };
    return x;
  },
}));
vi.mock("@/lib/tess-weather.server", () => ({ getWeatherContext: async () => null }));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: mocks.text,
  generateContactReply: mocks.text,
}));
vi.mock("@/lib/voice-provider.server", async (original) => ({
  ...(await original<typeof import("@/lib/voice-provider.server")>()),
  recognizeSpeech: mocks.asr,
  synthesizeSpeech: mocks.tts,
}));
import {
  phoneCommand,
  phoneSnapshot,
  processVoiceTurn,
  ownedCall,
  offerDueCallback,
  offerSpontaneousCall,
} from "@/lib/phone-calls.server";
import { callAvailability, fictionalNumber, FICTIONAL_NUMBERS } from "@/lib/phone-calls";
import { encodeWave } from "@/lib/phone-audio";
import { syncCalendar, calendarPlans } from "@/lib/interactive-world.server";
let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  cid = "20000000-0000-4000-a000-000000000001",
  now = new Date("2026-10-23T23:30:00Z"),
  id = () => crypto.randomUUID();
const admin = () => mocks.admin!;
const response = (text: string) => ({
  messages: [text],
  tone: "warm",
  state_delta: {},
  event_tags: [],
  send_delay_seconds: 0,
  memory_candidates: [
    {
      memory_type: "fact",
      summary: "Discussed coffee at Switchyard Coffee on Sunday at 2 PM.",
      importance: 3,
    },
  ],
  photo: null,
  photo_boundary_decision: "unchanged",
  continuity: null,
});
const wave = () =>
  Buffer.from(
    encodeWave(
      Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10) * 0.2),
      16000,
    ),
  ).toString("base64");
async function open(direction = "outgoing", outcome = "answer") {
  const call = id();
  await phoneCommand(admin(), user, call, "start", {
    conversation: cid,
    direction,
    outcome,
    reason: "available",
    ring: 5,
  });
  vi.setSystemTime(new Date(now.getTime() + 6000));
  await phoneCommand(admin(), user, call, direction === "incoming" ? "answer" : "resolve");
  await phoneCommand(admin(), user, call, "connect", { max_seconds: 300 });
  return call;
}
beforeAll(async () => {
  db = await worldDatabase();
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  for (const [k, v] of Object.entries({
    ENABLE_VOICE_CALLS: "true",
    VOICE_PROVIDER_VALIDATED: "true",
    OPENAI_API_KEY: "test-only",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    OPENAI_TRANSCRIPTION_MODEL: "test-asr",
    OPENAI_SPEECH_MODEL: "test-tts",
    VOICE_TESS: "a",
    VOICE_MAYA: "b",
    VOICE_CLAIRE: "c",
    VOICE_JORDAN: "d",
    VOICE_BEN: "e",
    VOICE_RILEY: "f",
    VOICE_SIENNA: "g",
    VOICE_KENDRA: "h",
    VOICE_TURN_RESERVATION_CENTS: "5",
    VOICE_DAILY_BUDGET_CENTS: "100",
    VOICE_MONTHLY_BUDGET_CENTS: "1000",
  }))
    vi.stubEnv(k, v);
  await db.exec(
    "TRUNCATE world_control;TRUNCATE user_profile;TRUNCATE conversations CASCADE;TRUNCATE job_runs CASCADE;TRUNCATE call_preferences;TRUNCATE world_places CASCADE;TRUNCATE character_knowledge;",
  );
  mocks.admin = postgresSupabase(db).admin;
  await db.query(
    "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='maya'",
    [cid, user],
  );
  await db.query("insert into tess_state(conversation_id,user_id) values($1,$2)", [cid, user]);
  await db.query("update interactive_world_installation set installed_at=$1", [
    "2026-10-23T00:00:00Z",
  ]);
  await phoneCommand(admin(), user, id(), "preferences", {
    enabled: true,
    incoming: true,
    save_transcripts: true,
  });
  mocks.text
    .mockReset()
    .mockResolvedValue(response("Yes, coffee Sunday at 2 PM at Switchyard Coffee works for me."));
  mocks.asr
    .mockReset()
    .mockResolvedValue("Want to get coffee Sunday at 2 PM at Switchyard Coffee?");
  mocks.tts.mockReset().mockResolvedValue({ base64: "AA==", mime: "audio/mpeg" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("in-app phone ledger and actual character brain with fake paid providers", () => {
  it("keeps fictional reserved numbers stable, unique and correctly scoped to real registry keys", () => {
    expect(fictionalNumber("maya")).toBe("(814) 555-0101");
    expect(new Set(Object.values(FICTIONAL_NUMBERS)).size).toBe(
      Object.keys(FICTIONAL_NUMBERS).length,
    );
    expect(Object.values(FICTIONAL_NUMBERS).every((n) => n >= 100 && n <= 199)).toBe(true);
  });
  it("shares a missed call with later text replies without fabricating an SMS or cross-owner knowledge", async () => {
    const call = id();
    await phoneCommand(admin(), user, call, "start", { conversation: cid, direction: "incoming", outcome: "answer", reason: "spontaneous", ring: 5 });
    vi.setSystemTime(new Date(now.getTime() + 10000));
    await phoneSnapshot(admin(), user);
    const { recentCallContext } = await import("@/lib/call-history-context.server");
    const facts = await recentCallContext(admin(), user, cid, "maya", new Date());
    expect(facts.join(" ")).toContain("You called the player; missed / not answered");
    expect(await recentCallContext(admin(), other, cid, "maya", new Date())).toEqual([]);
    expect(await recentCallContext(admin(), user, cid, "tess", new Date())).toEqual([]);
    expect(await recentCallContext(admin(), user, id(), "maya", new Date())).toEqual([]);
    expect((await db.query("select * from messages")).rows).toHaveLength(0);
    expect((await db.query("select * from memories")).rows).toHaveLength(0);
    const { runTurn } = await import("@/lib/tess.functions");
    await runTurn(admin(), user, cid, "America/New_York");
    const args = mocks.text.mock.calls.at(-1)?.[0];
    expect(args.worldKnowledge.join(" ")).toContain("You called the player; missed / not answered");
  });
  it("rings without charging, connects explicitly, logs actual duration and prevents concurrent calls", async () => {
    const call = await open();
    expect(mocks.asr).not.toHaveBeenCalled();
    expect(mocks.text).not.toHaveBeenCalled();
    expect((await ownedCall(admin(), user, call)).state).toBe("connected");
    await expect(open()).rejects.toThrow();
    vi.setSystemTime(new Date(now.getTime() + 26000));
    await phoneCommand(admin(), user, call, "end");
    expect(await ownedCall(admin(), user, call)).toMatchObject({
      state: "ended",
      duration_seconds: 20,
    });
  });
  it("uses shared memories and commits a spoken agreement to Plans only after playback", async () => {
    await db.query(
      "insert into memories(user_id,conversation_id,summary) values($1,$2,'User takes black coffee without sugar')",
      [user, cid],
    );
    const call = await open(),
      turn = id();
    await processVoiceTurn(admin(), user, call, turn, wave());
    expect(mocks.text.mock.calls[0]![0].memories.join(" ")).toContain("black coffee");
    expect((await calendarPlans(admin(), user))[0]?.status).not.toBe("accepted");
    expect((await db.query("select * from messages where sender='tess'")).rows).toHaveLength(0);
    await phoneCommand(admin(), user, call, "played", { turn });
    await syncCalendar(admin(), user, new Date());
    expect((await calendarPlans(admin(), user))[0]!.status).toBe("accepted");
    const count = (await db.query("select * from memories")).rows.length;
    await phoneCommand(admin(), user, call, "played", { turn });
    expect((await db.query("select * from memories")).rows).toHaveLength(count);
    expect(
      (await db.query("select * from character_knowledge where character_key='tess'")).rows,
    ).toHaveLength(0);
  });
  it("discards unheard replies and does not repeat paid work on retry", async () => {
    const call = await open(),
      turn = id();
    await processVoiceTurn(admin(), user, call, turn, wave());
    await phoneCommand(admin(), user, call, "interrupt", { turn });
    expect((await db.query("select * from memories")).rows).toHaveLength(0);
    expect((await db.query("select * from messages where sender='tess'")).rows).toHaveLength(0);
    await expect(processVoiceTurn(admin(), user, call, turn, wave())).rejects.toThrow(
      "already attempted",
    );
    expect(mocks.asr).toHaveBeenCalledTimes(1);
  });
  it("rejects another user's call and late playback after hangup", async () => {
    const call = await open(),
      turn = id();
    await processVoiceTurn(admin(), user, call, turn, wave());
    await expect(ownedCall(admin(), other, call)).rejects.toThrow();
    await phoneCommand(admin(), user, call, "end");
    await phoneCommand(admin(), user, call, "played", { turn });
    expect((await db.query("select * from messages where sender='tess'")).rows).toHaveLength(0);
  });
  it("records failed speech without committing a response or leaking provider errors", async () => {
    const call = await open();
    mocks.tts.mockRejectedValueOnce(new Error("secret provider failure"));
    await expect(processVoiceTurn(admin(), user, call, id(), wave())).rejects.toThrow(
      "interrupted",
    );
    expect((await db.query("select * from messages where sender='tess'")).rows).toHaveLength(0);
    expect((await ownedCall(admin(), user, call)).last_failure).toBe("voice_turn_failed");
  });
  it("requires transcript consent and reserves spending before paid inference", async () => {
    const call = await open();
    vi.stubEnv("VOICE_DAILY_BUDGET_CENTS", "1");
    await expect(processVoiceTurn(admin(), user, call, id(), wave())).rejects.toThrow();
    expect(mocks.asr).not.toHaveBeenCalled();
    await phoneCommand(admin(), user, call, "end");
    await phoneCommand(admin(), user, id(), "preferences", {
      enabled: true,
      incoming: false,
      save_transcripts: false,
    });
    await expect(open()).rejects.toThrow();
  });
  it("keeps raw audio out of storage, deletes chosen transcripts and preserves confirmed memory", async () => {
    const call = await open(),
      turn = id();
    await processVoiceTurn(admin(), user, call, turn, wave());
    await phoneCommand(admin(), user, call, "played", { turn });
    await phoneCommand(admin(), user, call, "end");
    await phoneCommand(admin(), user, call, "delete_transcript");
    expect(
      (await db.query("select * from messages where metadata->>'call_id'=$1", [call])).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from memories")).rows.length).toBeGreaterThan(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
  });
  it("filters a character's call history on the server and never exposes another owner's calls", async () => {
    const call = id();
    await phoneCommand(admin(), user, call, "start", {
      conversation: cid,
      direction: "incoming",
      outcome: "answer",
      reason: "callback",
      ring: 5,
    });
    vi.setSystemTime(new Date(now.getTime() + 10000));
    const history = await phoneSnapshot(admin(), user, true, cid);
    expect(history.calls.map((c) => c.id)).toEqual([call]);
    expect(history.calls[0]?.state).toBe("missed");
    expect((await phoneSnapshot(admin(), other, true, cid)).calls).toEqual([]);
    expect((await phoneSnapshot(admin(), user, true, id())).calls).toEqual([]);
    expect(mocks.text).not.toHaveBeenCalled();
  });
  it("handles declined, asleep and expired calls without paid inference", async () => {
    expect(callAvailability("tess", new Date("2026-10-23T07:00:00Z")).outcome).toBe("missed");
    const incoming = id();
    await phoneCommand(admin(), user, incoming, "start", {
      conversation: cid,
      direction: "incoming",
      outcome: "answer",
      reason: "callback",
      ring: 5,
    });
    await phoneCommand(admin(), user, incoming, "decline");
    expect((await ownedCall(admin(), user, incoming)).state).toBe("declined");
    const next = id();
    await phoneCommand(admin(), user, next, "start", {
      conversation: cid,
      direction: "incoming",
      outcome: "answer",
      reason: "callback",
      ring: 5,
    });
    vi.setSystemTime(new Date(now.getTime() + 10000));
    await phoneSnapshot(admin(), user);
    expect((await ownedCall(admin(), user, next)).state).toBe("missed");
    expect(mocks.text).not.toHaveBeenCalled();
    await phoneCommand(admin(), user, next, "callback");
    await phoneCommand(admin(), user, next, "callback");
    expect(
      (
        await db.query("select * from messages where metadata->>'phone_callback_request'=$1", [
          next,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("offers one grounded incoming callback, accepts it and can end a brief call through the normal brain", async () => {
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    const tess = "20000000-0000-4000-a000-000000000003",
      source = id(),
      record = id();
    await db.query(
      "insert into conversations(id,user_id,character_id,real_time_mode) select $1,$2,id,true from characters where key='tess'",
      [tess, user],
    );
    await db.query("insert into tess_state(conversation_id,user_id) values($1,$2)", [tess, user]);
    await db.query(
      "insert into messages(id,user_id,conversation_id,sender,body) values($1,$2,$3,'tess',$4)",
      [source, user, tess, "I'll call you when I finish my walk."],
    );
    await db.query(
      "insert into world_records(id,user_id,conversation_id,character_key,kind,key,summary,status,source_message_id,source_quote,due_at,expires_at) values($1,$2,$3,'tess','check_in','callback','A promised callback','pending',$4,$5,$6,$7)",
      [
        record,
        user,
        tess,
        source,
        "I'll call you when I finish my walk.",
        new Date(now.getTime() - 1000).toISOString(),
        new Date(now.getTime() + 3600000).toISOString(),
      ],
    );
    expect(await offerDueCallback(admin(), user, new Date())).toBe(true);
    const call = (await phoneSnapshot(admin(), user)).calls[0]!;
    expect(call.direction).toBe("incoming");
    expect(mocks.text).not.toHaveBeenCalled();
    await phoneCommand(admin(), user, call.id, "answer");
    await phoneCommand(admin(), user, call.id, "connect", { max_seconds: 300 });
    mocks.text.mockResolvedValue({
      ...response("Your scheduled sarcasm delivery has arrived. <end_call>"),
      state_delta: { trust: 10, romantic_attraction: 10 },
      memory_candidates: [],
    });
    const before = (
      await db.query<{ trust: number; romantic_attraction: number }>(
        "select trust,romantic_attraction from tess_state where conversation_id=$1",
        [tess],
      )
    ).rows[0]!;
    const turn = id();
    const audio = await processVoiceTurn(admin(), user, call.id, turn, null);
    expect(audio.endCall).toBe(true);
    expect(mocks.tts.mock.calls[0]![0]).not.toContain("<end_call>");
    await phoneCommand(admin(), user, call.id, "played", { turn });
    await phoneCommand(admin(), user, call.id, "end");
    expect(
      (
        await db.query(
          "select trust,romantic_attraction from tess_state where conversation_id=$1",
          [tess],
        )
      ).rows[0],
    ).toEqual(before);
    expect(
      (await db.query<{ status: string }>("select status from world_records where id=$1", [record]))
        .rows[0]!.status,
    ).toBe("fulfilled");
    expect(await offerDueCallback(admin(), user, new Date())).toBe(false);
  });
  it("accepts a due callback from Maya using the actual shared character-message transport", async () => {
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    const conversation = cid;
    const source = id();
    const record = id();
    await db.query(
      "insert into messages(id,user_id,conversation_id,sender,body) values($1,$2,$3,'tess',$4)",
      [source, user, conversation, "I'll call you when I get home."],
    );
    await db.query(
      "insert into world_records(id,user_id,conversation_id,character_key,kind,key,summary,status,source_message_id,source_quote,due_at,expires_at) values($1,$2,$3,'maya','check_in','callback','Maya promised a callback','pending',$4,$5,$6,$7)",
      [
        record,
        user,
        conversation,
        source,
        "I'll call you when I get home.",
        new Date(now.getTime() - 1000).toISOString(),
        new Date(now.getTime() + 3600000).toISOString(),
      ],
    );
    await db.query("update conversations set real_time_mode=false where id=$1", [conversation]);
    expect(await offerDueCallback(admin(), user, new Date())).toBe(true);
    const calls = (await phoneSnapshot(admin(), user)).calls;
    expect(calls[0]?.character_key).toBe("maya");
    expect(calls[0]?.direction).toBe("incoming");
  });
  it("respects quiet hours and keeps incoming calls off by default", async () => {
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    expect((await phoneSnapshot(admin(), other)).preferences.incoming).toBe(false);
    await db.query("insert into user_profile(user_id,key,value) values($1,'quiet_hours','18-08')", [
      user,
    ]);
    expect(await offerDueCallback(admin(), user, new Date())).toBe(false);
    expect(mocks.text).not.toHaveBeenCalled();
  });
});

describe("developer incoming-call readiness and controlled ringing", () => {
  async function ready() {
    vi.stubEnv("ENABLE_DEV_PHOTO_ACTIONS", "true");
    vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", user);
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    return import("@/lib/call-readiness.server");
  }
  it("reports owned contacts and blockers without mutating expired calls or invoking providers", async () => {
    const { incomingCallDiagnostics } = await ready();
    const call = id();
    await phoneCommand(admin(), user, call, "start", {
      conversation: cid,
      direction: "incoming",
      outcome: "answer",
      reason: "test",
      ring: 25,
    });
    vi.setSystemTime(new Date(now.getTime() + 26000));
    const before = (await db.query("select * from phone_calls")).rows;
    const report = await incomingCallDiagnostics(admin(), user, new Date());
    expect(report.characters.map((c) => c.conversationId)).toEqual([cid]);
    expect(report.globalBlocks).toContain("Another call active");
    expect((await db.query("select * from phone_calls")).rows).toEqual(before);
    expect(mocks.text).not.toHaveBeenCalled();
    expect(mocks.asr).not.toHaveBeenCalled();
    expect(mocks.tts).not.toHaveBeenCalled();
  });
  it("rejects unauthorized diagnostics and test rings before reading or changing state", async () => {
    const { incomingCallDiagnostics, developerTestRing } = await ready();
    await expect(incomingCallDiagnostics(admin(), other)).rejects.toThrow(
      "Developer diagnostics unavailable",
    );
    await expect(developerTestRing(admin(), other, cid, id())).rejects.toThrow(
      "Developer diagnostics unavailable",
    );
    expect((await db.query("select * from phone_calls")).rows).toHaveLength(0);
  });
  it("creates one 25-second ring, replays its request safely, and does not request paid audio", async () => {
    const { developerTestRing } = await ready();
    const request = id();
    await developerTestRing(admin(), user, cid, request);
    await developerTestRing(admin(), user, cid, request);
    expect((await db.query("select * from phone_calls")).rows).toHaveLength(1);
    const call = await ownedCall(admin(), user, request);
    expect(call).toMatchObject({ direction: "incoming", state: "ringing", duration_seconds: 0 });
    expect(Date.parse(call.ring_until) - Date.parse(call.offered_at)).toBe(25000);
    expect(mocks.text).not.toHaveBeenCalled();
    expect(mocks.asr).not.toHaveBeenCalled();
    expect(mocks.tts).not.toHaveBeenCalled();
    await phoneCommand(admin(), user, request, "decline");
    expect((await ownedCall(admin(), user, request)).state).toBe("declined");
  });
  it("respects incoming opt-out, server switch, quiet hours and owned conversation authorization", async () => {
    const { developerTestRing } = await ready();
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "false");
    await expect(developerTestRing(admin(), user, cid, id())).rejects.toThrow("switch disabled");
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    await phoneCommand(admin(), user, id(), "preferences", {
      enabled: true,
      incoming: false,
      save_transcripts: true,
    });
    await expect(developerTestRing(admin(), user, cid, id())).rejects.toThrow("preferences");
    await phoneCommand(admin(), user, id(), "preferences", {
      enabled: true,
      incoming: true,
      save_transcripts: true,
    });
    await expect(developerTestRing(admin(), user, id(), id())).rejects.toThrow(
      "owned, unmuted conversation",
    );
    await db.query("insert into user_profile(user_id,key,value) values($1,'quiet_hours','18-08')", [
      user,
    ]);
    await expect(developerTestRing(admin(), user, cid, id())).rejects.toThrow("Quiet hours");
    expect((await db.query("select * from phone_calls")).rows).toHaveLength(0);
  });
  it("detects connecting calls and enforces one winner for simultaneous test requests", async () => {
    const { developerTestRing, incomingCallDiagnostics } = await ready();
    const results = await Promise.allSettled([
      developerTestRing(admin(), user, cid, id()),
      developerTestRing(admin(), user, cid, id()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const call = (await db.query<{ id: string }>("select id from phone_calls")).rows[0]!;
    await phoneCommand(admin(), user, call.id, "answer");
    expect((await incomingCallDiagnostics(admin(), user)).globalBlocks).toContain(
      "Another call active",
    );
    await expect(developerTestRing(admin(), user, cid, id())).rejects.toThrow("Another call");
  });
});

describe("autonomous calls independent of texting mode", () => {
  async function selectedTime() {
    const { incomingCallSelection } = await import("@/lib/incoming-call-policy");
    // Find a selected free evening in a deterministic user/contact hourly draw.
    for (let day = 23; day < 31; day++) {
      const candidate = new Date(`2026-10-${day}T23:30:00Z`);
      if (
        incomingCallSelection(user, "maya", candidate).selected &&
        callAvailability("maya", candidate).outcome === "answer"
      )
        return candidate;
    }
    throw new Error("Selected fixture missing");
  }
  it("offers a real persisted incoming call in Practice mode, without paid inference or repeated rings", async () => {
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    const when = await selectedTime();
    vi.setSystemTime(when);
    await db.query("update conversations set real_time_mode=false where id=$1", [cid]);
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(true);
    const call = (await phoneSnapshot(admin(), user)).calls[0]!;
    expect(call).toMatchObject({ character_key: "maya", direction: "incoming", state: "ringing" });
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(false);
    await phoneCommand(admin(), user, call.id, "decline");
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(false);
    expect((await db.query("select * from phone_calls")).rows).toHaveLength(1);
    expect(mocks.text).not.toHaveBeenCalled();
    expect(mocks.asr).not.toHaveBeenCalled();
    expect(mocks.tts).not.toHaveBeenCalled();
  });
  it("shares eligibility with diagnostics and supports Practice-mode developer rings", async () => {
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    vi.stubEnv("ENABLE_DEV_PHOTO_ACTIONS", "true");
    vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", user);
    const when = await selectedTime();
    vi.setSystemTime(when);
    await db.query("update conversations set real_time_mode=false where id=$1", [cid]);
    const { incomingCallDiagnostics, developerTestRing } =
      await import("@/lib/call-readiness.server");
    const report = await incomingCallDiagnostics(admin(), user, when);
    expect(report.globalBlocks).toEqual([]);
    expect(report.characters[0]).toMatchObject({
      realTime: false,
      selectedThisHour: true,
      blockers: [],
    });
    expect(report.worker.lastCheckedAt).toBeNull();
    await db.query("insert into world_control(key,value,updated_at) values($1,$2,$3)", [
      `incoming_calls:${other}`,
      JSON.stringify({ offered: true }),
      when.toISOString(),
    ]);
    expect((await incomingCallDiagnostics(admin(), user, when)).worker.lastCheckedAt).toBeNull();
    await db.query("insert into world_control(key,value,updated_at) values($1,$2,$3)", [
      `incoming_calls:${user}`,
      JSON.stringify({ offered: false, failed: true }),
      when.toISOString(),
    ]);
    expect((await incomingCallDiagnostics(admin(), user, when)).worker).toMatchObject({
      failed: true,
      offered: false,
    });
    await developerTestRing(admin(), user, cid, id());
    expect((await db.query("select * from phone_calls")).rows).toHaveLength(1);
  });
  it("still respects quiet hours, mute, occupied presence and opt-out in Practice mode", async () => {
    vi.stubEnv("ENABLE_INCOMING_VOICE_CALLS", "true");
    const when = await selectedTime();
    vi.setSystemTime(when);
    await db.query("update conversations set real_time_mode=false,muted=true where id=$1", [cid]);
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(false);
    await db.query("update conversations set muted=false where id=$1", [cid]);
    await db.query("insert into user_profile(user_id,key,value) values($1,'quiet_hours','18-08')", [
      user,
    ]);
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(false);
    await db.query("delete from user_profile");
    const plan = id();
    await db.query(
      "insert into world_places(user_id,key,label,kind) values($1,'call-test-venue','Test venue','cafe')",
      [user],
    );
    await db.query(
      "insert into social_plans(user_id,id,organizer,place_key,title,starts_at,ends_at) values($1,$2,'maya','call-test-venue','Test event',$3,$4)",
      [user, plan, when.toISOString(), new Date(when.getTime() + 3600000).toISOString()],
    );
    await db.query(
      "insert into social_presence(user_id,character_key,plan_id,place_key,until_at) values($1,'maya',$2,'call-test-venue',$3)",
      [user, plan, new Date(when.getTime() + 3600000).toISOString()],
    );
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(false);
    await db.query("delete from social_presence");
    await phoneCommand(admin(), user, id(), "preferences", {
      enabled: true,
      incoming: false,
      save_transcripts: true,
    });
    expect(await offerSpontaneousCall(admin(), user, when)).toBe(false);
    expect((await db.query("select * from phone_calls")).rows).toHaveLength(0);
  });
});
