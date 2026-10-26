import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: null as unknown,
  state: "ringing",
  updates: [] as unknown[],
  fetch: vi.fn(),
  rpc: vi.fn(),
  close: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: unknown) => fn,
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mocks.db;
  },
}));
vi.mock("@/lib/shared-world.server", () => ({ sharedPlanContext: async () => null }));
vi.mock("@/lib/interactive-world.server", () => ({ calendarContext: async () => [] }));
vi.mock("@/lib/call-history-context.server", () => ({ recentCallContext: async () => [] }));
vi.mock("@/lib/tess.server", () => ({ CHARACTER_BIBLE: "Canonical Tess" }));
vi.mock("@/lib/live-calls.server", () => ({
  resolveCharacterVoice: async () => ({ voiceId: "voice_tess", label: "Tess", source: "studio" }),
  liveCalls: () => query("live_character_calls"),
  closeLiveCall: mocks.close,
}));
vi.mock("@/lib/phone-calls.server", () => ({
  incomingLiveMode: () => true,
  ownedCall: async () => ({
    id: "offer",
    conversation_id: "conversation",
    character_key: "tess",
    direction: "incoming",
    state: mocks.state,
    ring_until: new Date(Date.now() + 30000).toISOString(),
  }),
  phoneCommand: mocks.command,
}));
function query(table: string) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    lte: () => q,
    limit: () => q,
    update: (value: unknown) => {
      mocks.updates.push(value);
      return q;
    },
    maybeSingle: async () => ({
      data: { id: "conversation", relationship_stage: "dating", character: { key: "tess" } },
      error: null,
    }),
    then: (resolve: (r: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  void table;
  return q;
}
import { startLiveCall } from "@/lib/live-calls.functions";
const start = () =>
  (startLiveCall as unknown as (v: unknown) => Promise<unknown>)({
    context: { userId: "owner", supabase: mocks.db },
    data: { conversationId: "conversation", incomingCallId: "offer", sdp: "private-sdp" },
  });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T18:00:00Z"));
  vi.stubEnv("ENABLE_LIVE_CHARACTER_CALLS", "true");
  vi.stubEnv("OPENAI_API_KEY", "private-key");
  mocks.state = "ringing";
  mocks.updates.length = 0;
  mocks.db = { from: query, rpc: mocks.rpc };
  mocks.rpc.mockResolvedValue({
    data: { ok: true, id: "lease", deadline_at: "2026-10-26T18:05:00Z" },
    error: null,
  });
  mocks.command.mockImplementation(async (_db, _user, _id, action) => {
    if (action === "answer") mocks.state = "connecting";
    if (action === "connect") mocks.state = "connected";
    if (action === "fail") mocks.state = "failed";
  });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("cleans up both ledgers on HTTP 400 and emits only safe error fields without a second paid request", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: "unknown_parameter",
          param: "session.audio.input.turn_detection",
          message: "PRIVATE PROMPT",
        },
      }),
      { status: 400, headers: { "x-request-id": "req_safe" } },
    ),
  );
  await expect(start()).rejects.toThrow("parameter session.audio.input.turn_detection");
  expect(mocks.state).toBe("failed");
  expect(mocks.updates).toContainEqual(
    expect.objectContaining({
      state: "failed",
      close_reason: "http_400:unknown_parameter:session.audio.input.turn_detection",
    }),
  );
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE PROMPT|private-key|private-sdp/);
  log.mockRestore();
});
it("does not consume an incoming offer when reservation fails before claim", async () => {
  mocks.rpc.mockRejectedValue(new Error("reservation interrupted"));
  await expect(start()).rejects.toThrow("reservation interrupted");
  expect(mocks.state).toBe("ringing");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("marks malformed successful responses failed instead of leaving a reserved session", async () => {
  mocks.fetch.mockResolvedValue(new Response("not json", { status: 200 }));
  await expect(start()).rejects.toThrow("invalid response");
  expect(mocks.state).toBe("failed");
  expect(mocks.updates).toContainEqual(
    expect.objectContaining({ state: "failed", close_reason: "invalid_response" }),
  );
});

it("connects an explicitly answered offer with the existing saved voice", async () => {
  mocks.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        transport: { sdp: "accepted-answer-sdp" },
        session: { id: "live-session" },
      }),
      { status: 200 },
    ),
  );
  await expect(start()).resolves.toMatchObject({
    answered: true,
    callId: "lease",
    sdp: "accepted-answer-sdp",
  });
  expect(mocks.state).toBe("connected");
  const body = JSON.parse(mocks.fetch.mock.calls[0]![1].body as string);
  expect(body.session.audio.output.voice.id).toBe("voice_tess");
  expect(body.session.audio.input).toBeUndefined();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it("never tears down an already answered offer on a duplicate answer request", async () => {
  mocks.state = "connected";
  await expect(start()).rejects.toThrow("expired or was already answered");
  expect(mocks.state).toBe("connected");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("does not terminate another attempt's offer when the single-session lease is already held", async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: false, reason: "active" }, error: null });
  await expect(start()).rejects.toThrow("already on a call");
  expect(mocks.command).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.state).toBe("ringing");
});
