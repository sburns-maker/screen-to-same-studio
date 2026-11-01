import { describe, expect, it } from "vitest";
import { inPersonOutputRules, inPersonSystem } from "@/lib/in-person-output-rules";
import { SYSTEM_CORE } from "@/lib/tess.server";

describe("interactive experience channel separation", () => {
  it("replaces Tess SMS system instructions only for in-person scenes", () => {
    const system = inPersonSystem(SYSTEM_CORE);
    expect(system).toContain("Respond as Tess would naturally speak and act in person.");
    expect(system).not.toContain("Respond as Tess would naturally text.");
    expect(SYSTEM_CORE).toContain("Respond as Tess would naturally text.");
  });

  it("replaces other contacts' SMS instructions for the in-person channel", () => {
    const system = inPersonSystem("You are Riley, texting someone you know. Respond as Riley would naturally text.");
    expect(system).toContain("interacting with someone in person");
    expect(system).toContain("Respond as Riley would naturally speak and act in person.");
    expect(system).not.toContain("texting someone you know");
  });

  it("uses coherent acted scene guidance instead of SMS/photo rules", () => {
    const prompt = inPersonOutputRules("Tess", true);
    expect(prompt).toContain("ONE concise, coherent first-person in-person scene beat");
    expect(prompt).toContain("photo: null");
    expect(prompt).toContain("photo_boundary_decision: unchanged");
    expect(prompt).not.toContain("texts only, no quotes/narration");
    expect(prompt).not.toContain("mature_romantic");
    expect(prompt).not.toContain("photo framing");
    expect(prompt).toContain("Do not recycle the same reassuring phrase");
  });

  it("honors today's refusal without permanently blocking consensual adult choices", () => {
    const prompt = inPersonOutputRules("Tess", true);
    expect(prompt).toContain("maintain that broader boundary for the scene");
    expect(prompt).toContain("Keep the redirected hand where she chose");
    expect(prompt).toContain("Do not reinterpret a narrow redirect as this broader refusal");
    expect(prompt).toContain("BOTH adults independently choose them");
    expect(prompt).toContain("may transition non-graphically");
    expect(prompt).toContain("never fabricate that choice");
  });

  it("keeps a platonic contact's attraction dimensions unchanged", () => {
    const prompt = inPersonOutputRules("Ben", false);
    expect(prompt).toContain("romantic_attraction and physical_attraction MUST stay at exactly 0");
  });
});
