import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ oscillators: [] as { stop: ReturnType<typeof vi.fn> }[] }));
import { enableRingtone, disableRingtone, startRingtone } from "@/lib/call-ringtone";
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.oscillators.length = 0;
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator() {
        const o = {
          frequency: { value: 0 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        mocks.oscillators.push(o);
        return o;
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("local incoming ringtone", () => {
  it("requires opt-in, stops on hangup, and stops automatically at the ring deadline", async () => {
    const until = new Date(Date.now() + 6000).toISOString();
    await expect(startRingtone(until)).rejects.toThrow("Sound is off");
    await enableRingtone();
    const stop = await startRingtone(until);
    expect(mocks.oscillators).toHaveLength(2);
    stop();
    vi.advanceTimersByTime(3000);
    expect(mocks.oscillators).toHaveLength(2);
    expect(mocks.oscillators.every((o) => o.stop.mock.calls.length >= 2)).toBe(true);
    await startRingtone(until);
    vi.advanceTimersByTime(10000);
    const n = mocks.oscillators.length;
    vi.advanceTimersByTime(10000);
    expect(mocks.oscillators).toHaveLength(n);
    disableRingtone();
    await expect(startRingtone(new Date(Date.now() + 1000).toISOString())).rejects.toThrow(
      "Sound is off",
    );
  });
  it("never rings expired or invalid offers", async () => {
    await startRingtone("invalid");
    await startRingtone(new Date(Date.now() - 1000).toISOString());
    expect(mocks.oscillators).toHaveLength(0);
  });
});
