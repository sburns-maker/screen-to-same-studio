import { describe, expect, it } from "vitest";
import { callHistoryLines, type CallHistoryFact } from "@/lib/call-history-context";
const now = new Date("2026-10-26T17:00:00Z");
const fact = (patch: Partial<CallHistoryFact> = {}): CallHistoryFact => ({
  direction: "incoming",
  state: "missed",
  offered_at: "2026-10-26T16:15:03Z",
  ring_until: "2026-10-26T16:15:33Z",
  answered_at: null,
  ended_at: "2026-10-26T16:15:33Z",
  reason: "spontaneous",
  ...patch,
});
describe("factual phone continuity", () => {
  it("preserves Maya's actual missed attempt and forbids invented shared dialogue or ringing", () => {
    const context = callHistoryLines([fact()], now).join("\n");
    expect(context).toContain("12:15:03 PM Eastern");
    expect(context).toContain(
      "You called the player; missed / not answered; no conversation occurred",
    );
    expect(context).toContain("Do not deny a recorded attempt");
    expect(context).toContain("Never invent its purpose, audible ringing, voicemail");
  });
  it("distinguishes user callbacks, declined calls and answered calls", () => {
    const lines = callHistoryLines(
      [
        fact({ direction: "outgoing", state: "declined" }),
        fact({
          state: "ended",
          answered_at: "2026-10-26T16:15:10Z",
          ended_at: "2026-10-26T16:20:00Z",
        }),
      ],
      now,
    ).join("\n");
    expect(lines).toContain("The player called you; declined / not answered");
    expect(lines).toContain("You called the player; answered; call ended");
    expect(lines).toContain("Topics are known only from retained call memories");
  });
  it("excludes developer test rings, future and stale records", () => {
    expect(
      callHistoryLines(
        [
          fact({ reason: "Developer-forced GPT-Live test ring (not character-initiated)" }),
          fact({ reason: "Developer-triggered test ring (not character-initiated)" }),
          fact({ offered_at: "2026-10-27T16:15:03Z" }),
          fact({ offered_at: "2026-10-01T16:15:03Z" }),
        ],
        now,
      ),
    ).toEqual([]);
  });
  it("resolves expired offers without mutating records and bounds recent context", () => {
    const row = fact({ state: "ringing" });
    expect(callHistoryLines([row], now).join(" ")).toContain("missed / not answered");
    expect(row.state).toBe("ringing");
    expect(
      callHistoryLines(
        Array.from({ length: 20 }, () => row),
        now,
      ),
    ).toHaveLength(9);
  });
});

it("does not turn a history lookup failure into a denial of calling", async () => {
  const { recentCallContext } = await import("@/lib/call-history-context.server");
  const context = await recentCallContext(
    {
      from: () => {
        throw new Error("private diagnostic");
      },
    } as never,
    "owner",
    "conversation",
    "maya",
    now,
  );
  expect(context.join(" ")).toContain("Do not assert that you did not call");
  expect(context.join(" ")).not.toContain("private diagnostic");
});
