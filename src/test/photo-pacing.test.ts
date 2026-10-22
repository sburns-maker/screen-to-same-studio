import { describe, it, expect } from "vitest";
import { photoPacing, visualCue, directPhotoRequest } from "@/lib/photo-pacing";
const base = {
  character: "tess" as const,
  frequency: "normal" as const,
  now: new Date("2026-10-22T16:00:00Z"),
  lastPhotoAt: "2026-10-22T15:45:00Z",
  ownSinceLastPhoto: 1,
  userText: "Can you send a photo of Mabel?",
  context: "An ordinary quiet moment",
};
describe("contextual photo pacing", () => {
  it("allows a direct contextual request without twelve filler messages or an hour wait", () => {
    expect(photoPacing({ ...base, ownSinceLastPhoto: 0 }).allowed).toBe(true);
  });
  it("keeps a short minimum gap against repeated paid requests", () => {
    expect(photoPacing({ ...base, lastPhotoAt: "2026-10-22T15:59:00Z" }).allowed).toBe(false);
  });
  it("relaxes visually relevant conversation while keeping character differences", () => {
    expect(photoPacing({ ...base, userText: "How is the garden looking?" }).allowed).toBe(true);
    expect(
      photoPacing({ ...base, character: "jordan", userText: "How is the garden looking?" }).allowed,
    ).toBe(false);
  });
  it("does not treat romance scores or ordinary chatter as a visual request", () => {
    expect(visualCue("I adore you")).toBe(false);
    expect(directPhotoRequest("Can you send a photo?")).toBe(true);
    expect(photoPacing({ ...base, userText: "Hello again" }).allowed).toBe(false);
  });
});
