import { ICELAND_WINTER_IDEAS } from "./travel-milestones";
export type TravelMode = "road_trip" | "flight" | "rail" | "local";
export type TravelPurpose = "vacation" | "work" | "family" | "adventure";
export type TripStatus = "idea" | "proposed" | "accepted" | "in_progress" | "completed" | "cancelled";
export type TripCompanion = { characterKey: string; response: "invited" | "accepted" | "declined" };
export type TripPlan = {
 id: string; title: string; origin: string; destination: string; mode: TravelMode; purpose: TravelPurpose;
 startDate: string | null; endDate: string | null; status: TripStatus; companions: TripCompanion[];
 itinerary: TripStop[]; notes: string[];
};
export type TripStop = { id: string; day: number; label: string; location: string; kind: "travel"|"activity"|"lodging"|"meal"|"work"|"rest"; completed: boolean };
const date = (s:string|null)=>s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+"T12:00:00Z"));
export function validateTrip(p:TripPlan):string[]{
 const errors:string[]=[];
 if(!p.destination.trim()||!p.origin.trim())errors.push("Origin and destination required");
 if(p.startDate && !date(p.startDate))errors.push("Invalid start date");
 if(p.endDate && !date(p.endDate))errors.push("Invalid end date");
 if(p.startDate && p.endDate && p.endDate < p.startDate)errors.push("End date precedes start date");
 if(["accepted","in_progress","completed"].includes(p.status)){
  if(!p.startDate||!p.endDate)errors.push("Confirmed trip requires dates");
  if(p.companions.some(c=>c.response==="invited"))errors.push("Invitations cannot be presented as companion acceptance");
 }
 if(p.status==="completed" && p.itinerary.some(s=>!s.completed))errors.push("Trip cannot be marked completed with unfinished stops");
 return errors;
}
export function addCompanion(p:TripPlan,key:string):TripPlan{
 if(p.companions.some(c=>c.characterKey===key))return p;
 return {...p,companions:[...p.companions,{characterKey:key,response:"invited"}]};
}
export function respondCompanion(p:TripPlan,key:string,reply:"accepted"|"declined"):TripPlan{
 if(!p.companions.some(c=>c.characterKey===key))throw new Error("Character was not invited");
 return {...p,companions:p.companions.map(c=>c.characterKey===key?{...c,response:reply}:c)};
}
export function acceptTrip(p:TripPlan):TripPlan {
 const candidate={...p,status:"accepted" as const};
 const errors=validateTrip(candidate);
 if(errors.length)throw new Error(errors.join("; "));
 return candidate;
}
export function icelandTripIdea(origin="Altoona, PA"):TripPlan{
 return {id:"tess-iceland-winter",title:"Iceland in winter",origin,destination:"Iceland",mode:"flight",purpose:"vacation",
 startDate:null,endDate:null,status:"idea",companions:[],notes:["Tess has dreamed of visiting Iceland in winter for years.","A work-learning visit could be considered separately; no tickets or reservations are implied."],
 itinerary:ICELAND_WINTER_IDEAS.map((label,i)=>({id:"iceland-"+i,day:i<2?1:i<4?2:3,label,location:"Iceland",kind:i===0?"travel":i===5?"rest":"activity",completed:false}))};
}
export function tripScenePrompt(p:TripPlan,day:number):string{
 if(p.status!=="in_progress")throw new Error("Trip has not started");
 const stops=p.itinerary.filter(s=>s.day===day);
 return "FICTIONAL TRAVEL EXPERIENCE: "+p.title+"; destination "+p.destination+"; transport "+p.mode+"; purpose "+p.purpose+
 ". Companions present only if accepted: "+p.companions.filter(c=>c.response==="accepted").map(c=>c.characterKey).join(", ")+
 ". Planned moments: "+stops.map(s=>s.label).join("; ")+
 ". Play the scene interactively with weather, transportation, activities, relationships, ordinary setbacks and independent companion choices. Never claim real bookings, payments, attendance or user consent; only complete actual recorded steps.";
}
