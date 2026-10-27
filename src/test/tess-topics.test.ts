import { describe, it, expect } from "vitest";
import { saturatedMotifs, excludedTopics, isOpenInvitation, topicGuidance } from "@/lib/tess-topics";

describe("tess topic guard", () => {
  it("flags repeated sock/trivia callbacks", () => {
    const lines = ["Mabel stole a sock again.", "Trivia queen says no.", "Sock bribes only.", "See you at trivia."];
    expect(saturatedMotifs(lines).sort()).toEqual(["mabel_socks", "trivia"]);
  });
  it("does not flag a single callback", () => {
    expect(saturatedMotifs(["Mabel took a sock.", "Work was long."])).toEqual([]);
  });
  it("detects explicit topic exclusion", () => {
    expect(excludedTopics("tell me something completely unrelated to trivia")).toEqual(["trivia"]);
    expect(excludedTopics("can we talk about something else")).toEqual(["__current__"]);
    expect(excludedTopics("haha trivia was fun")).toEqual([]);
  });
  it("recognizes invitations to personal disclosure", () => {
    expect(isOpenInvitation("What's been on your mind lately that you haven't told me about?")).toBe(true);
    expect(isOpenInvitation("lol nice")).toBe(false);
  });
  it("builds guidance for the reported failure case", () => {
    const g = topicGuidance(["Sock coup.", "Trivia gauntlet.", "Mabel's sock raids and trivia."], "tell me something unrelated to trivia. What's been on your mind lately?");
    expect(g).toContain("other than trivia");
    expect(g).toContain("Mabel stealing socks");
    expect(g).toContain("YOUR life");
  });
  it("adds nothing for ordinary turns so she can initiate freely", () => {
    expect(topicGuidance(["Long day at the clinic."], "how was work")).toBe("");
  });
});

describe("topic guard for other characters", () => {
  it("flags Maya's repeated chase line", () => {
    expect(saturatedMotifs(["Catching me is the real game.", "Keep up if you can.", "Lunch Friday?"], 8, 2, "maya")).toContain("chase");
  });
  it("flags Claire's validation loop", () => {
    expect(saturatedMotifs(["That's so valuable.", "Support is invaluable."], 8, 2, "claire")).toContain("validation");
  });
  it("respects explicit topic change for Jordan", () => {
    expect(excludedTopics("tell me something other than climbing", "jordan")).toEqual(["climbing"]);
  });
  it("flags Ben's ninja jokes and invites disclosure", () => {
    const g = topicGuidance(["kid ninja moves 😂", "shadow ninjas lol"], "what's new with you?", "ben");
    expect(g).toContain("kid ninja jokes");
    expect(g).toContain("YOUR life");
  });
  it("Tess motifs don't leak into other characters", () => {
    expect(saturatedMotifs(["sock", "socks again"], 8, 2, "maya")).toEqual([]);
  });
});

it.each(["espresso", "latte", "cappuccino", "americano", "macchiato", "cold brew"])("recognizes repeated %s as coffee across the whole cast", drink => {
  for (const key of ["tess", "maya", "riley", "claire", "jordan", "ben"]) {
    expect(saturatedMotifs([`Another ${drink}.`, "A coffee break."], 8, 2, key)).toContain("coffee");
  }
});
