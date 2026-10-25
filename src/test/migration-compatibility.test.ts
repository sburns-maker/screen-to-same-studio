// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const originals = {
  "0035_remove_experience_daily_cap":
    "a60e0114da2bab168a4387abb9a58ec376009f90455159531a13b8cdde0d1ed0",
  "0036_mutual_calendar_confirmation":
    "6f1d92e1c5be9efc10da9cf2006fe867d8bac609664466edda274aa089a79240",
  "0037_all_character_calendar_proposers":
    "bc640f79df71533c0ed5eeb4402bfccb7287a4d46ef2a4c2d37cccf7f689d5fb",
  "0038_canonical_scheduling": "959829fbb2124d83fc51ba4d1a6a79118f0f5b7f8e3f0e44e5156be5508e42ed",
};
describe("generated guarded migration compatibility", () => {
  it("preserves every original SQL payload byte-for-byte and keeps the historical ordering", () => {
    const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8"));
    for (const [tag, hash] of Object.entries(originals)) {
      const sql = readFileSync(`drizzle/migrations/${tag}.sql`, "utf8");
      const body = sql.split(`$original_${tag.slice(0, 4)}$`)[1]!;
      expect(createHash("sha256").update(body).digest("hex")).toBe(hash);
      expect(journal.entries.find((e: { tag: string }) => e.tag === tag).when).toBe(
        1792863300000 + Number(tag.slice(0, 4)) - 35,
      );
      expect(sql).not.toContain("INSERT INTO drizzle");
      expect(sql).toContain("No historical migration was skipped");
    }
  });
  it("regenerates deterministically from a single verifier and reviewed manifest", () => {
    expect(
      execFileSync(process.execPath, ["scripts/build-migration-compat.mjs", "--check"], {
        encoding: "utf8",
      }),
    ).toContain("verified");
  });
});
