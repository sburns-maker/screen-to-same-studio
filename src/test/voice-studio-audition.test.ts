import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUDITION_SCRIPT,
  assertAuditionAllowed,
  createStudioAudition,
} from "@/lib/voice-studio-audition";

const env = {
  ENABLE_VOICE_DESIGN: "true",
  ENABLE_VOICE_STUDIO_AUDITIONS: "true",
  OPENAI_API_KEY: "test-only",
};
describe("studio safety gates", () => {
  it("rejects a signed-in non-developer before provider work", () => {
    expect(() => assertAuditionAllowed(false, env)).toThrow("Developer access required");
  });
  it("requires both explicit feature flags", () => {
    expect(() => assertAuditionAllowed(true, { ...env, ENABLE_VOICE_DESIGN: "false" })).toThrow(
      "disabled",
    );
    expect(() =>
      assertAuditionAllowed(true, { ...env, ENABLE_VOICE_STUDIO_AUDITIONS: "false" }),
    ).toThrow("disabled");
  });
  it("cannot be enabled by a flag while server spending safeguards are absent", () => {
    expect(() => assertAuditionAllowed(true, env)).toThrow(
      "server-side duration, concurrency and spending",
    );
  });
});

function fixture() {
  const channel = {
    readyState: "open",
    send: vi.fn(),
    close: vi.fn(),
    onmessage: null as null | ((ev: { data: string }) => void),
    onclose: null,
    onerror: null,
  };
  const peer = {
    createDataChannel: () => channel,
    addTransceiver: vi.fn(),
    createOffer: vi.fn(async () => ({ sdp: "offer" })),
    setLocalDescription: vi.fn(async () => {}),
    localDescription: { sdp: "offer" },
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(),
    connectionState: "connected",
    ontrack: null as null | ((e: { track: object }) => void),
    onconnectionstatechange: null as null | (() => void),
  };
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      constructor() {
        return peer;
      }
    },
  );
  vi.stubGlobal("MediaStream", class {});
  const audio = {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    srcObject: null as object | null,
    paused: false,
    currentTime: 0,
    readyState: 4,
  };
  const onState = vi.fn();
  const onError = vi.fn();
  const connect = vi.fn(async () => ({ sdp: "answer" }));
  const session = createStudioAudition({
    audio: audio as unknown as HTMLAudioElement,
    connect,
    onState,
    onError,
  });
  const event = (type: string) => channel.onmessage?.({ data: JSON.stringify({ type }) });
  return { session, peer, channel, audio, onState, onError, connect, event };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("direct OpenAI audition lifecycle (mocked transport)", () => {
  it("only requests speech once after session.started, never on SDP alone", async () => {
    const f = fixture();
    expect(f.connect).not.toHaveBeenCalled();
    await f.session.start();
    expect(f.channel.send).not.toHaveBeenCalled();
    expect(f.onState).not.toHaveBeenCalledWith("playing");
    f.event("session.started");
    f.event("session.started");
    expect(f.channel.send).toHaveBeenCalledTimes(1);
    const command = f.channel.send.mock.calls[0]?.[0];
    if (typeof command !== "string") throw new Error("Missing audition command");
    expect(JSON.parse(command)).toMatchObject({
      type: "session.commentary.append",
      delegation_id: null,
      content: AUDITION_SCRIPT,
    });
    f.session.release();
  });
  it("reports playback only after mounted media time advances", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.session.start();
    f.peer.ontrack?.({ track: {} });
    await vi.advanceTimersByTimeAsync(250);
    expect(f.onState).not.toHaveBeenCalledWith("playing");
    f.audio.currentTime = 0.5;
    await vi.advanceTimersByTimeAsync(250);
    expect(f.onState).toHaveBeenCalledWith("playing");
    f.session.release();
  });
  it("silences immediately, sends session.close once and drains final closure", async () => {
    const f = fixture();
    await f.session.start();
    f.session.stop();
    f.session.stop();
    expect(f.audio.pause).toHaveBeenCalled();
    expect(f.audio.srcObject).toBeNull();
    expect(f.channel.send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ type: "session.close" }),
    );
    expect(f.peer.close).not.toHaveBeenCalled();
    f.event("session.closed");
    expect(f.peer.close).toHaveBeenCalledOnce();
  });
  it("stops locally at exactly 45 seconds without an automatic retry", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.session.start();
    f.event("session.started");
    await vi.advanceTimersByTimeAsync(44_999);
    expect(f.onState).not.toHaveBeenCalledWith("stopping");
    await vi.advanceTimersByTimeAsync(1);
    expect(f.onState).toHaveBeenCalledWith("stopping");
    expect(f.connect).toHaveBeenCalledTimes(1);
    f.event("session.closed");
  });
  it("ends a disconnected session and never creates a replacement", async () => {
    const f = fixture();
    await f.session.start();
    f.peer.connectionState = "disconnected";
    f.peer.onconnectionstatechange?.();
    expect(f.onError).toHaveBeenCalledWith(expect.stringContaining("connection lost"));
    expect(f.connect).toHaveBeenCalledTimes(1);
    f.event("session.closed");
  });
  it("does not apply a late SDP answer after Stop during startup", async () => {
    const f = fixture();
    let resolve: ((answer: { sdp: string }) => void) | undefined;
    f.connect.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const starting = f.session.start();
    await vi.waitFor(() => expect(f.connect).toHaveBeenCalledOnce());
    f.session.stop();
    resolve?.({ sdp: "late-answer" });
    await starting;
    expect(f.peer.setRemoteDescription).not.toHaveBeenCalled();
    f.event("session.closed");
  });
});
