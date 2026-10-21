import { describe, expect, it } from "vitest";
import { CHARACTER_BIBLE, SYSTEM_CORE, TESS_TZ } from "@/lib/tess.server";

describe("tess name canon", () => {
  it("legal name is Jessica Morgan, everyday name is Tess", () => {
    expect(CHARACTER_BIBLE).toContain("Jessica Morgan");
    expect(CHARACTER_BIBLE).toContain("calls her Tess");
  });

  it("records the toddler nickname origin", () => {
    expect(CHARACTER_BIBLE).toMatch(/couldn't pronounce "Jess"/);
    expect(CHARACTER_BIBLE).toMatch(/came out "Tess"/);
  });

  it("forbids inventing a different legal name", () => {
    expect(SYSTEM_CORE).toContain("Jessica Morgan");
    expect(SYSTEM_CORE).toMatch(/not Theresa, not Tessa, not Contessa/);
  });

  it("does not volunteer the Jessica story", () => {
    expect(SYSTEM_CORE).toMatch(/Do not volunteer the Jessica story/);
  });

  it("treats the user learning her legal name as shared memory", () => {
    expect(SYSTEM_CORE).toMatch(/save that as a shared memory/);
  });

  it("her mother Denise is the one who says Jessica", () => {
    expect(CHARACTER_BIBLE).toMatch(/Denise is the person most likely to call her Jessica/);
  });
});

describe("tess timezone", () => {
  it("runs on Eastern time to match the 16602 weather anchor", () => {
    expect(TESS_TZ).toBe("America/New_York");
  });
});
