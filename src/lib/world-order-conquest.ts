import { COUNTRY_NAMES, COUNTRY_RECORDS, isForeignCountry, type ForeignCountry } from "./world-order-countries";

/**
 * Abstract, alternate-history great-power campaigns.
 * Gameplay concerns legitimacy, diplomacy, economy, resistance and political
 * consequences, never tactical targeting, weapons or real operational guidance.
 */
export type CampaignMethod="diplomacy"|"economic"|"military"|"uprising";
export type CampaignStatus="active"|"won"|"lost"|"withdrawn";
export type TerritoryStatus="independent"|"partner"|"protectorate"|"occupied"|"controlled";
export type WorldCampaign={
 id:string; country:ForeignCountry; method:CampaignMethod; status:CampaignStatus;
 stage:number; progress:number; resistance:number; internationalConcern:number;
 startedDay:number; lastDecisionDay:number; surpriseUsed?:boolean; uprisingSupport?:number; occupationSteps?:number; log:{day:number;choice:string;text:string}[];
};
export type ConquestWorld={
 campaigns:WorldCampaign[]; territory:Record<string,TerritoryStatus>;
 worldTension:number; prestige:number; lastHeadline:string;
};
export type CampaignMove="negotiate"|"invest"|"persuade"|"pressure"|"defend"|"compromise"|"withdraw"|"surprise"|"fund";
export type CampaignDecisionResult={
 state:ConquestWorld; summary:string; influenceDelta:number; supportDelta:number; cost:number;
 country:ForeignCountry; ended:boolean;
};
const clamp=(n:number)=>Math.min(100,Math.max(0,n));
const countries=COUNTRY_NAMES;
const openingResistance=Object.fromEntries(COUNTRY_NAMES.map(name=>[name,COUNTRY_RECORDS[name].resistance])) as Record<ForeignCountry,number>;
export function newConquestWorld():ConquestWorld {
 return {campaigns:[],territory:Object.fromEntries(countries.map(c=>[c,"independent"])) as Record<string,TerritoryStatus>,
   worldTension:8,prestige:0,lastHeadline:""};
}
export function restoreConquestWorld(raw:unknown):ConquestWorld {
 const fresh=newConquestWorld();
 if(!raw||typeof raw!=="object")return fresh;
 const r=raw as Partial<ConquestWorld>;
 const validCountry=isForeignCountry;
 const campaigns=Array.isArray(r.campaigns)?r.campaigns.filter((c):c is WorldCampaign=>Boolean(c&&validCountry(c.country)&&
  ["diplomacy","economic","military","uprising"].includes(c.method)&&["active","won","lost","withdrawn"].includes(c.status)&&
  Number.isInteger(c.stage)&&c.stage>=0&&c.stage<=1000&&Number.isFinite(c.progress)&&Number.isFinite(c.resistance)))
  .slice(-160).map(c=>({...c,progress:clamp(c.progress),resistance:clamp(c.resistance),
   internationalConcern:clamp(c.internationalConcern||0),log:Array.isArray(c.log)?c.log.slice(-40):[]})):[];
 const territory={...fresh.territory};
 for(const country of countries)if(["independent","partner","protectorate","occupied","controlled"].includes(r.territory?.[country]??"")) {
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
 if(method==="uprising"&&context.influence<60)return null;
 const resistance=openingResistance[country];
 const campaign:WorldCampaign={
  id:country.replaceAll(" ","-").toLowerCase()+":"+day+":"+method,
  country,method,status:"active",stage:0,progress:method==="diplomacy"?22:method==="economic"?18:method==="uprising"?12:9,
  resistance,internationalConcern:method==="military"?32:method==="uprising"?25:method==="economic"?12:5,
  startedDay:day,lastDecisionDay:day-1,surpriseUsed:false,uprisingSupport:0,log:[],
 };
 const text=method==="diplomacy"
  ? "You begin private talks with "+country+" about a voluntary regional partnership. Its government insists on sovereign equality."
  : method==="economic"
  ? "Your government launches an ambitious economic partnership proposal toward "+country+". Local businesses and lawmakers scrutinize the terms."
  : method==="uprising" ? "A fictional opposition movement in "+country+" requests clandestine political financing. The operation risks exposure, backlash, and a contested transition."
  : "A major geopolitical crisis opens between Cuba and "+country+". Its leaders mobilize political resistance; international mediators demand de-escalation.";
 const next={...world,campaigns:[...world.campaigns,campaign].slice(-160),
  worldTension:clamp(world.worldTension+(method==="military"?20:method==="uprising"?12:method==="economic"?5:2)),lastHeadline:text};
 return {state:next,summary:text,influenceDelta:method==="military"?-3:3,supportDelta:method==="military"?-6:1,
  cost:15000,country,ended:false};
}
export function campaignMove(world:ConquestWorld,id:string,move:CampaignMove,day:number,
 context:{cash:number;defense:number;trust:number;legitimacy:number}):CampaignDecisionResult|null{
 const existing=world.campaigns.find(c=>c.id===id);
 if(!existing||existing.status!=="active"||day<=existing.lastDecisionDay||!Number.isSafeInteger(day))return null;
 const prices:Record<CampaignMove,number>={negotiate:3500,invest:22000,persuade:8000,pressure:9000,defend:18000,compromise:5000,withdraw:0,surprise:28000,fund:16000};
 if(context.cash<prices[move])return null;
 if(existing.method!=="military"&&["defend","surprise"].includes(move))return null;
 if(existing.method!=="uprising"&&move==="fund")return null;
 if((existing.method==="military"||existing.method==="uprising")&&move==="invest")return null;
 if(move==="surprise"&&existing.surpriseUsed)return null;
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
  case "surprise":
   progress=29;resistance=17;tension=24;concern=26;support=-12;prestige=-4;
   narrative="A surprise offensive gains momentum in the fictional conflict. Emergency displacement and international condemnation follow; the outcome remains contested.";break;
  case "fund":
   progress=17;resistance=-4;tension=8;concern=18;support=-4;
   narrative="A clandestinely funded uprising gains supporters in "+existing.country+". Journalists uncover allegations of foreign financing; the movement demands autonomy in its decisions.";break;
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
   (existing.method==="diplomacy"||existing.method==="economic")){
   status="won"; control="partner";prestige+=12;
   narrative+=" After prolonged public negotiations, a voluntary cooperation union is ratified. "+existing.country+" retains its own democratic institutions.";
 }else if(status==="active" && existing.method==="military" && (existing.surpriseUsed||move==="surprise") &&
   stage>=6 && newProgress>=90 && newResistance<=55 && context.defense>=65){
   status="won";control="occupied";prestige-=3;tension+=16;
   narrative+=" After an extended campaign, forces occupy key government institutions. "+existing.country+" is now occupied, not annexed: civil resistance, legitimacy, and reconstruction remain unresolved.";
 }else if(status==="active" && existing.method==="uprising" && stage>=6 &&
   newProgress>=88 && newResistance<=45 && (existing.uprisingSupport||0)+(move==="fund"?1:0)>=2){
   status="won";control="protectorate";prestige+=1;tension+=5;
   narrative+=" The insurgent coalition wins a contested political transition and signs a provisional security pact with Cuba. It remains a protectorate, with opposition groups demanding a vote.";
 }else if(status==="active" && stage>=8 && newProgress>=88 && newResistance<=35 &&
   existing.method==="military" && move==="compromise" && world.worldTension<65){
   // Winning a confrontation is not the same as controlling a country.
   // A protectorate requires a later, negotiated political settlement and
   // substantial reduction in resistance; no automatic military annexation.
   status="won";control="protectorate";prestige+=4;
   narrative+=" Following a costly crisis, negotiators approve a temporary supervised security arrangement. "+
    existing.country+" becomes a disputed protectorate in this alternate-history game; resistance and international oversight remain.";
 }else if(status==="active" && stage>=12 && newProgress<100){
   status="lost";narrative+=" The prolonged initiative collapses amid domestic resistance and mounting costs.";
 }
 const updated:WorldCampaign={...existing,stage,progress:newProgress,resistance:newResistance,status,
  surpriseUsed:Boolean(existing.surpriseUsed||move==="surprise"),uprisingSupport:(existing.uprisingSupport||0)+(move==="fund"?1:0),
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

/**
 * A final political integration step after an earned, completed campaign.
 * This intentionally takes another day; an alliance alone is not a takeover.
 */
export function consolidateControl(world:ConquestWorld,country:ForeignCountry,day:number,
 context:{president:boolean;cash:number;legitimacy:number}):CampaignDecisionResult|null{
 const current=world.territory[country];
 const completed=[...world.campaigns].reverse().find(c=>c.country===country&&c.status==="won");
 if(!context.president||context.cash<25000||context.legitimacy<45||!completed||
  (current!=="partner"&&current!=="protectorate"&&current!=="occupied")||
  day<=completed.lastDecisionDay+1)return null;
 if(current==="occupied"&&(completed.resistance>40||(completed.occupationSteps||0)<2))return null;
 const summary=current==="occupied"
   ?country+" passes from disputed military occupation into direct administration after a costly consolidation process. Resistance, reconstruction, and international criticism remain."
   :country+" enters your international union following a negotiated integration agreement. It becomes a governed territory in this alternate-history simulation; local opposition and autonomy questions remain.";
 const next:ConquestWorld={...world,
   territory:{...world.territory,[country]:"controlled"},prestige:clamp(world.prestige+8),
   worldTension:clamp(world.worldTension+(current==="occupied"?12:5)),lastHeadline:summary};
 return {state:next,cost:25000,influenceDelta:5,supportDelta:0,country,ended:true,summary};
}

/**
 * Govern a recently occupied country through broad, non-tactical decisions.
 * Reduced unrest permits eventual integration; neglect can prolong occupation.
 */
export function governOccupation(world:ConquestWorld,country:ForeignCountry,day:number,
 action:"services"|"autonomy"|"security",context:{cash:number}):CampaignDecisionResult|null{
 const won=[...world.campaigns].reverse().find(c=>c.country===country&&c.status==="won"&&c.method==="military");
 if(world.territory[country]!=="occupied"||!won||day<=won.lastDecisionDay)return null;
 const cost=action==="services"?18000:action==="autonomy"?7000:12000;
 if(context.cash<cost)return null;
 const delta=action==="services"?-14:action==="autonomy"?-19:7;
 const tension=action==="services"?-3:action==="autonomy"?-6:9;
 const narrative=action==="services"
  ?country+" receives food, medical assistance, and rebuilding funds. Public opposition eases while local councils request an elected transition."
  :action==="autonomy"
  ?country+" gains a civilian autonomy charter and independent local oversight, reducing occupation resistance."
  :country+" tightens emergency security under occupation. Some unrest subsides, but civic resistance and international criticism rise.";
 const updated={...won,resistance:clamp(won.resistance+delta),occupationSteps:(won.occupationSteps||0)+1,lastDecisionDay:day,
  log:[...won.log,{day,choice:action,text:narrative}].slice(-40)};
 const next={...world,campaigns:world.campaigns.map(c=>c.id===won.id?updated:c),
  worldTension:clamp(world.worldTension+tension),lastHeadline:narrative};
 return {state:next,summary:narrative,influenceDelta:0,supportDelta:action==="security"?-3:2,
  cost,country,ended:false};
}
