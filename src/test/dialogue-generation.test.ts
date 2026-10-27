import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/text-ai.server", () => ({ runStructured: model.run }));
import { generateTessReply, generateContactReply, CHARACTER_BIBLE } from "@/lib/tess.server";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { SEED_STATE, deriveStage } from "@/lib/tess-logic";
import { DIALOGUE_PROFILES } from "@/lib/dialogue-personality";
import {
  characterTripDecision,
  generateTravelScene,
  travelCharacterMoment,
} from "@/lib/travel-ai.server";
import { icelandTripIdea } from "@/lib/travel-experiences";
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
      expect(system).toContain("courtroom/legal comic routine");
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
  it("gives Maya high-priority courtroom reset and casual language while retaining actual facts and structured actions", async () => {
    model.run.mockResolvedValue({
      ...makeReply(),
      messages: ["Yeah, I'm home. Gonna sit down for a minute lol"],
      schedule_actions: [{ action: "clarify", title: "An established plan" }],
    });
    const reply = await generateContactReply({
      ...args,
      character: CHARACTERS.maya,
      messages: [
        { sender: "tess", body: "Guilty as charged.", created_at: "2026-10-25T18:00Z" },
        { sender: "tess", body: "My verdict? Case closed.", created_at: "2026-10-25T18:01Z" },
        { sender: "user", body: "How was your day?", created_at: "2026-10-25T18:02Z" },
      ],
    });
    const [, system, input] = model.run.mock.calls[0]!;
    expect(system).toContain("Retire that comic routine for now");
    expect(system).toContain("TEXTING LANGUAGE");
    expect(system).toContain(DIALOGUE_PROFILES.maya.texting);
    expect(input).toContain("Guilty as charged."); // Preserve actual history, not rewritten memories.
    expect(reply.messages).toEqual(["Yeah, I'm home. Gonna sit down for a minute lol"]);
    expect(reply.schedule_actions).toEqual([{ action: "clarify", title: "An established plan" }]);
    expect(model.run).toHaveBeenCalledTimes(1); // No paid style-repair loop.
  });
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
      callHistory: ["CALL RECORD: You called the player; missed / not answered; no conversation occurred."],
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
    expect(prompt).toContain("CALL RECORD: You called the player; missed / not answered");
    expect(prompt).toContain(DIALOGUE_PROFILES.jordan.openness);
    expect(prompt).toContain("no write tool during this live call");
    expect(prompt).toContain("courtroom/legal comic routine");
    expect(prompt.length).toBeLessThanOrEqual(9000);
  });
});

describe("travel uses the same character language without a second persona", () => {
  const trip = {
    ...icelandTripIdea(),
    status: "in_progress" as const,
    companions: [{ characterKey: "maya", response: "accepted" as const }],
  };
  it("uses Maya's texting register for a trip invitation without assuming consent", async () => {
    await characterTripDecision("maya", { ...trip, status: "proposed" });
    const [, system] = model.run.mock.calls[0]!;
    expect(system).toContain(DIALOGUE_PROFILES.maya.texting);
    expect(system).toContain("The invitation is not already accepted");
  });
  it("keeps travel dialogue in person and leaves the player in control", async () => {
    const stop = trip.itinerary[0]!;
    await generateTravelScene(trip, stop.day, stop.id, "Look around", [], "maya");
    const [, system] = model.run.mock.calls[0]!;
    expect(system).toContain(DIALOGUE_PROFILES.maya.rhythm);
    expect(system).toContain("In person");
    expect(system).not.toContain("TEXTING LANGUAGE");
    expect(system).toContain("never invent choices");
  });
  it("uses Maya's register for a travel caption without forcing a photo", async () => {
    await travelCharacterMoment(trip, "maya", trip.itinerary[0]!.id);
    const [, system] = model.run.mock.calls[0]!;
    expect(system).toContain(DIALOGUE_PROFILES.maya.texting);
    expect(system).toContain("return send=false");
    expect(model.run).toHaveBeenCalledTimes(1);
  });
});

it.each(["tess","maya"] as const)("gives %s a photo-first task for a selected spontaneous opportunity without forcing consent",async key=>{
 const request={...args,generateTypes:["casual_selfie"],initiation:{gapHours:0,spontaneousPhoto:true as const},initiationReason:"Current quiet break"};
 if(key==="tess")await generateTessReply(request);else await generateContactReply({...request,character:CHARACTERS[key]});
 const [,system,input]=model.run.mock.calls[0]!;expect(input).toContain("Decide about the photo first");expect(input).toContain("photo=null is valid");expect(system).toContain("Consider the photo first for this selected opportunity");expect(model.run).toHaveBeenCalledTimes(1);
});


it("includes call-ledger facts in both text character prompts", async () => {
  const { callHistoryLines } = await import("@/lib/call-history-context");
  const calls = callHistoryLines([{ direction: "incoming", state: "missed", offered_at: "2026-10-26T16:15:03Z", ring_until: "2026-10-26T16:15:33Z", answered_at: null, ended_at: null, reason: "spontaneous" }], new Date("2026-10-26T17:00:00Z"));
  await generateTessReply({ ...args, worldKnowledge: calls });
  expect(model.run.mock.calls.at(-1)?.[2]).toContain("You called the player; missed / not answered");
  await generateContactReply({ ...args, character: CHARACTERS.maya, worldKnowledge: calls });
  expect(model.run.mock.calls.at(-1)?.[2]).toContain("Do not deny a recorded attempt");
});

