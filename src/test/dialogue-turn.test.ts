import { describe, expect, it } from "vitest";
import { deliveryPatterns, nextTextDelivery, deliveryDiagnostic } from "@/lib/dialogue-turn";
const routine = ["Objection, your honor.", "Exhibit A is your coffee."];
describe("history-aware next text delivery", () => {
  it("spots structural repetition without copying messages or interpreting it as refusal", () => {
    const lines = [
      "Coffee — again. And you?",
      "Fine — tired. How about you?",
      "Home — finally. What's next?",
    ];
    expect(deliveryPatterns(lines)).toEqual([
      "frequent dash asides",
      "repeated final-question hook",
    ]);
    expect(deliveryPatterns(["What time?", "Seven."])).toEqual([]);
    const directive = nextTextDelivery("maya", lines, "Dinner Monday at 7?");
    expect(directive).toContain("exact plan readback");
    expect(directive).toContain(
      "Preserve meaningful punctuation, names, numbers, dates, questions, consent, refusals",
    );
    expect(directive).not.toContain(lines[0]);
  });
  it("reports when a new answer continues the courtroom loop, without logging private text", () => {
    const privateLine = "Case dismissed. SECRET-USER-DETAIL";
    const persisted = deliveryDiagnostic("maya", routine, [privateLine]);
    expect(persisted.continuedRoutines).toEqual(["courtroom/legal comic routine"]);
    expect(
      deliveryDiagnostic("maya", routine, ["I'm home. Just putting the groceries away."])
        .continuedRoutines,
    ).toEqual([]);
    expect(JSON.stringify(persisted)).not.toContain("SECRET-USER-DETAIL");
  });
  it("does not turn ordinary sincerity or a necessary repeated boundary into a canned replacement", () => {
    const line = "I don't want to share a photo. Please stop asking.";
    expect(deliveryPatterns([line, line, line])).toEqual([]);
    expect(nextTextDelivery("tess", [line, line, line], "Why not?")).toContain("repeated boundary");
    expect(nextTextDelivery("maya", routine, "Stop the courtroom jokes.")).toContain(
      "without teasing",
    );
    expect(nextTextDelivery("jordan", [], "Sounds good. Goodnight.")).toContain(
      "This can end naturally",
    );
  });
});
