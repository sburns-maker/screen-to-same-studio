import { describe, expect, it } from "vitest";
import { previewMemoryPlanRepairs } from "@/lib/memory-plans-reconciliation";
import type { CalendarPlan } from "@/lib/calendar-logic";

const plan = { id: "dinner-plan", conversation_id: "tess-conv", category: "dinner", status: "awaiting_details", date_local: null, time_local: null, place_key: null } as CalendarPlan;
const memory = { conversation_id: "tess-conv", created_at: "2026-10-21T14:00:00Z", summary: "Confirmed their first dinner date at Fanelli's Italian Villa for Friday, October 23, 2026 at 5:30 PM; meeting there." };
describe("memory to plans preview", () => {
  it("recovers the established dinner date and time without changing data", () => {
    const original = structuredClone(plan);
    const r = previewMemoryPlanRepairs([memory], [plan]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ planId: "dinner-plan", date: "2026-10-23", time: "17:30", outcome: "fill_missing" });
    expect(plan).toEqual(original);
  });
  it("does not treat undecided plans as confirmed", () => {
    expect(previewMemoryPlanRepairs([{ ...memory, summary: "Tess chose Fanelli's for dinner; day and time still undecided." }], [plan])).toEqual([]);
  });
  it("does not create proposals for unrelated conversations or completed plans", () => {
    expect(previewMemoryPlanRepairs([memory], [{ ...plan, conversation_id: "someone-else" }])).toEqual([]);
    expect(previewMemoryPlanRepairs([memory], [{ ...plan, status: "completed" }])).toEqual([]);
  });
  it("flags differences with already recorded calendar fields for review", () => {
    const r = previewMemoryPlanRepairs([memory], [{ ...plan, time_local: "19:00" }]);
    expect(r[0]).toMatchObject({ outcome: "needs_review" });
  });
});
