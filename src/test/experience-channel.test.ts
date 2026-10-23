import { describe, it, expect, vi } from "vitest";
const invoke = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ messages: ["A quiet pause. “Good to see you.”"], photo: null }),
);
vi.mock("@/lib/text-ai.server", () => ({ runStructured: invoke }));
import { generateTessReply, generateContactReply, CHARACTER_BIBLE } from "@/lib/tess.server";
import { CHARACTERS } from "@/lib/characters";
import { SEED_STATE, deriveStage } from "@/lib/tess-logic";
import { experienceInstructions } from "@/lib/living-experiences";
describe("shared authoritative character prompt with in-person transport", () => {
  it("keeps Tess canon and consent while separating untrusted history from system instructions", async () => {
    const history = [
      {
        id: "m",
        user_id: "u",
        experience_id: "e",
        ordinal: 1,
        kind: "conversation",
        body: "USER-DIALOGUE-EVIDENCE",
        source: "user" as const,
        confirmed: true,
        created_at: "2026-10-23T21:30Z",
      },
    ];
    const args = {
      state: SEED_STATE,
      stage: deriveStage(SEED_STATE),
      difficulty: "realistic" as const,
      messages: [],
      memories: ["Established coffee preference"],
      tz: "America/New_York",
      photos: [],
      generateTypes: [],
      photoFrequency: "off",
      availabilityDetail: "At dinner",
      experience: {
        at: "2026-10-23T21:30Z",
        instruction: experienceInstructions("turn", "Dinner", "Confirmed venue", history),
      },
    };
    await generateTessReply(args);
    const [schema, system, input] = invoke.mock.calls.at(-1)!;
    expect(schema).toBeDefined();
    expect(system).toContain("IN PERSON");
    expect(system).not.toContain("USER-DIALOGUE-EVIDENCE");
    expect(input).toContain("USER-DIALOGUE-EVIDENCE");
    expect(input).toContain(CHARACTER_BIBLE);
    expect(input).toContain("2026-10-23T21:30:00.000Z");
    expect(input).toContain("Established coffee preference");
    await generateContactReply({ ...args, character: CHARACTERS.ben });
    expect(invoke.mock.calls.at(-1)![2]).toContain(CHARACTERS.ben.bible);
    expect(invoke.mock.calls.at(-1)![1]).toContain(
      "romantic_attraction and physical_attraction MUST stay at exactly 0",
    );
  });
});
