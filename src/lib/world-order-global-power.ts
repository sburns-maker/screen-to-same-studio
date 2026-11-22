/**
 * Nation-to-nation sandbox simulation. All officials and events are invented
 * characters in an alternate-history world, never representations of real
 * diplomatic communication. No tactical operational details are simulated.
 */
export const FOREIGN_LEADERS = {
  "United States": { name:"President Alexandra Reed", office:"President", city:"Washington", key:"PresidentReed" },
  "United Kingdom": { name:"Prime Minister Oliver Grant", office:"Prime Minister", city:"London", key:"PrimeMinisterGrant" },
  "Canada": { name:"Prime Minister Camille Laurent", office:"Prime Minister", city:"Ottawa", key:"PrimeMinisterLaurent" },
  "Brazil": { name:"President Mariana Costa", office:"President", city:"Brasília", key:"PresidentCosta" },
  "France": { name:"President Émile Moreau", office:"President", city:"Paris", key:"PresidentMoreau" },
  "Mexico": { name:"President Isabel Navarro", office:"President", city:"Mexico City", key:"PresidentNavarro" },
} as const;
export type ForeignCountry=keyof typeof FOREIGN_LEADERS;
export type DiplomaticMode="contact"|"summit"|"trade"|"treaty"|"pressure";
export type DefenseMode="readiness"|"training"|"modernize"|"mobilize"|"standdown";
export type GrandStrategy="private"|"disclosed";
export type ForeignRelation={trust:number;trade:number;status:"neutral"|"dialogue"|"partner"|"tense";visits:number};
export type GlobalPower={
  strategy:GrandStrategy; defense:number; capacity:number; legitimacy:number;
  relations:Record<ForeignCountry,ForeignRelation>;
  completedActions:string[]; lastEvent:string;
};
const countries=Object.keys(FOREIGN_LEADERS) as ForeignCountry[];
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
export function newGlobalPower():GlobalPower{
 return {strategy:"private",defense:12,capacity:8,legitimacy:50,
 relations:Object.fromEntries(countries.map(x=>[x,{trust:35,trade:0,status:"neutral",visits:0}])) as GlobalPower["relations"],
 completedActions:[],lastEvent:""};
}
export function restoreGlobalPower(raw:unknown):GlobalPower{
 const base=newGlobalPower();
 if(!raw||typeof raw!=="object")return base;
 const r=raw as Partial<GlobalPower>;
 const entries=Object.fromEntries(countries.map(c=>{
   const v=r.relations?.[c];
   return [c,v?{trust:clamp(Number(v.trust)||0),trade:clamp(Number(v.trade)||0),
     status:["neutral","dialogue","partner","tense"].includes(v.status)?v.status:"neutral",
     visits:Number.isInteger(v.visits)&&v.visits>=0?Math.min(v.visits,1000):0}:base.relations[c]];
 })) as GlobalPower["relations"];
 return {strategy:r.strategy==="disclosed"?"disclosed":"private",
  defense:Number.isFinite(r.defense)?clamp(r.defense!):base.defense,
  capacity:Number.isFinite(r.capacity)?clamp(r.capacity!):base.capacity,
  legitimacy:Number.isFinite(r.legitimacy)?clamp(r.legitimacy!):base.legitimacy,
  relations:entries,completedActions:Array.isArray(r.completedActions)?r.completedActions.filter(x=>typeof x==="string").slice(-100):[],
  lastEvent:typeof r.lastEvent==="string"?r.lastEvent.slice(0,600):""};
}
export type NationalAction =
 | {type:"diplomacy";country:ForeignCountry;mode:DiplomaticMode}
 | {type:"defense";mode:DefenseMode}
 | {type:"strategy";mode:GrandStrategy};
