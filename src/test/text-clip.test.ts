import { describe, expect, it } from "vitest";
import { clipText, wellFormedJson } from "@/lib/text-clip";

const isWellFormed = (s: string) => s.isWellFormed();

describe("emoji-safe clipping", () => {
  it("drops a half emoji at the 300-character boundary instead of splitting it", () => {
    const text = "a".repeat(299) + "❤️😊" + "more";
    // "❤️" is 2 units, so put a surrogate-pair emoji exactly across 300.
    const tricky = "a".repeat(299) + "😊rest";
    const out = clipText(tricky, 300);
    expect(out).toBe("a".repeat(299));
    expect(isWellFormed(out)).toBe(true);
    expect(isWellFormed(clipText(text, 300))).toBe(true);
  });

  it("keeps short text unchanged", () => {
    expect(clipText("hi 😊", 300)).toBe("hi 😊");
  });

  it("repairs lone surrogates anywhere in a saved reply plan", () => {
    const broken = { rows: [{ body: "ok \ud83d" }], summary: "x\ud83d" };
    const fixed = wellFormedJson(broken);
    expect(isWellFormed(fixed.rows[0]!.body)).toBe(true);
    expect(isWellFormed(fixed.summary)).toBe(true);
    expect(JSON.parse(JSON.stringify(fixed))).toEqual(fixed);
  });
});
