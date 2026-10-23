import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeWave, waveSeconds } from "@/lib/phone-audio";
import { PhoneAudio } from "@/lib/phone-browser";
import { voiceConfiguration } from "@/lib/voice-provider.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("microphone privacy and audio bounds", () => {
  it("validates actual PCM duration rather than a client duration claim", () => {
    const b = encodeWave(
      Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * 0.2),
      48000,
    );
    expect(waveSeconds(b)).toBe(1);
    const bad = b.slice();
    new DataView(bad.buffer).setUint32(24, 48000, true);
    expect(() => waveSeconds(bad)).toThrow("Unsupported");
    expect(() => waveSeconds(new Uint8Array(500000))).toThrow();
    expect(() => waveSeconds(encodeWave(new Float32Array(16000), 16000))).toThrow("No speech");
  });
  it("does not acquire microphone resources merely by opening the call UI", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    new PhoneAudio();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it("fails permission denial without keeping a microphone", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
    vi.stubGlobal("MediaRecorder", class {});
    const a = new PhoneAudio();
    await expect(a.open()).rejects.toThrow("Permission denied");
    expect(a.stream).toBeNull();
  });
  it("stops tracks even if permission resolves after hangup", async () => {
    const stop = vi.fn();
    let resolve!: (s: MediaStream) => void;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => new Promise<MediaStream>((r) => (resolve = r)) },
    });
    vi.stubGlobal("MediaRecorder", class {});
    const a = new PhoneAudio(),
      pending = a.open();
    a.close();
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await expect(pending).rejects.toThrow("Call ended");
    expect(stop).toHaveBeenCalledOnce();
  });
  it("releases tracks, playback, context and object URLs immediately on hangup", () => {
    const stop = vi.fn(),
      pause = vi.fn(),
      close = vi.fn().mockResolvedValue(undefined),
      revoke = vi.fn();
    vi.stubGlobal("URL", { revokeObjectURL: revoke });
    const a = new PhoneAudio();
    a.stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    a.audio = { pause, onended: () => {}, src: "blob:x" } as unknown as HTMLAudioElement;
    a.url = "blob:x";
    a.context = { close } as unknown as AudioContext;
    a.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    expect(a.stream).toBeNull();
  });
  it("is disabled unless a provider and spending reservations were explicitly validated", () => {
    vi.stubEnv("ENABLE_VOICE_CALLS", "false");
    expect(voiceConfiguration().ready).toBe(false);
  });
});
