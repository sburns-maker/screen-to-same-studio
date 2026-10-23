import { describe, expect, it } from "vitest";
import { pickSampleMime, sampleExtension, sampleFilename, sampleVerdict } from "@/lib/voice-sample-recorder";

describe("voice sample recorder", () => {
  it("prefers WebM/Opus, falls back to MP4/AAC", () => {
    expect(pickSampleMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickSampleMime((t) => t.startsWith("audio/mp4"))).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pickSampleMime(() => false)).toBeNull();
    expect(sampleExtension("audio/mp4")).toBe("m4a");
    expect(sampleExtension("audio/webm;codecs=opus")).toBe("webm");
  });
  it("names files with character, candidate and timestamp", () => {
    expect(
      sampleFilename("tess", "Tess — Refined (natural)", new Date("2026-10-23T19:52:01.123Z"), "audio/webm"),
    ).toBe("tess_tess-refined-natural_2026-10-23T19-52-01Z.webm");
  });
  it("flags empty and silent recordings", () => {
    expect(sampleVerdict({ size: 0, audible: true })).toBe("empty");
    expect(sampleVerdict({ size: 500, audible: false })).toBe("silent");
    expect(sampleVerdict({ size: 500, audible: true })).toBe("ok");
  });
});
