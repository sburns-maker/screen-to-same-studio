// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { brookeEveningReference } from "@/lib/brooke-reference-package.server";
import { uploadReferenceCandidate } from "@/lib/photo-reference-library.server";
import { canonicalProfile } from "@/lib/canonical-profile.server";
import { portraitHash } from "@/lib/profile-media.server";

function fakeUploadDb(owned = true) {
  const saved: Record<string, unknown>[] = [];
  const stored = vi.fn(async () => ({ error: null }));
  const filters: Record<string, unknown> = {};
  const db = {
    from: (name: string) => {
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        single: async () => ({ data: { id: "brooke-id" }, error: null }),
        maybeSingle: async () => ({ data: name === "conversations" ? (owned ? { id: "brooke-conv" } : null)
          : name === "photo_reference_uploads" ? saved.find(r => r['user_id'] === filters['user_id'] && r['content_sha256'] === filters['content_sha256']) ?? null : null, error: null }),
        insert: async (row: Record<string, unknown>) => { saved.push(row); return { error: null }; },
      }; return q;
    },
    storage: { getBucket: async () => ({ data: { public: false }, error: null }), from: () => ({ upload: stored }) },
  };
  return { db: db as never, saved, stored };
}
describe("Brooke owner reference package", () => {
  it("keeps the original evening bytes independent of the primary", async () => {
    const bytes = Buffer.from(brookeEveningReference(), "base64");
    expect(bytes.equals(readFileSync("src/assets/references/brooke/evening.jpg"))).toBe(true);
    expect(await portraitHash(bytes)).not.toBe((await canonicalProfile("brooke")).sha256);
  });
  it("registers only a private unapproved candidate, with an idempotent hash path", async () => {
    const { db, saved, stored } = fakeUploadDb();
    const user = "10000000-0000-4000-a000-000000000001";
    const first = await uploadReferenceCandidate(db, user, "brooke", brookeEveningReference(), "Evening");
    expect(await uploadReferenceCandidate(db, user, "brooke", brookeEveningReference(), "Evening")).toEqual(first);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.['character_key']).toBe("brooke");
    expect(saved[0]?.['asset']).toMatch(new RegExp(`^${user}/reference-uploads/brooke/[a-f0-9]{64}\\.jpg$`));
    expect(saved[0]?.['canonical_sha256']).toBe((await canonicalProfile("brooke")).sha256);
  });
  it("rejects the supplied 142×193 alternate rather than enlarging or approving it", async () => {
    const { db, saved, stored } = fakeUploadDb();
    const low = readFileSync("src/assets/references/brooke/alternate-low-resolution.jpg").toString("base64");
    await expect(uploadReferenceCandidate(db, "owner", "brooke", low, "Alternate")).rejects.toThrow("resolution");
    expect(saved).toHaveLength(0); expect(stored).not.toHaveBeenCalled();
  });
  it("requires an owned conversation before private upload", async () => {
    const { db, stored } = fakeUploadDb(false);
    await expect(uploadReferenceCandidate(db, "other-owner", "brooke", brookeEveningReference(), "Evening")).rejects.toThrow("Owned conversation");
    expect(stored).not.toHaveBeenCalled();
  });
});