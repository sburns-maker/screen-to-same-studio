import { describe, expect, it } from "vitest";
import {
  observedPregnancyDisclosureStatus,
  matchesVisiblePregnancyDisclosure,
  sharedPregnancyDisclosureContext,
  validPregnancyDisclosure,
} from "./family-pregnancy-disclosure";

describe("fictional pregnancy disclosure continuity", () => {
  it("recognizes a direct positive announcement even when it follows a doctor update", () => {
    expect(observedPregnancyDisclosureStatus(
      "Not yet. I did get a positive result, though. I’m pregnant. I wanted to tell you directly.",
    )).toBe("positive");
    expect(observedPregnancyDisclosureStatus(
      "I got a positive pregnancy test this morning.",
    )).toBe("positive");
  });
  it("recognizes negative results but does not mistake uncertainty or a third party for disclosure", () => {
    expect(observedPregnancyDisclosureStatus("I'm not pregnant. My pregnancy test was negative.")).toBe("negative");
    expect(observedPregnancyDisclosureStatus("My pregnancy test came back negative.")).toBe("negative");
    expect(observedPregnancyDisclosureStatus("What if I'm pregnant?")).toBeNull();
    expect(observedPregnancyDisclosureStatus("I think I might be pregnant.")).toBeNull();
    expect(observedPregnancyDisclosureStatus("Did the doctor call yet?")).toBeNull();
    expect(observedPregnancyDisclosureStatus("My friend told me she's pregnant.")).toBeNull();
  });
  it("uses only character-authored prior messages, not the player's claim", () => {
    const playerOnly = [
      {sender:"user",body:"You told me this morning you are pregnant"},
      {sender:"tess",body:"I am still waiting to hear from the doctor"},
    ];
    expect(sharedPregnancyDisclosureContext(playerOnly)).toBeNull();
    const shared = [...playerOnly,{sender:"tess",body:"I'm pregnant and wanted to tell you personally"}];
    expect(sharedPregnancyDisclosureContext(shared)).toContain("He already knows");
    expect(sharedPregnancyDisclosureContext(shared)).toContain("not proof of a canonical pregnancy");
  });
  it("reconciles only an already-due, visible result with a unique canonical event", () => {
    const event = {id:"00000000-0000-4000-8000-000000000001",status:"positive" as const,revealAt:"2026-11-03T08:00:00Z"};
    const message = {body:"I'm pregnant and wanted to tell you directly",metadata:null,visibleAt:"2026-11-03T09:00:00Z"};
    expect(matchesVisiblePregnancyDisclosure({...message,event,soleDueEvent:true})).toBe(true);
    expect(matchesVisiblePregnancyDisclosure({...message,event,soleDueEvent:false})).toBe(false);
    expect(matchesVisiblePregnancyDisclosure({...message,event,soleDueEvent:true,visibleAt:"2026-11-03T07:00:00Z"})).toBe(false);
    expect(matchesVisiblePregnancyDisclosure({...message,event,soleDueEvent:true,visibleAt:null})).toBe(false);
    expect(matchesVisiblePregnancyDisclosure({...message,event:{...event,status:"negative"},soleDueEvent:true})).toBe(false);
    expect(matchesVisiblePregnancyDisclosure({...message,metadata:{pregnancy_disclosure_action:{
      eventId:"00000000-0000-4000-8000-000000000002",quote:"I'm pregnant",
    }},event,soleDueEvent:true})).toBe(false);
    expect(matchesVisiblePregnancyDisclosure({...message,metadata:{pregnancy_disclosure_action:{
      eventId:event.id,quote:"I'm pregnant",
    }},event,soleDueEvent:true})).toBe(true);
    expect(matchesVisiblePregnancyDisclosure({...message,metadata:{pregnancy_disclosure_action:{
      eventId:"bad-id",quote:"I'm pregnant",
    }},event,soleDueEvent:true})).toBe(false);
  });
  it("does not transform dialogue alone into a canonical event id", () => {
    expect(validPregnancyDisclosure(null, "I'm pregnant", [], "positive")).toBe(false);
  });
});
