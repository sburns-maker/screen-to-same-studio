import { CHARACTERS, type CharacterKey } from "./characters";
/** Fictional employers and illustrative map pins, never real workplaces or geolocation. */
export const WORKPLACES: Record<CharacterKey, {
  key: string; label: string; kind: "workplace"; community: string;
  latitude: number; longitude: number; description: string; opens: number; closes: number;
  character: CharacterKey; publicAccess: "lobby" | "by_invitation" | "restricted";
}> = {
  tess: { key:"work:tess",label:"Pine Ridge Veterinary Clinic",kind:"workplace",community:"Altoona",latitude:40.5211,longitude:-78.4021,description:"Fictional veterinary practice. Reception is public; treatment areas and patient records are private.",opens:8,closes:18,character:"tess",publicAccess:"lobby" },
  maya: { key:"work:maya",label:"Juniper Events Studio",kind:"workplace",community:"Altoona",latitude:40.5176,longitude:-78.3991,description:"Fictional events-planning office and meeting studio. Visits depend on event schedules.",opens:10,closes:19,character:"maya",publicAccess:"by_invitation" },
  claire: { key:"work:claire",label:"Willow Creek School Library",kind:"workplace",community:"Altoona",latitude:40.5233,longitude:-78.4058,description:"Fictional school library. No public walk-in access during school hours; school safety rules apply.",opens:7,closes:16,character:"claire",publicAccess:"restricted" },
  jordan: { key:"work:jordan",label:"Allegheny Design & Engineering",kind:"workplace",community:"Altoona",latitude:40.5206,longitude:-78.3975,description:"Fictional engineering office. Meet in reception only when Jordan confirms.",opens:8,closes:17,character:"jordan",publicAccess:"by_invitation" },
  ben: { key:"work:ben",label:"Summit HVAC Services",kind:"workplace",community:"Altoona",latitude:40.5142,longitude:-78.4102,description:"Fictional HVAC shop. Ben may be out at a job site; never visit active work sites without invitation.",opens:6,closes:16,character:"ben",publicAccess:"by_invitation" },
  riley: { key:"work:riley",label:"Keystone Valley Medical Laboratory",kind:"workplace",community:"Altoona",latitude:40.5107,longitude:-78.3928,description:"Fictional hospital laboratory. Restricted clinical area; only permitted public reception is visitable.",opens:0,closes:24,character:"riley",publicAccess:"restricted" },
};
export function workplaceFor(key: CharacterKey) { return WORKPLACES[key]; }
export function workVisitGuidance(key: CharacterKey, date: Date): string {
  const work=WORKPLACES[key],s=CHARACTERS[key].schedule;
  const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",hourCycle:"h23"}).format(date));
  const day=new Date(date.toLocaleString("en-US",{timeZone:"America/New_York"})).getDay();
  const onShift=s.workDays.includes(day) && (s.workStart<s.workEnd ? hour>=s.workStart && hour<s.workEnd : hour>=s.workStart||hour<s.workEnd);
  return `${CHARACTERS[key].preferredName} works at ${work.label} (${work.key}), a fictional map destination. Usual shift ${s.notes}. ${onShift?"Usual schedule suggests a shift, but this does not guarantee they are present or free.":"Not a typical work hour; do not assume they are present."} Access: ${work.publicAccess}. User may ask or wait only in permitted visitor spaces. Characters decide whether to step away; never imply workplace access, patient/student/customer details, or instant availability.`;
}
