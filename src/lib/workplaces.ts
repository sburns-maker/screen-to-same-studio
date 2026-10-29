import { CHARACTERS, type CharacterKey } from "./characters";
/** Real Altoona business names used in a fictional game. All employment, staff interactions and story events are invented; coordinates remain illustrative map anchors, not surveyed building entrances. */
export const WORKPLACES: Record<CharacterKey, {
  key: string; label: string; kind: "workplace"; community: string;
  latitude: number; longitude: number; description: string; opens: number; closes: number;
  character: CharacterKey; publicAccess: "lobby" | "by_invitation" | "restricted";
}> = {
  kendra: { key:"work:kendra",label:"Northlight Studio",kind:"workplace",community:"Altoona",latitude:40.512,longitude:-78.401,description:"Invented Altoona photography studio where Kendra often books fictional freelance shoots. Shoots are by invitation only; client work stays private.",opens:9,closes:18,character:"kendra",publicAccess:"by_invitation" },
  sienna: { key:"work:sienna",label:"Copper Lens Cocktail Bar",kind:"workplace",community:"Altoona",latitude:40.518,longitude:-78.405,description:"Invented Altoona cocktail bar where Sienna works as a bartender on her fictional second shift. Public customer area only; staff areas and private photography clients remain private.",opens:16,closes:24,character:"sienna",publicAccess:"lobby" },
  tess: { key:"work:tess",label:"Pleasant Valley Animal Hospital",kind:"workplace",community:"Altoona",latitude:40.5189,longitude:-78.3980,description:"Real Altoona veterinary practice used as a fictional scene. Reception is public; treatment areas and patient records are private.",opens:8,closes:18,character:"tess",publicAccess:"lobby" },
  maya: { key:"work:maya",label:"Blair County Convention Center",kind:"workplace",community:"Altoona",latitude:40.4572,longitude:-78.4003,description:"Real Altoona convention center used for Maya's fictional event-coordinator storyline. Visits depend on event schedules.",opens:10,closes:19,character:"maya",publicAccess:"by_invitation" },
  claire: { key:"work:claire",label:"Altoona Area Public Library",kind:"workplace",community:"Altoona",latitude:40.5233,longitude:-78.4058,description:"Real public library used for Claire's fictional librarian storyline; visitors must respect staff duties.",opens:7,closes:16,character:"claire",publicAccess:"lobby" },
  jordan: { key:"work:jordan",label:"The EADS Group",kind:"workplace",community:"Altoona",latitude:40.5206,longitude:-78.3975,description:"Real engineering firm used for a fictional storyline. Meet in reception only when Jordan confirms.",opens:8,closes:17,character:"jordan",publicAccess:"by_invitation" },
  ben: { key:"work:ben",label:"S.P. McCarl & Company",kind:"workplace",community:"Altoona",latitude:40.5142,longitude:-78.4102,description:"Real HVAC business used for a fictional storyline. Ben may be out at a job site; never visit active work sites without invitation.",opens:6,closes:16,character:"ben",publicAccess:"by_invitation" },
  riley: { key:"work:riley",label:"UPMC Altoona",kind:"workplace",community:"Altoona",latitude:40.5107,longitude:-78.3928,description:"Real hospital used for a fictional storyline. Restricted clinical area; only permitted public reception is visitable.",opens:0,closes:24,character:"riley",publicAccess:"restricted" },
};
export function workplaceFor(key: CharacterKey) { return WORKPLACES[key]; }
export function workplaceShiftLikely(key: CharacterKey, date: Date): boolean {
  const s = CHARACTERS[key].schedule;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.find(p=>p.type==="weekday")?.value ?? "");
  const hour = Number(parts.find(p=>p.type==="hour")?.value ?? -1);
  if (weekday < 0 || hour < 0) return false;
  if (s.workStart < s.workEnd) return s.workDays.includes(weekday) && hour >= s.workStart && hour < s.workEnd;
  if (hour >= s.workStart) return s.workDays.includes(weekday);
  return s.workDays.includes((weekday + 6) % 7) && hour < s.workEnd;
}
export function workVisitGuidance(key: CharacterKey, date: Date): string {
  const work=WORKPLACES[key],s=CHARACTERS[key].schedule;
  const onShift=workplaceShiftLikely(key, date);
  return `${CHARACTERS[key].preferredName}${key === "sienna" ? " works as the bartender" : " works"} at ${work.label} (${work.key}), a real Altoona-area venue used for fictional gameplay. None of these characters are real employees. Usual shift ${s.notes}. ${onShift?"Usual schedule suggests a shift, but this does not guarantee they are present or free.":"Not a typical work hour; do not assume they are present."} Access: ${work.publicAccess}. Public customer areas, including Copper Lens, allow ordinary walk-in activity without contacting the character; only conversation with the character depends on shift and availability. Characters decide whether to step away; never imply workplace access, private medical or library patron records, or instant availability.`;
}
