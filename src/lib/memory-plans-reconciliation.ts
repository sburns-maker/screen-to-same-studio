import { easternInstant, resolveDate, resolveTime, type CalendarPlan } from "./calendar-logic";
import { venueFromText } from "./place-registry";

export type HistoricalMemory = { summary: string; created_at: string; conversation_id: string };
export type ProposedPlanRepair = {
  planId: string;
  source: string;
  date: string | null;
  time: string | null;
  place: string | null;
  outcome: "fill_missing" | "needs_review";
  reasons: string[];
};

/** Preview only: never write inferred dates or duplicate plans. */
export function previewMemoryPlanRepairs(memories: HistoricalMemory[], plans: CalendarPlan[]) {
  const proposed: ProposedPlanRepair[] = [];
  for (const plan of plans) {
    if (!plan.conversation_id || !["dinner", "coffee", "book_club", "meetup", "walk"].includes(plan.category)) continue;
    if (["cancelled", "declined", "missed", "completed"].includes(plan.status)) continue;
    const candidates = memories.filter(m => m.conversation_id === plan.conversation_id && /\b(?:confirmed|agreed|booked|scheduled|meeting there|it's a date)\b/i.test(m.summary) && !/\b(?:cancelled|called off|might|tentative|undecided|not confirmed)\b/i.test(m.summary));
    for (const memory of candidates) {
      const s = memory.summary;
      const kindMatches = plan.category === "dinner" ? /\b(?:dinner|restaurant)\b/i.test(s)
        : plan.category === "coffee" ? /\bcoffee\b/i.test(s)
        : plan.category === "book_club" ? /book club/i.test(s)
        : plan.category === "walk" ? /\bwalk\b/i.test(s)
        : /\b(?:meet|meetup|trivia)\b/i.test(s);
      if (!kindMatches) continue;
      const date = resolveDate(s, new Date(memory.created_at)) ?? null;
      const time = resolveTime(s) ?? null;
      const matches = venueFromText(s);
      const place = matches.length === 1 ? matches[0]!.key : null;
      if (!date && !time && !place) continue;
      const reasons: string[] = [];
      if (date && plan.date_local && date !== plan.date_local) reasons.push("Date conflicts with current plan");
      if (time && plan.time_local && time !== plan.time_local) reasons.push("Time conflicts with current plan");
      if (place && plan.place_key && place !== plan.place_key) reasons.push("Venue conflicts with current plan");
      if (date && time && !easternInstant(date, time)) reasons.push("Invalid or ambiguous local time");
      const outcome = reasons.length ? "needs_review" : "fill_missing";
      if (outcome === "fill_missing" && (!date || plan.date_local) && (!time || plan.time_local) && (!place || plan.place_key)) continue;
      proposed.push({ planId: plan.id, source: s, date, time, place, outcome, reasons });
    }
  }
  // Do not automatically resolve conflicting memories into one edit.
  const byPlan = new Map<string, ProposedPlanRepair[]>();
  for (const p of proposed) byPlan.set(p.planId, [...(byPlan.get(p.planId) ?? []), p]);
  return proposed.map(p => {
    const siblings = byPlan.get(p.planId)!;
    const distinct = (field: "date" | "time" | "place") => new Set(siblings.map(x => x[field]).filter(Boolean)).size > 1;
    return distinct("date") || distinct("time") || distinct("place")
      ? { ...p, outcome: "needs_review" as const, reasons: [...p.reasons, "Multiple memories disagree"] }
      : p;
  });
}
