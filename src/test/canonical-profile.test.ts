// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalProfile, jpegDimensions } from "@/lib/canonical-profile.server";
import { PROFILE_PORTRAITS } from "@/lib/character-portraits";
import { CHARACTERS } from "@/lib/characters";
describe("authoritative profile bytes", () => {
  it.each(["tess", "maya", "claire", "jordan", "ben"] as const)(
    "%s reference is byte-for-byte the existing displayed portrait",
    async (key) => {
      const reference = await canonicalProfile(key);
      expect(new Uint8Array(await reference.blob.arrayBuffer())).toEqual(
        new Uint8Array(readFileSync(PROFILE_PORTRAITS[key].asset)),
      );
      expect(CHARACTERS[key].avatar).toBe(PROFILE_PORTRAITS[key].avatar);
      expect(reference.width).toBeGreaterThanOrEqual(256);
    },
  );
  it("different characters have different immutable anchors", async () => {
    const refs = await Promise.all(
      (["tess", "maya", "claire", "jordan", "ben"] as const).map((key) =>
        canonicalProfile(key),
      ),
    );
    expect(new Set(refs.map((r) => r.sha256)).size).toBe(5);
    expect(await canonicalProfile("maya")).toMatchObject({ sha256: refs[1]!.sha256 });
  });
  it("fails safely for unknown, missing or malformed references", async () => {
    await expect(canonicalProfile("unknown" as "maya")).rejects.toThrow("not registered");
    await expect(canonicalProfile("riley")).rejects.toThrow("JPEG is malformed");
    expect(() => jpegDimensions(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
