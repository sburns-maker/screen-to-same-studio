import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/text-ai.server", () => ({ runStructured: model.run }));
import { generateTessReply, generateContactReply, CHARACTER_BIBLE } from "@/lib/tess.server";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { SEED_STATE, deriveStage } from "@/lib/tess-logic";
import { DIALOGUE_PROFILES } from "@/lib/dialogue-personality";
import { buildCallInstructions } from "@/lib/live-calls";
const args = {
  state: SEED_STATE,
  stage: deriveStage(SEED_STATE),
  difficulty: "realistic" as const,
  messages: [
    { sender: "tess", body: "Objection, your honor.", created_at: "2026-10-25T18:00Z" },
    { sender: "tess", body: "Exhibit A: the coffee.", created_at: "2026-10-25T18:01Z" },
    {
      sender: "user",
      body: "Please be serious. I had a rough day.",
      created_at: "2026-10-25T18:02Z",
    },
  ],
  memories: ["An established shared coffee preference"],
  tz: "America/New_York",
  photos: [],
  generateTypes: [],
  photoFrequency: "off",
  availabilityDetail: "At the confirmed current venue",
  worldKnowledge: ["Only this character's established knowledge"],
};
const makeReply = () => ({
  messages: ["That means a lot. Thank you for remembering."],
  state_delta: { trust: 1 },
  memory_candidates: [
    { summary: "An existing grounded detail", memory_type: "relationship", importance: 3 },
  ],
  schedule_actions: [],
  tone: "warm",
  event_tags: [],
  photo: null,
  send_delay_seconds: 4,
  character_perspective: "I noticed their thoughtfulness.",
  photo_boundary_decision: "unchanged",
});
beforeEach(() => model.run.mockReset().mockImplementation(async () => makeReply()));
describe("real character adapters share voice guidance without canned response replacement", () => {
  it.each(Object.keys(CHARACTERS) as CharacterKey[])(
    "keeps %s distinct, grounded, and able to acknowledge sincerity",
    async (key) => {
      const reply =
        key === "tess"
          ? await generateTessReply(args)
          : await generateContactReply({ ...args, character: CHARACTERS[key] });
      expect(model.run).toHaveBeenCalledTimes(1);
      const [, system, input] = model.run.mock.calls[0]!;
      expect(system).toContain(DIALOGUE_PROFILES[key].rhythm);
      expect(system).toContain("There is no required joke");
      expect(input).toContain("courtroom/legal comic routine");
      expect(input).toContain("rough day");
      expect(input).toContain(key === "tess" ? CHARACTER_BIBLE : CHARACTERS[key].bible);
      expect(input).toContain(args.memories[0]);
      expect(input).toContain(args.availabilityDetail);
      expect(reply.messages).toEqual(makeReply().messages);
      expect(reply.state_delta).toEqual(makeReply().state_delta);
      expect(reply.memory_candidates).toEqual(makeReply().memory_candidates);
      expect(reply.schedule_actions).toEqual([]);
      if (key === "ben")
        expect(system).toContain(
          "romantic_attraction and physical_attraction MUST stay at exactly 0",
        );
    },
  );
  it("also applies to autonomous initiation without interpreting an old user farewell as a new instruction", async () => {
    await generateContactReply({
      ...args,
      character: CHARACTERS.maya,
      messages: [{ sender: "user", body: "Goodnight", created_at: "2026-10-24T22:00Z" }],
      initiation: { gapHours: 20 },
      initiationReason: "An actual available world event",
    });
    const [, system, input, purpose] = model.run.mock.calls[0]!;
    expect(system).toContain(DIALOGUE_PROFILES.maya.humor);
    expect(input).not.toContain("This can end naturally");
    expect(purpose).toBe("autonomous");
  });
  it("preserves the in-person channel and original recorded scene instead of converting it to texting", async () => {
    const instruction =
      "IN PERSON: authoritative current scene at Riley's front door.\nEXPERIENCE HISTORY\nUSER-RECORDED-ACTION";
    await generateContactReply({
      ...args,
      character: CHARACTERS.riley,
      experience: { at: "2026-10-25T18:02Z", instruction },
    });
    const [, system, input] = model.run.mock.calls[0]!;
    expect(system).toContain(DIALOGUE_PROFILES.riley.openness);
    expect(system).toContain("In person, use the existing experience format");
    expect(system).not.toContain("USER-RECORDED-ACTION");
    expect(input).toContain(instruction);
  });
  it("keeps dialogue tendencies available in bounded live voice prompts without authorizing calendar writes", () => {
    const prompt = buildCallInstructions({
      characterKey: "jordan",
      fullName: CHARACTERS.jordan.fullName,
      preferredName: "Jordan",
      age: 33,
      pronouns: "she/her",
      bible: CHARACTERS.jordan.bible,
      stage: "acquaintance",
      availability: { availability: "free", detail: "at home" },
      localTime: "Sunday evening",
      memories: [],
      recent: args.messages,
    });
    expect(prompt).toContain(DIALOGUE_PROFILES.jordan.openness);
    expect(prompt).toContain("no write tool during this live call");
    expect(prompt).toContain("courtroom/legal comic routine");
    expect(prompt.length).toBeLessThanOrEqual(9000);
  });
});
