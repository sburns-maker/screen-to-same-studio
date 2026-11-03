import { describe, expect, it } from "vitest";
import { experienceClock } from "@/lib/living-experiences";

const experience = { start_at: "2026-11-02T21:15:00.000Z" } as Parameters<typeof experienceClock>[0];
const moment = (body: string, source: "user" | "character" = "user") => ({ source, body }) as Parameters<typeof experienceClock>[1][number];

describe("off-screen fade experience clock", () => {
  it("advances fictional time once for a recorded player fade, not a character's words", () => {
    const normal = new Date(experienceClock(experience, [moment("We enter the bedroom.")])).getTime();
    const faded = new Date(experienceClock(experience, [moment("We enter the bedroom."), moment("Fade to black.")])).getTime();
    expect(faded - normal).toBe(34 * 60000);
    const narrativeOnly = new Date(experienceClock(experience, [moment("We enter the bedroom."), moment("Fade to black.", "character")])).getTime();
    expect(narrativeOnly).toBe(normal);
  });
  it("never infers additional time from a vague romantic or recollection line", () => {
    expect(experienceClock(experience, [moment("We kiss goodnight.")])).toBe("2026-11-02T21:19:00.000Z");
  });
});