export type NationalResult={state:GlobalPower;cashCost:number;influenceDelta:number;supportDelta:number;summary:string;source:string;publicEvent:boolean};
export function nationalAction(power:GlobalPower,action:NationalAction,
 context:{president:boolean;influence:number;cash:number;day:number}):NationalResult|null{
 if(context.day<1 || !Number.isSafeInteger(context.day))return null;
 if(action.type==="strategy"){
   if(power.strategy===action.mode)return null;
   const next={...power,strategy:action.mode};
   return {state:next,cashCost:0,influenceDelta:0,supportDelta:0,
     summary:action.mode==="disclosed"?"You publicly announce your ambitions to reshape international leadership. Other countries react with caution.":
       "You withdraw the public declaration, though people who heard it still remember.",
     source:"National Address",publicEvent:true};
 }
 if(!context.president && context.influence<30)return null;
 if(action.type==="defense"){
   const changes:Record<DefenseMode,{cost:number,readiness:number,capacity:number,legitimacy:number,message:string}> = {
     readiness:{cost:10000,readiness:10,capacity:0,legitimacy:1,message:"Civilian oversight approves a national defense readiness review."},
     training:{cost:22000,readiness:4,capacity:8,legitimacy:1,message:"Defense personnel begin a new training and preparedness program."},
     modernize:{cost:50000,readiness:5,capacity:12,legitimacy:-2,message:"A public defense modernization proposal passes review amid questions about spending."},
     mobilize:{cost:38000,readiness:16,capacity:3,legitimacy:-10,message:"The administration announces an elevated defensive posture. Neighboring governments request assurances."},
     standdown:{cost:0,readiness:-12,capacity:0,legitimacy:5,message:"The government reduces its military alert posture and invites regional observers."},
   };
   const v=changes[action.mode];
   if(context.cash<v.cost)return null;
   const next={...power,defense:clamp(power.defense+v.readiness),
     capacity:clamp(power.capacity+v.capacity),legitimacy:clamp(power.legitimacy+v.legitimacy),
     lastEvent:v.message,completedActions:[...power.completedActions,context.day+":defense:"+action.mode].slice(-100)};
   return {state:next,cashCost:v.cost,influenceDelta:action.mode==="mobilize"?4:2,
      supportDelta:action.mode==="mobilize"?-5:1,summary:v.message,source:"Defense Ministry",publicEvent:true};
 }
 const leader=FOREIGN_LEADERS[action.country];
 if(!leader)return null;
 const old=power.relations[action.country];
 const costs:Record<DiplomaticMode,number>={contact:2500,summit:12000,trade:18000,treaty:22000,pressure:7500};
 if(context.cash<costs[action.mode] || (action.mode==="treaty" && old.trust<55))return null;
 const lookup:Record<DiplomaticMode,{trust:number,trade:number,message:string}> = {
 contact:{trust:8,trade:0,message:"A diplomatic channel opens with "+leader.name+". Both sides agree to exchange proposals."},
 summit:{trust:12,trade:2,message:"You and "+leader.name+" hold a summit. The meeting yields preliminary commitments, not an automatic alliance."},
 trade:{trust:6,trade:15,message:"Trade teams from Cuba and "+action.country+" negotiate a commercial framework with public oversight."},
 treaty:{trust:10,trade:8,message:"Cuba and "+action.country+" sign a limited cooperation agreement. Domestic approval and enforcement remain necessary."},
 pressure:{trust:-16,trade:-5,message:"You pressure "+action.country+" diplomatically. Its leadership pushes back and relations deteriorate."},
 };
 const effect=lookup[action.mode];
 const relation:ForeignRelation={trust:clamp(old.trust+effect.trust),trade:clamp(old.trade+effect.trade),
   status:action.mode==="pressure"?"tense":action.mode==="treaty"?"partner":"dialogue",visits:old.visits+1};
 const next={...power,relations:{...power.relations,[action.country]:relation},
   lastEvent:effect.message,completedActions:[...power.completedActions,context.day+":"+action.country+":"+action.mode].slice(-100)};
 return {state:next,cashCost:costs[action.mode],influenceDelta:action.mode==="summit"?8:4,supportDelta:action.mode==="pressure"?-3:2,
 summary:effect.message,source:leader.name,publicEvent:true};
}
/** Gameplay knowledge gate: private plans are not disclosed in public feeds or DM prompts. */
export function publicStrategyStatement(power:GlobalPower):string|null{
 return power.strategy==="disclosed"?"The player publicly stated an ambition to reshape global political leadership.":null;
}
