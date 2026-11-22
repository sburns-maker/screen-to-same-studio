/**
 * Persistent open-world sandbox activities. Mechanics are deterministic,
 * replayable, and independent of the story mission scheduler.
 */
export type City = "Havana" | "Miami" | "New York" | "Washington" | "London" | "Paris" | "Los Angeles";
export type VentureId = "nightclub" | "media" | "housing" | "shipping" | "studio" | "foundation";
export type Venture = { id: VentureId; level: number };
export type OpenWorld = {
  cash: number; city: City; ventures: Venture[];
  allies: string[]; invitations: string[]; history: string[];
  actionsTaken: number; latest: string;
};
export type WorldAction =
  | { type: "travel"; city: City }
  | { type: "buy"; venture: VentureId }
  | { type: "upgrade"; venture: VentureId }
  | { type: "host"; kind: "party" | "fundraiser" | "townhall" }
  | { type: "network"; contact: string }
  | { type: "negotiate"; target: "local" | "international" | "opposition" }
  | { type: "work"; venture: VentureId };
export type ActionResult = {
  state: OpenWorld; cashChange: number; influenceChange: number;
  reputationChange: number; supportChange: number;
  headline: string; category: string; who: string;
};
export const CITIES: City[] = ["Havana", "Miami", "New York", "Washington", "London", "Paris", "Los Angeles"];
export const VENTURES: Record<VentureId, { name: string; city: City; cost: number; upgrade: number; income: number; description: string }> = {
  nightclub: { name: "After Dark", city: "Miami", cost: 125_000, upgrade: 60_000, income: 16_000, description: "Nightlife, parties, celebrity connections" },
  media: { name: "Independent Media Network", city: "New York", cost: 160_000, upgrade: 90_000, income: 24_000, description: "Influence how stories reach the world" },
  housing: { name: "Housing Development", city: "Havana", cost: 90_000, upgrade: 55_000, income: 11_000, description: "Build homes, set standards, handle tenants" },
  shipping: { name: "Caribbean Shipping", city: "Havana", cost: 180_000, upgrade: 100_000, income: 27_000, description: "Trade, logistics, economic leverage" },
  studio: { name: "Creative Studio", city: "Los Angeles", cost: 110_000, upgrade: 65_000, income: 13_000, description: "Music, film, and creative business" },
  foundation: { name: "Community Foundation", city: "Havana", cost: 70_000, upgrade: 40_000, income: 0, description: "Public programs and social capital" },
};
export const CONTACTS = [
  { name: "Sabrina", city: "New York" as City, topic: "A private invitation from the entertainment world" },
  { name: "Maya", city: "New York" as City, topic: "Journalism and a media appearance" },
  { name: "Elena", city: "Havana" as City, topic: "Community coalition and reform" },
  { name: "Rafael", city: "Havana" as City, topic: "Labor organizing and neighborhood needs" },
  { name: "Lucía", city: "Havana" as City, topic: "Local business and investment" },
  { name: "Sofía", city: "Havana" as City, topic: "Independent reporting and accountability" },
  { name: "Mercer", city: "Miami" as City, topic: "Investment partnership" },
  { name: "Nora", city: "Washington" as City, topic: "Political media and interviews" },
] as const;
const clamp=(v:number)=>Math.max(0,Math.min(100,v));
export function createOpenWorld(): OpenWorld {
  // A modest fictional starting capital funds the first hands-on venture.
  return { cash: 250_000, city: "Havana", ventures: [], allies: [], invitations: [], history: [],
    actionsTaken: 0, latest: "" };
}
export function restoreOpenWorld(raw:unknown):OpenWorld {
  const original=createOpenWorld();
  if (!raw || typeof raw !== "object") return original;
  const r=raw as Partial<OpenWorld>;
  return {
    cash:Number.isFinite(r.cash)&&r.cash!>=0?Math.floor(r.cash!):original.cash,
    city:CITIES.includes(r.city as City)?r.city!:original.city,
    ventures:Array.isArray(r.ventures)?r.ventures.filter(v=>v && v.id in VENTURES && Number.isInteger(v.level)&&v.level>=1&&v.level<=5):[],
    allies:Array.isArray(r.allies)?r.allies.filter(x=>typeof x==="string").slice(0,40):[],
    invitations:Array.isArray(r.invitations)?r.invitations.filter(x=>typeof x==="string").slice(0,40):[],
    history:Array.isArray(r.history)?r.history.filter(x=>typeof x==="string").slice(-100):[],
    actionsTaken:Number.isSafeInteger(r.actionsTaken)&&r.actionsTaken!>=0?r.actionsTaken!:0,
    latest:typeof r.latest==="string"?r.latest.slice(0,500):"",
  };
}
export function ventureIncome(world:OpenWorld):number {
  return world.ventures.reduce((n,v)=>n+VENTURES[v.id].income*v.level,0);
}
export function ventureValue(world:OpenWorld):number {
  return world.ventures.reduce((n,v)=>n+VENTURES[v.id].cost+(v.level-1)*VENTURES[v.id].upgrade,0);
}
export function applyOpenWorldAction(state:OpenWorld,action:WorldAction,day:number):ActionResult|null {
  if (!Number.isSafeInteger(day)||day<1) return null;
  const next:OpenWorld={...state,ventures:state.ventures.map(v=>({...v})), allies:[...state.allies],
    invitations:[...state.invitations],history:[...state.history]};
  let influence=0,reputation=0,support=0,who="The Public Square",category="Lifestyle",headline="";
  const before=next.cash;
  if(action.type==="travel"){
    if(!CITIES.includes(action.city)||action.city===next.city||next.cash<2500)return null;
    next.cash-=2500;next.city=action.city;who="Travel Desk";
    headline="You arrive in "+action.city+". New business meetings and social connections are now available.";
  }else if(action.type==="buy"){
    const v=VENTURES[action.venture];
    if(!v||next.ventures.some(x=>x.id===action.venture)||next.cash<v.cost)return null;
    next.cash-=v.cost;next.ventures.push({id:action.venture,level:1});category="Business";who="Business Ledger";
    headline="You purchase "+v.name+". Ownership now appears in your portfolio, and you can fund expansion or manage operations.";
    influence+=4;support+=action.venture==="foundation"||action.venture==="housing"?5:0;
  }else if(action.type==="upgrade"){
    const v=VENTURES[action.venture],existing=next.ventures.find(x=>x.id===action.venture);
    if(!v||!existing||existing.level>=5||next.cash<v.upgrade*existing.level)return null;
    next.cash-=v.upgrade*existing.level;existing.level++;
    category="Business";who="Business Ledger";influence+=2;
    headline=v.name+" expands to level "+existing.level+". Its capacity and recurring income increase.";
  }else if(action.type==="work"){
    const v=VENTURES[action.venture],existing=next.ventures.find(x=>x.id===action.venture);
    if(!v||!existing)return null;
    const earned=Math.max(4000,Math.round(v.income*(0.65+existing.level*0.35)));
    next.cash+=earned;influence+=existing.level;category="Business";who=v.name;
    headline="You spend the day managing "+v.name+". Your decisions earn $"+earned.toLocaleString()+" and attract new professional contacts.";
  }else if(action.type==="host"){
    const cost=action.kind==="party"?15_000:action.kind==="fundraiser"?8_000:4_000;
    if(next.cash<cost)return null;
    next.cash-=cost;influence+=action.kind==="party"?8:action.kind==="fundraiser"?5:4;
    reputation+=action.kind==="fundraiser"?4:0;
    support+=action.kind==="townhall"?8:action.kind==="fundraiser"?5:0;
    const eventName=action.kind==="party"?"a high-profile party":action.kind==="fundraiser"?"a benefit fundraiser":"an open public town hall";
    who=action.kind==="party"?"Social Circuit":action.kind==="fundraiser"?"Community Circle":"Local Voices";
    headline="You host "+eventName+" in "+next.city+". Guests arrive, new connections form, and your public image shifts.";
  }else if(action.type==="network"){
    const contact=CONTACTS.find(c=>c.name===action.contact);
    if(!contact||next.allies.includes(contact.name)||next.city!==contact.city)return null;
    next.allies.push(contact.name);influence+=5;category="People";who=contact.name;
    headline="You arrange an introduction with "+contact.name+" in "+next.city+". This opens an ongoing relationship, not an automatic endorsement.";
    if(!next.invitations.includes(contact.name))next.invitations.push(contact.name);
  }else if(action.type==="negotiate"){
    who=action.target==="local"?"Community Coalition":action.target==="international"?"Diplomatic Desk":"Opposition Council";
    category="Politics";
    influence+=action.target==="international"?8:5;
    support+=action.target==="local"?6:action.target==="opposition"?4:1;
    reputation+=action.target==="opposition"?2:0;
    headline=action.target==="local"?"You meet local representatives, who demand concrete commitments rather than promises.":
      action.target==="international"?"You open exploratory talks with a foreign delegation. No agreement is guaranteed.":
      "You meet political rivals and propose a compromise. Their support remains conditional.";
  }else{return null;}
  const delta=next.cash-before;
  next.actionsTaken++;next.latest=headline;
  next.history.push("Day "+day+": "+headline);
  next.history=next.history.slice(-100);
  return {state:next,cashChange:delta,influenceChange:influence,
    reputationChange:clamp(reputation),supportChange:support,headline,who,category};
}
