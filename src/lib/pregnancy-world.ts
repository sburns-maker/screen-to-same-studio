import { pregnancyProgress, pregnancySymptomOptions, postpartumProgress } from "./pregnancy-lifecycle";

export type PregnancyNarrativeContext = {
 gestationalWeek:number; trimester:number; dueAt:string; possibleSymptoms:readonly string[];
};
export function pregnancyNarrativeContext(startedAt:string,now:Date):PregnancyNarrativeContext {
 const progress=pregnancyProgress(startedAt,now);
 return {gestationalWeek:progress.gestationalWeek,trimester:progress.trimester,
  dueAt:progress.dueAt,possibleSymptoms:pregnancySymptomOptions(progress.gestationalWeek)};
}
/** Postpartum changes are suggestions for ordinary life schedules, never a forced
 * character personality rewrite or an automatic abandonment of work.
 */
export function postpartumRoutineHints(bornAt:string,now:Date):readonly string[] {
 const p=postpartumProgress(bornAt,now);
 if(p.stage==="newborn") return ["recovery","newborn feeding and sleep","support planning"];
 if(p.stage==="infant") return ["caregiver rest","pediatric visits","childcare planning"];
 if(p.stage==="toddler") return ["mobile child safety","play time","care schedules"];
 return ["school and childcare planning","family routines"];
}
export const pregnancyMedicalTimeline=[
 {kind:"confirmation",gestationalWeek:8},
 {kind:"ultrasound",gestationalWeek:12},
 {kind:"anatomy_ultrasound",gestationalWeek:20},
 {kind:"prenatal",gestationalWeek:28},
 {kind:"prenatal",gestationalWeek:36},
] as const;
export function suggestedMedicalMilestones(startedAt:string,now:Date) {
 const week=pregnancyProgress(startedAt,now).gestationalWeek;
 return pregnancyMedicalTimeline.filter(m=>m.gestationalWeek<=week);
}
