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


/**
 * An explicit persisted milestone ledger is the source of narrative history.
 * A due milestone is a discussion opportunity, NEVER a completed clinical test.
 */
export type PregnancyMilestoneRecord = {
 key:string; dueAt:string; completedAt:string|null;
};
export function pregnancyMilestoneSnapshot(
 records:readonly PregnancyMilestoneRecord[], now:Date,
): {due:PregnancyMilestoneRecord[];upcoming:PregnancyMilestoneRecord|null;completed:PregnancyMilestoneRecord[]} {
 const clock=now.getTime();
 if (!Number.isFinite(clock)) throw new Error("Invalid milestone clock");
 const valid=records.filter(m=>Number.isFinite(Date.parse(m.dueAt)));
 const pending=valid.filter(m=>m.completedAt===null).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
 return {
  due:pending.filter(m=>Date.parse(m.dueAt)<=clock),
  upcoming:pending.find(m=>Date.parse(m.dueAt)>clock)??null,
  completed:valid.filter(m=>m.completedAt!==null).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)),
 };
}

/** The last completed visit is historical; a new proposal must not erase it. */
export function pregnancyAppointmentSnapshot(
 appointments:readonly RecordedPregnancyAppointment[], now:Date,
) {
 const active=appointments.filter(a=>a.status!=="cancelled");
 const completed=active.filter(a=>a.status==="completed");
 const scheduled=active.filter(a=>a.status==="scheduled" && Date.parse(a.at)>now.getTime());
 const proposed=active.filter(a=>a.status==="proposed");
 return {lastCompleted:completed.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]??null,
  nextScheduled:scheduled.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0]??null,
  nextProposed:proposed.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0]??null,
  overdueScheduled:active.filter(a=>a.status==="scheduled" && Date.parse(a.at)<=now.getTime())};
}

/** A narrative checkpoint is a due reminder, not proof that any medical
 * appointment was booked or completed. It is based only on canonical weeks and
 * the persisted appointment ledger. */
export type RecordedPregnancyAppointment = {
 kind:string; at:string; status:"proposed"|"scheduled"|"completed"|"cancelled";
};
export function pregnancyNextCheckpoint(
 gestationalWeek:number,
 appointments:readonly RecordedPregnancyAppointment[],
): {stage:string; nextStep:string; visitState:"none"|"proposed"|"scheduled"|"completed"} {
 const valid = appointments.filter(a=>a.status!=="cancelled");
 const completed = valid.filter(a=>a.status==="completed");
 const upcoming = valid.filter(a=>a.status==="scheduled");
 const proposals = valid.filter(a=>a.status==="proposed");
 const visitState = upcoming.length ? "scheduled" : proposals.length ? "proposed" :
  completed.length ? "completed" : "none";
 if (gestationalWeek < 8) return {stage:"early pregnancy", visitState,
  nextStep:"Discuss initial care preferences and a specific first-visit plan; no visit is presumed."};
 if (gestationalWeek < 14) return {stage:"first trimester", visitState,
  nextStep:"Discuss initial prenatal contact, practical needs or an early scan if wanted and not already done."};
 if (gestationalWeek < 20) return {stage:"second trimester", visitState,
  nextStep:"Discuss day-to-day changes and plans for the upcoming anatomy scan, without assuming a result."};
 if (gestationalWeek < 28) return {stage:"mid-pregnancy", visitState,
  nextStep:"Discuss the anatomy scan if its result is recorded, or making a plan if it is not."};
 if (gestationalWeek < 36) return {stage:"third trimester", visitState,
  nextStep:"Discuss prenatal follow-up, birth preferences and practical household support."};
 return {stage:"late pregnancy", visitState,
  nextStep:"Discuss birth planning and arrangements, without inferring labor or childbirth."};
}
