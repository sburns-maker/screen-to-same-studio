import { z } from "zod";

/** Additional lifecycle layer. Existing 12-hour pregnancy result/awareness rules are unchanged. */
export const PREGNANCY_REAL_DAYS = 60;
export const GESTATION_DAYS = 280;
export const CONCEPTION_GESTATIONAL_DAY = 14;
const DAY_MS = 86_400_000;

export const pregnancyChoiceSchema = z.enum(["undecided", "continue", "abortion", "adoption"]);
export const pregnancyLifecycleStatusSchema = z.enum([
  "pregnant", "ended_abortion", "ended_miscarriage", "ended_birth",
]);
export const pregnancyLifecycleSchema = z.object({
  id: z.string().uuid(),
  pregnancyEventId: z.string().uuid(),
  userId: z.string().uuid(),
  characterKey: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
  choice: pregnancyChoiceSchema,
  status: pregnancyLifecycleStatusSchema,
  choiceAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
});
export type PregnancyLifecycle = z.infer<typeof pregnancyLifecycleSchema>;
export type PregnancyChoice = z.infer<typeof pregnancyChoiceSchema>;

export function pregnancyProgress(startedAt: string, at: Date) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(at.getTime())) throw new Error("Invalid lifecycle timestamp");
  const elapsedRealDays = Math.max(0, (at.getTime() - start) / DAY_MS);
  const fraction = Math.min(1, elapsedRealDays / PREGNANCY_REAL_DAYS);
  const gestationalDay = Math.min(GESTATION_DAYS, CONCEPTION_GESTATIONAL_DAY +
    fraction * (GESTATION_DAYS - CONCEPTION_GESTATIONAL_DAY));
  const trimester = gestationalDay < 98 ? 1 : gestationalDay < 196 ? 2 : 3;
  return {
    elapsedRealDays, fraction, gestationalDay,
    gestationalWeek: Math.floor(gestationalDay / 7),
    trimester,
    dueAt: new Date(start + PREGNANCY_REAL_DAYS * DAY_MS).toISOString(),
    due: fraction === 1,
  };
}

export const pregnancyMilestones = [
  { key: "initial_visit", gestationalDay: 56, description: "Initial prenatal visit" },
  { key: "early_ultrasound", gestationalDay: 70, description: "Early ultrasound" },
  { key: "second_trimester", gestationalDay: 98, description: "Second trimester" },
  { key: "anatomy_scan", gestationalDay: 140, description: "Anatomy ultrasound" },
  { key: "third_trimester", gestationalDay: 196, description: "Third trimester" },
  { key: "birth_preparation", gestationalDay: 238, description: "Birth preparation" },
  { key: "term", gestationalDay: 259, description: "Term planning" },
] as const;

export function duePregnancyMilestones(startedAt: string, now: Date, completedKeys: readonly string[]) {
  const { gestationalDay } = pregnancyProgress(startedAt, now);
  const seen = new Set(completedKeys);
  return pregnancyMilestones.filter(m => m.gestationalDay <= gestationalDay && !seen.has(m.key));
}

/** Narrative choices aren't automatically made by a score or the player. */
export function canRecordPregnancyChoice(
  current: PregnancyChoice, next: PregnancyChoice, characterAuthorized: boolean,
) {
  return characterAuthorized && current !== next;
}
