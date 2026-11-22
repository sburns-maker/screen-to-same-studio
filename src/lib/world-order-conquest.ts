import type { ForeignCountry } from "./world-order-global-power";

/**
 * Abstract, alternate-history great-power campaigns.
 * Gameplay concerns legitimacy, diplomacy, economy, resistance and political
 * consequences, never tactical targeting, weapons or real operational guidance.
 */
export type CampaignMethod="diplomacy"|"economic"|"military";
export type CampaignStatus="active"|"won"|"lost"|"withdrawn";
export type TerritoryStatus="independent"|"partner"|"protectorate";
export type WorldCampaign={
 id:string; country:ForeignCountry; method:CampaignMethod; status:CampaignStatus;
 stage:number; progress:number; resistance:number; internationalConcern:number;
 startedDay:number; lastDecisionDay:number; log:{day:number;choice:string;text:string}[];
};
export type ConquestWorld={
 campaigns:WorldCampaign[]; territory:Record<string,TerritoryStatus>;
 worldTension:number; prestige:number; lastHeadline:string;
};
export type CampaignMove="negotiate"|"invest"|"persuade"|"pressure"|"defend"|"compromise"|"withdraw";
export type CampaignDecisionResult={
 state:ConquestWorld; summary:string; influenceDelta:number; supportDelta:number; cost:number;
 country:ForeignCountry; ended:boolean;
};
const clamp=(n:number)=>Math.min(100,Math.max(0,n));
const countries=["United States","United Kingdom","Canada","Brazil","France","Mexico"] as const;
const openingResistance:Record<ForeignCountry,number>={
 "United States":92,"United Kingdom":84,"Canada":78,"Brazil":69,"France":85,"Mexico":72,
};
export function newConquestWorld():ConquestWorld {
 return {campaigns:[],territory:Object.fromEntries(countries.map(c=>[c,"independent"])) as Record<string,TerritoryStatus>,
   worldTension:8,prestige:0,lastHeadline:""};
}
export function restoreConquestWorld(raw:unknown):ConquestWorld {
 const fresh=newConquestWorld();
 if(!raw||typeof raw!=="object")return fresh;
 const r=raw as Partial<ConquestWorld>;
 const validCountry=(v:unknown):v is ForeignCountry=>typeof v==="string"&&countries.includes(v as ForeignCountry);
 const campaigns=Array.isArray(r.campaigns)?r.campaigns.filter((c):c is WorldCampaign=>Boolean(c&&validCountry(c.country)&&
  ["diplomacy","economic","military"].includes(c.method)&&["active","won","lost","withdrawn"].includes(c.status)&&
  Number.isInteger(c.stage)&&c.stage>=0&&c.stage<=1000&&Number.isFinite(c.progress)&&Number.isFinite(c.resistance)))
  .slice(-80).map(c=>({...c,progress:clamp(c.progress),resistance:clamp(c.resistance),
   internationalConcern:clamp(c.internationalConcern||0),log:Array.isArray(c.log)?c.log.slice(-40):[]})):[];
 const territory={...fresh.territory};
 for(const country of countries)if(["independent","partner","protectorate"].includes(r.territory?.[country]??"")) {
  territory[country]=r.territory![country]!;
 }
 return {campaigns,territory,worldTension:Number.isFinite(r.worldTension)?clamp(r.worldTension!):fresh.worldTension,
 prestige:Number.isFinite(r.prestige)?clamp(r.prestige!):0,
 lastHeadline:typeof r.lastHeadline==="string"?r.lastHeadline.slice(0,600):""};
}
export function beginConquestCampaign(world:ConquestWorld,country:ForeignCountry,method:CampaignMethod,day:number,
 context:{president:boolean;influence:number;cash:number;trust:number;militaryCapacity:number}):CampaignDecisionResult|null{
 if(!countries.includes(country)||!Number.isSafeInteger(day)||day<1||
  world.campaigns.some(c=>c.country===country&&c.status==="active")||world.territory[country]!=="independent")return null;
 if(!context.president || context.cash<15000)return null;
 if(method==="diplomacy"&&context.trust<40)return null;
 if(method==="economic"&&context.influence<45)return null;
 if(method==="military"&&context.militaryCapacity<55)return null;
 const resistance=openingResistance[country];
 const campaign:WorldCampaign={
  id:country.replaceAll(" ","-").toLowerCase()+":"+day+":"+method,
  country,method,status:"active",stage:0,progress:method==="diplomacy"?22:method==="economic"?18:9,
  resistance,internationalConcern:method==="military"?32:method==="economic"?12:5,
  startedDay:day,lastDecisionDay:day-1,log:[],
 };
 const text=method==="diplomacy"
  ? "You begin private talks with "+country+" about a voluntary regional partnership. Its government insists on sovereign equality."
  : method==="economic"
  ? "Your government launches an ambitious economic partnership proposal toward "+country+". Local businesses and lawmakers scrutinize the terms."
  : "A major geopolitical crisis opens between Cuba and "+country+". Its leaders mobilize political resistance; international mediators demand de-escalation.";
 const next={...world,campaigns:[...world.campaigns,campaign].slice(-80),
  worldTension:clamp(world.worldTension+(method==="military"?20:method==="economic"?5:2)),lastHeadline:text};
 return {state:next,summary:text,influenceDelta:method==="military"?-3:3,supportDelta:method==="military"?-6:1,
  cost:15000,country,ended:false};
}
export function campaignMove(world:ConquestWorld,id:string,move:CampaignMove,day:number,
 context:{cash:number;defense:number;trust:number;legitimacy:number}):CampaignDecisionResult|null{
 const existing=world.campaigns.find(c=>c.id===id);
 if(!existing||existing.status!=="active"||day<=existing.lastDecisionDay||!Number.isSafeInteger(day))return null;
 const prices:Record<CampaignMove,number>={negotiate:3500,invest:22000,persuade:8000,pressure:9000,defend:18000,compromise:5000,withdraw:0};
 if(context.cash<prices[move])return null;
 if(existing.method!=="military"&&move==="defend")return null;
 if(existing.method==="military"&&move==="invest")return null;
 let progress=0,resistance=0,tension=0,concern=0,prestige=0,support=0,influence=0;
 let narrative="";
 switch(move){
  case "negotiate":
   progress=9+Math.floor(context.trust/20);resistance=-7;concern=-5;influence=2;
   narrative="Delegates explore workable conditions, but "+existing.country+" will not relinquish sovereignty merely because you ask.";break;
  case "invest":
   progress=15;resistance=-3;concern=2;influence=2;
   narrative="Investments create mutual interests. Independent regulators insist that local people keep control over their institutions.";break;
  case "persuade":
   progress=11+Math.floor(context.legitimacy/25);resistance=-5;influence=2;
   narrative="A public campaign wins some support while opposition figures raise difficult questions about your long-term intentions.";break;
  case "pressure":
   progress=13;resistance=10;tension=9;concern=12;support=-5;influence=1;
   narrative="Pressure produces a short-term concession, but hardens political resistance and alarms other governments.";break;
  case "defend":
   progress=Math.max(2,Math.floor(context.defense/8));resistance=7;tension=11;concern=13;support=-7;
   narrative="Defense officials report an intense strategic standoff. Both governments face costs and civilians demand an end to the crisis.";break;
  case "compromise":
   progress=7;resistance=-13;tension=-8;concern=-10;support=3;prestige=2;
   narrative="A mediated compromise lowers tensions and moves negotiations forward, although both sides retain their independence.";break;
  case "withdraw":
   narrative="You end the campaign. "+existing.country+" remains independent, and observers debate whether restraint came too late.";break;
 }
 const stage=existing.stage+1;
 // Resistance is a contested political variable, not a tactical military formula.
 const newResistance=clamp(existing.resistance+resistance);
 const newProgress=clamp(existing.progress+progress-Math.floor(newResistance/15));
 let status:CampaignStatus=move==="withdraw"?"withdrawn":"active";
 let control:TerritoryStatus="independent";
 if(status==="active" && stage>=4 && newProgress>=75 && newResistance<=60 &&
   existing.method!=="military"){
   status="won"; control="partner";prestige+=12;
   narrative+=" After prolonged public negotiations, a voluntary cooperation union is ratified. "+existing.country+" retains its own democratic institutions.";
 }else if(status==="active" && stage>=8 && newProgress>=88 && newResistance<=35 &&
   existing.method==="military" && move==="compromise" && world.worldTension<65){
   // Winning a confrontation is not the same as controlling a country.
   // A protectorate requires a later, negotiated political settlement and
   // substantial reduction in resistance; no automatic military annexation.
   status="won";control="protectorate";prestige+=4;
   narrative+=" Following a costly crisis, negotiators approve a temporary supervised security arrangement. "+
    existing.country+" becomes a disputed protectorate in this alternate-history game; resistance and international oversight remain.";
 }else if(status==="active" && stage>=12){
   status="lost";narrative+=" The prolonged initiative collapses amid domestic resistance and mounting costs.";
 }
 const updated:WorldCampaign={...existing,stage,progress:newProgress,resistance:newResistance,status,
  internationalConcern:clamp(existing.internationalConcern+concern),lastDecisionDay:day,
  log:[...existing.log,{day,choice:move,text:narrative}].slice(-40)};
 const headline=existing.country+" · "+narrative;
 const next={...world,campaigns:world.campaigns.map(c=>c.id===id?updated:c),
  territory:control!=="independent"?{...world.territory,[existing.country]:control}:world.territory,
  worldTension:clamp(world.worldTension+tension+(status==="lost"?-4:0)),
  prestige:clamp(world.prestige+prestige),lastHeadline:headline};
 return {state:next,summary:headline,cost:prices[move],influenceDelta:influence,supportDelta:support,
  country:existing.country,ended:status!=="active"};
}
export function activeCampaign(world:ConquestWorld,country:ForeignCountry):WorldCampaign|undefined{
 return world.campaigns.find(c=>c.country===country&&c.status==="active");
}
