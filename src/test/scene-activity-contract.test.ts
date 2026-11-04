import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SCENE_ACTIVITIES } from "@/lib/experience-scene";

// The database rejects any live-scene activity it does not list; a mismatch
// freezes outings at scene sync (failure da008305: "sitting" was missing).
describe("scene activity contract", () => {
  it("every app scene activity is accepted by the database", () => {
    const sql = ["0039_experience_live_scene", "0045_residences_households", "0060_scene_activity_sitting", "0065_experience_scene_reconcile", "0068_scene_activity_private_moment"]
      .map((f) => readFileSync(`drizzle/migrations/${f}.sql`, "utf8")).join("\n");
    for (const a of SCENE_ACTIVITIES) expect(sql).toContain(`'${a}'`);
  });
  it("patches both existing SQL scene functions on upgrade", () => {
    const migration = readFileSync("drizzle/migrations/0068_scene_activity_private_moment.sql", "utf8");
    expect(migration).toContain("experience_scene_apply");
    expect(migration).toContain("experience_scene_reconcile");
    expect(migration).toContain("'private_moment'");
    expect(migration).toContain("to_regprocedure");
  });
});
