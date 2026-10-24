import { TOWN_NPCS, type TownNpc } from "./blair-town-npcs";
export type NpcActivity="asleep"|"at_home"|"commuting"|"at_work"|"socializing"|"errands"|"outdoors";
export type NpcSchedule={npcId:string;day:string;hour:number;activity:NpcActivity;location:string;available:boolean;detail:string};
const TZ="America/New_York";
const local=(now:Date)=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:TZ,weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);const get=(s:string)=>parts.find(p=>p.type===s)?.value??"";return {day:`${get("year")}-${get("month")}-${get("day")}`,hour:Number(get("hour")),weekend:["Sat","Sun"].includes(get("weekday"))};};
const hash=(s:string)=>[...s].reduce((a,c)=>Math.imul(a,33)+c.charCodeAt(0)>>>0,5381);
function shift(npc:TownNpc){if(/nurse|shift supervisor/.test(npc.role))return "night";if(/barista|server|delivery/.test(npc.role))return "early";if(/bartender|music|artist/.test(npc.role))return "evening";return "day";}
export function npcSchedule(npc:TownNpc,now:Date):NpcSchedule {
 const {day,hour,weekend}=local(now),seed=hash(npc.id+day),pattern=shift(npc);
 const off=(seed%7===0)||(weekend&&pattern==="day"&&seed%4!==0);
 const sleep=pattern==="night"?hour>=8&&hour<16:pattern==="evening"?hour>=3&&hour<10:hour>=23||hour<6;
 const work=pattern==="night"?(hour>=22||hour<6):pattern==="early"?hour>=6&&hour<14:pattern==="evening"?hour>=15&&hour<23:hour>=9&&hour<17;
 let activity:NpcActivity=sleep?"asleep":off?"at_home":work?"at_work":"at_home";
 if(!sleep&&!work){if(seed%5===0&&hour>=16&&hour<21)activity="socializing";else if(seed%3===0&&hour>=10&&hour<20)activity="errands";else if(seed%7===1&&hour>=8&&hour<19)activity="outdoors";}
 if(!sleep&&work&&off)activity="at_home";
 if(!sleep&&!off&&!work&&(pattern==="night"&&hour===21||pattern==="day"&&hour===8))activity="commuting";
 const location=activity==="at_work"?"workplace in "+npc.area:activity==="socializing"?"public social place in "+npc.area:activity==="outdoors"?"public outdoor area near "+npc.area:activity==="errands"?"shops around "+npc.area:activity==="commuting"?"in transit near "+npc.area:"home in "+npc.area;
 return {npcId:npc.id,day,hour,activity,location,available:!["asleep","at_work","commuting"].includes(activity),detail:`${npc.name} (${npc.role}) is ${activity.replace("_"," ")}; ${location}`};
}
export function neighborhoodSnapshot(area:string,now:Date,limit=10):NpcSchedule[]{
 const locals=TOWN_NPCS.filter(n=>n.area===area);
 const roster=locals.length?locals:TOWN_NPCS;
 const seed=hash(area+local(now).day);
 return Array.from({length:Math.min(limit,roster.length)},(_,i)=>roster[(seed+i*3)%roster.length]).filter((npc): npc is TownNpc => npc !== undefined).map(npc=>npcSchedule(npc,now));
}
export function scheduledPopulationContext(characterKey:string,now:Date):string[]{
 const areas=[...new Set(TOWN_NPCS.map(n=>n.area))];
 const day=local(now).day;
 const area=areas[hash(characterKey+day)%areas.length];
 if (area === undefined) return [];
 return ["SIMULATED NEIGHBORHOOD (fictional residents, timezone Eastern): "+neighborhoodSnapshot(area,now,6).map(s=>s.detail).join("; ")+". These are background schedules, not proof the main character saw or met them. No real-world person is implied. Conversations, relationships and memories require explicit recorded in-world events. Do not force the user into social encounters."];
}
