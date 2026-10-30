import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { zonedInstant } from "@/lib/calendar-time";
import {
  futureConversationPlans, futurePlanChronologyContext, futurePlanCompletionClaim,
} from "@/lib/future-plan-chronology";

const before = new Date("2026-10-30T15:09:00Z"); // Friday 11:09 AM EDT
const sundayPlan = "YOUR CONVERSATION PLAN 123: A walk to remember; accepted; date 2026-11-01, time 13:30 America/New_York; parent none; venue Canal Green; user accepted, you accepted; missing []; conflicts []; followthrough []";
const oldPlan = "RESOLVED CANONICAL PLAN 456: Another walk; status completed; 2026-10-25T17:30:00Z; attendance attended.";

describe("future canonical plan chronology", () => {
  it("recognizes the forthcoming Sunday walk across the end of daylight-saving time", () => {
    expect(zonedInstant("2026-11-01", "13:30", "America/New_York")).toBe("2026-11-01T18:30:00.000Z");
    const plans = futureConversationPlans([oldPlan, sundayPlan], before);
    expect(plans).toEqual([{
      title: "A walk to remember", date: "2026-11-01", time: "13:30",
      zone: "America/New_York", weekday: "Sunday", event: "walk",
    }]);
    const guidance = futurePlanChronologyContext([sundayPlan], before).join("\n");
    expect(guidance).toContain("Friday, October 30, 2026");
    expect(guidance).toContain("FUTURE, NOT YET ATTENDED: A walk to remember");
    expect(guidance).toContain("Sunday, 2026-11-01 at 13:30");
    expect(guidance).toContain("has NOT occurred");
  });

  it("rejects Tess's exact impossible dialogue before it can become a memory", () => {
    const plans = futureConversationPlans([sundayPlan], before);
    expect(futurePlanCompletionClaim(
      "We did get that walk in Sunday, and I liked holding your hand again too. Mabel's leaf inspections were thorough.", plans,
    )?.title).toBe("A walk to remember");
    expect(futurePlanCompletionClaim(
      "I loved our walk on Sunday, Mabel had a great time.", plans,
    )).not.toBeNull();
  });

  it("allows future-tense anticipation and a separate previous Sunday's walk", () => {
    const plans = futureConversationPlans([sundayPlan], before);
    for (const reply of [
      "I can't wait for our walk on Sunday. Mabel will be in charge of the leaves.",
      "Sunday at 1:30 sounds perfect. I want to hold your hand again.",
      "We did get that walk in last Sunday. I'm looking forward to another one.",
      "We had a walk last Sunday, and this Sunday will be even better.",
      "We had fun on our previous walk, and I'm looking forward to Sunday.",
    ]) expect(futurePlanCompletionClaim(reply, plans)).toBeNull();
  });

  it("does not invent a future plan for declined or completed plans or for an elapsed start", () => {
    const declined = sundayPlan.replace("; accepted;", "; declined;");
    const completed = sundayPlan.replace("; accepted;", "; completed;");
    expect(futureConversationPlans([declined, completed, oldPlan], before)).toEqual([]);
    expect(futureConversationPlans([sundayPlan], new Date("2026-11-01T19:00:00Z"))).toEqual([]);
    expect(futurePlanCompletionClaim("We had our walk Sunday.", [])).toBeNull();
  });

  it("uses a specific future activity, not any past-tense story", () => {
    const plans = futureConversationPlans([sundayPlan], before);
    expect(futurePlanCompletionClaim("We had coffee Sunday.", plans)).toBeNull();
    expect(futurePlanCompletionClaim("Last Sunday was a great day to hike.", plans)).toBeNull();
    expect(futurePlanCompletionClaim("We walked together on Friday.", plans)).toBeNull();
  });

  it("is hooked up before reply persistence and has a bounded retry", () => {
    const source = readFileSync("src/lib/tess.functions.ts", "utf8");
    expect(source).toContain("futurePlanChronologyContext(calendarLines, now)");
    expect(source).toContain("futurePlanCompletionClaim(reply.messages.join");
    expect(source).toContain("reply = await generateReply([");
    expect(source).toContain("no message or memories saved");
    expect(source.indexOf("const impossiblePlan = futurePlanCompletionClaim")).toBeLessThan(source.indexOf("const scheduleActions = await"));
    expect(source.indexOf("const impossiblePlan = futurePlanCompletionClaim")).toBeLessThan(source.indexOf("const delta = sanitizeDelta"));
  });
});