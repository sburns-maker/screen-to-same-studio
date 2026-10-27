import { describe, expect, it } from "vitest";
import { verifiedHomePhotoCandidates } from "@/lib/home-photo-gallery";
const base = {
  id: "msg1", body: "Mabel claimed my couch again", created_at: "2026-10-26T20:00:00Z",
};
describe("private generated home photo provenance", () => {
  it("only accepts delivered home-origin photos of the selected character", () => {
    const valid = { ...base, metadata: {
      generated_path: "player/photos/abc.webp", photo_visual: { character: "tess", location: "home" },
    }};
    const unrelated = { ...base, id: "msg2", metadata: {
      generated_path: "player/photos/riley.webp", photo_visual: { character: "riley", location: "home" },
    }};
    const outside = { ...base, id: "msg3", metadata: {
      generated_path: "player/photos/park.webp", photo_visual: { character: "tess", location: "outdoors" },
    }};
    expect(verifiedHomePhotoCandidates([valid, unrelated, outside], "tess")).toHaveLength(1);
  });
  it("doesn't turn an old text or unsafe storage path into a photograph", () => {
    expect(verifiedHomePhotoCandidates([
      { ...base, metadata: null },
      { ...base, metadata: { generated_path: "../elsewhere", photo_visual: { character: "tess", location: "home" } } },
    ], "tess")).toEqual([]);
  });
  it("rejects absolute and query-like storage paths", () => {
    const make = (path: string) => ({
      ...base, metadata: {
        generated_path: path,
        photo_visual: { character: "tess", location: "home" },
      },
    });
    expect(verifiedHomePhotoCandidates([
      make("/player/photo.png"),
      make("player/photo.png?token=abc"),
      make("player/../photo.png"),
      make("player/photo.png"),
    ], "tess")).toHaveLength(1);
  });

});
