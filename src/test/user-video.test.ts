// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  videoFileError,
  videoSignatureMatches,
  userVideoMetadata,
  videoTranscriptText,
} from "@/lib/user-video";
const path = "10000000-0000-4000-a000-000000000001/20000000-0000-4000-a000-000000000001.mp4";
const metadata = { user_video: { path, mime: "video/mp4", bytes: 20, duration_seconds: 5 } };
describe("user video policy", () => {
  it("accepts bounded MP4/WebM and rejects unsupported, empty, oversized or long uploads", () => {
    expect(videoFileError({ type: "video/mp4", size: 20 }, 5)).toBeNull();
    expect(videoFileError({ type: "video/webm", size: 25_000_000 }, 60)).toBeNull();
    for (const f of [
      { type: "video/quicktime", size: 20 },
      { type: "image/jpeg", size: 20 },
      { type: "video/mp4", size: 0 },
      { type: "video/mp4", size: 25_000_001 },
    ])
      expect(videoFileError(f)).not.toBeNull();
    for (const duration of [0, 61, Infinity, NaN])
      expect(videoFileError({ type: "video/mp4", size: 20 }, duration)).not.toBeNull();
  });
  it("checks container signatures without claiming to verify codec or duration", () => {
    expect(
      videoSignatureMatches(
        new TextEncoder().encode("\u0000\u0000\u0000\u0018ftypisom0000"),
        "video/mp4",
      ),
    ).toBe(true);
    expect(videoSignatureMatches(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "video/webm")).toBe(
      true,
    );
    expect(
      videoSignatureMatches(new TextEncoder().encode("<script>bad</script>"), "video/mp4"),
    ).toBe(false);
    expect(
      videoSignatureMatches(
        new TextEncoder().encode("\u0000\u0000\u0000\u0018ftypqt  0000"),
        "video/mp4",
      ),
    ).toBe(false);
  });
  it("rejects malformed attachment paths while preserving photo metadata", () => {
    expect(userVideoMetadata(metadata)).toEqual(metadata.user_video);
    expect(
      userVideoMetadata({ user_video: { ...metadata.user_video, path: "../private.mp4" } }),
    ).toBeNull();
    expect(userVideoMetadata({ photo: "desk" })).toBeNull();
    expect(videoTranscriptText("Existing photo", { user_photo: "a.jpg" })).toBe("Existing photo");
  });
  it("clearly withholds video/audio perception and never injects a storage link into model context", () => {
    const text = videoTranscriptText("A clip from my walk", metadata);
    expect(text).toContain("A clip from my walk");
    expect(text).toContain("NOT been analyzed");
    expect(text).not.toContain(path);
  });
});
