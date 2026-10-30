import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SEED_STATE } from "@/lib/tess-logic";
import { mindSummary } from "@/lib/character-mind-insights";
import { characterPrivateRomanticOutlook } from "@/lib/romantic-outlook";
import { clairePrivateRomanticOutlook } from "@/lib/claire-romantic-arc";

const claire = {
  ...SEED_STATE, comfort: 97, trust: 76, emotional_intimacy: 69,
  romantic_attraction: 51, romantic_intent: 25, perceived_pressure: 2, irritation: 0,
};

describe("Mind shows only actually authored character perspectives as thoughts", () => {
  it("does not manufacture first-person inner thoughts from numbers", () => {
    const summary = mindSummary(claire, "Mutual romantic curiosity", "claire").notes.join(" ");
    expect(summary).toContain("only a saved, generated character reflection");
    expect(summary).not.toContain("Possible private thought:");
    expect(summary).not.toContain("Maybe there could be more");
  });

  it("builds freely generated dialogue guidance, not static sample thoughts", () => {
    const messages = [{ sender: "tess", body: "I meant that as friends." }];
    const outlook = clairePrivateRomanticOutlook(claire, messages, []);
    expect(outlook).toContain("independently generated perspective");
    expect(outlook).not.toContain("Maybe there could be more here someday?");
    const jordan = characterPrivateRomanticOutlook("jordan",
      { ...claire, romantic_attraction: 55 }, "Mutual romantic curiosity", [], []);
    expect(jordan).toContain("inviting him climbing");
    expect(jordan).not.toContain("A possible private sentiment");
    const prompt = readFileSync("src/lib/tess.server.ts", "utf8");
    expect(prompt).toContain("freshly authored, private fictional first-person reflection");
    expect(prompt).toContain("not commentary about the relationship scores");
  });

  it("reads the latest persisted reflection for only the current user and conversation", () => {
    const backend = readFileSync("src/lib/tess.functions.ts", "utf8");
    const start = backend.indexOf("const reflectionResult = await");
    const end = backend.indexOf("const { getWeatherContext }", start);
    const segment = backend.slice(start, end);
    expect(segment).toContain('from("relationship_evaluations"');
    expect(segment).toContain('.eq("user_id", userId).eq("conversation_id", conv.id)');
    expect(segment).toContain('.not("character_perspective", "is", null)');
    expect(segment).toContain('order("evaluated_at", { ascending: false })');
    expect(segment).toContain('const mindReflection = latestReflection');
    expect(segment).not.toContain("generateText(");
  });

  it("separates actual Mind text from score-based hints and never displays an example fallback", () => {
    const ui = readFileSync("src/routes/_authenticated/debug.$conversationId.tsx", "utf8");
    expect(ui).toContain("Latest generated inner reflection");
    expect(ui).toContain("snap.mindReflection.text");
    expect(ui).toContain("snap.mindReflection.generatedAt");
    expect(ui).toContain("No character-generated reflection has been saved");
    expect(ui).toContain("Score-based interpretation · not generated inner speech");

    const history = readFileSync("src/components/RelationshipHistoryPanel.tsx", "utf8");
    expect(history).toContain("const [showPerspective,setShowPerspective]=useState(true)");
    expect(history).not.toContain("Fallback interpretation from recorded score changes");
    expect(history).toContain("No first-person reflection was saved");
    expect(history).not.toContain("I'm taking this connection one conversation at a time.");
  });
});
