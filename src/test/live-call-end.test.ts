import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  saved: false,
  persist: vi.fn(),
  close: vi.fn(),
  model: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const c = { middleware: () => c, inputValidator: () => c, handler: (fn: unknown) => fn };
    return c;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/live-call-transcript.server", () => ({ persistLiveCallTranscript: mocks.persist }));
vi.mock("@/lib/text-ai.server", () => ({ runStructured: mocks.model }));
vi.mock("@/lib/live-calls.server", () => ({
  closeLiveCall: mocks.close,
  liveCalls: () => {
    let update = false;
    const q = {
      select: () => (update ? Promise.resolve({ data: [{ id: "call" }] }) : q),
      eq: () => q,
      update: () => {
        update = true;
        mocks.claim();
        return q;
      },
      maybeSingle: async () => ({
        data: {
          id: "call",
          state: "active",
          conversation_id: "conversation",
          character_key: "claire",
          summary_saved: mocks.saved,
        },
      }),
    };
    return q;
  },
}));
import { endLiveCall } from "@/lib/live-calls.functions";
const end = endLiveCall as unknown as (v: unknown) => Promise<{ saved: boolean }>;
const transcript = [
  { role: "user", text: "We discussed my question." },
  { role: "character", text: "I remember that question." },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.saved = false;
  mocks.persist.mockResolvedValue({ saved: 2 });
  mocks.model.mockResolvedValue({ worth_saving: false, summary: "", importance: 1 });
});
it("persists captured speech before optional summary inference", async () => {
  await end({ context: { userId: "owner", supabase: {} }, data: { callId: "call", transcript } });
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.persist).toHaveBeenCalledWith({}, "owner", "call", transcript, true);
  expect(mocks.persist.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.model.mock.invocationCallOrder[0]!,
  );
});
it("still saves dialogue when a prior summary attempt was claimed", async () => {
  mocks.saved = true;
  await end({ context: { userId: "owner", supabase: {} }, data: { callId: "call", transcript } });
  expect(mocks.persist).toHaveBeenCalledOnce();
  expect(mocks.model).not.toHaveBeenCalled();
});
it("saves character-only dialogue without buying a summary", async () => {
  await end({
    context: { userId: "owner", supabase: {} },
    data: { callId: "call", transcript: [transcript[1]] },
  });
  expect(mocks.persist).toHaveBeenCalledOnce();
  expect(mocks.model).not.toHaveBeenCalled();
});
it("keeps the call closed and reports a failed save before attempting a summary", async () => {
  mocks.persist.mockRejectedValue(new Error("Call transcript save failed"));
  await expect(
    end({ context: { userId: "owner", supabase: {} }, data: { callId: "call", transcript } }),
  ).rejects.toThrow("Call transcript save failed");
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.claim).not.toHaveBeenCalled();
});