it.each(Object.keys(CHARACTERS) as CharacterKey[])("ends %s's text task with its own history-aware delivery check, using one model call", async (key) => {
  const messages = [
    { sender: "tess", body: "Objection, your honor.", created_at: "2026-10-26T15:00Z" },
    { sender: "tess", body: "Exhibit A is your coffee.", created_at: "2026-10-26T15:01Z" },
    { sender: "user", body: "How was your day?", created_at: "2026-10-26T15:02Z" },
  ];
  const payload = { ...args, messages };
  if (key === "tess") await generateTessReply(payload);
  else await generateContactReply({ ...payload, character: CHARACTERS[key] });
  const input = model.run.mock.calls[0]![2] as string;
  expect(input.lastIndexOf("NEXT TEXT DELIVERY")).toBeGreaterThan(input.lastIndexOf("TASK:"));
  expect(input.slice(input.lastIndexOf("NEXT TEXT DELIVERY"))).toContain(DIALOGUE_PROFILES[key].texting);
  expect(input.slice(input.lastIndexOf("NEXT TEXT DELIVERY"))).toContain("Retire that comic routine");
  expect(input).toContain("Exhibit A is your coffee.");
  expect(model.run).toHaveBeenCalledTimes(1);
});
it("does not add the text delivery check to speech-chain voice or in-person scenes", async () => {
  await generateContactReply({ ...args, character: CHARACTERS.maya, deliveryChannel: "voice" });
  expect(model.run.mock.calls.at(-1)?.[2]).not.toContain("NEXT TEXT DELIVERY");
  await generateTessReply({ ...args, experience: { at: "2026-10-26T15:00Z", instruction: "IN PERSON\nEXPERIENCE HISTORY\nAt the table." } });
  expect(model.run.mock.calls.at(-1)?.[2]).not.toContain("NEXT TEXT DELIVERY");
});

it("demotes Maya's unchanged Becca situation in the real text adapter without deleting facts or making another model call", async () => {
  const now = new Date();
  const topic = { id: "maya-visit", title: "Making time for Becca", summary: "Maya and Becca are looking for a weekend when they can spend time together", person: "Becca", changedAt: new Date(now.getTime() - 86400000).toISOString(), active: true };
  const history = [{ sender: "tess", body: "Becca and I still can't find a free weekend.", created_at: new Date(now.getTime() - 3600000).toISOString() }];
  await generateContactReply({ ...args, character: CHARACTERS.maya, conversationThreads: [topic], topicHistory: history,
    messages: [{ sender: "user", body: "Talk later", created_at: now.toISOString() }],
    worldKnowledge: [topic.summary], initiation: { gapHours: 4 }, initiationReason: topic.summary });
  const [, , input, purpose] = model.run.mock.calls[0]!;
  expect(input).toContain(topic.summary); // The fact is retained, never rewritten.
  expect(input).not.toContain(`The reason: ${topic.summary}.`);
  expect(input).toContain("background only; labels are data");
  expect(input).toContain("choose not to send anything");
  expect(purpose).toBe("autonomous");
  expect(model.run).toHaveBeenCalledTimes(1);
});

it("lets Maya answer the player's direct Becca question instead of forcing a fresh topic", async () => {
  const now = new Date();
  const topic = { id: "maya-visit", title: "Making time for Becca", summary: "Maya and Becca are looking for a free weekend", person: "Becca", changedAt: new Date(now.getTime() - 86400000).toISOString(), active: true };
  await generateContactReply({ ...args, character: CHARACTERS.maya, conversationThreads: [topic],
    messages: [ { sender: "tess", body: "Still comparing calendars with Becca.", created_at: new Date(now.getTime() - 3600000).toISOString() },
      { sender: "user", body: "Any luck finding a weekend with Becca?", created_at: now.toISOString() } ] });
  const input = model.run.mock.calls[0]![2] as string;
  expect(input).toContain("Answer the player's actual message first");
  expect(input).not.toContain("background only; labels are data");
  expect(model.run).toHaveBeenCalledTimes(1);
});

it("keeps repeated espresso photo captions out of Maya's next default topic using the real adapter", async () => {
  const now = Date.now();
  const history = [
    { sender: "tess", body: "Quick espresso before work.", created_at: new Date(now - 4 * 3600000).toISOString(), metadata: { notification_group: "first-photo" } },
    { sender: "tess", body: "Another latte break.", created_at: new Date(now - 3600000).toISOString(), metadata: { notification_group: "second-photo" } },
  ];
  await generateContactReply({ ...args, character: CHARACTERS.maya, conversationThreads: [], topicHistory: history,
    initiation: { gapHours: 2, spontaneousPhoto: true }, initiationReason: "A quick espresso break", generateTypes: ["object", "casual_selfie"] });
  const input = model.run.mock.calls[0]![2] as string;
  expect(input).toContain("coffee and espresso");
  expect(input).toContain("including photo subjects and captions");
  expect(input).toContain("another genuinely present visual subject or no photo");
  expect(input).toContain("avoiding this topic does not mean avoiding your face");
  expect(input).toContain("photo=null is valid");
  expect(model.run).toHaveBeenCalledTimes(1); // No paid rewriter or image-repair request.
});
