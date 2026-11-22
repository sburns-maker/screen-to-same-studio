/**
 * A bounded cast of simulated famous people and original supporting characters.
 * All celebrity portrayals are fictional alternate-history roles.
 */
export const SOCIAL_CAST = {
  Sabrina: { name:"Sabrina Carpenter", role:"Singer", city:"New York", opener:"Hey. I finally have a free evening after all of this. Would you want to grab dinner somewhere quiet?", scene:"dinner", celeb:true },
  Taylor: { name:"Taylor Swift", role:"Musician", city:"New York", opener:"Your interview made every group chat explode. I'd love to hear the whole story over coffee.", scene:"coffee", celeb:true },
  Zendaya: { name:"Zendaya", role:"Actor", city:"Los Angeles", opener:"I saw the clip from the show. That was a wild moment. Are you taking any time to breathe?", scene:"lunch", celeb:true },
  Rihanna: { name:"Rihanna", role:"Musician and entrepreneur", city:"New York", opener:"I hear you've got big ideas. Maybe we should talk business when you're in town.", scene:"meeting", celeb:true },
  Dua: { name:"Dua Lipa", role:"Singer", city:"London", opener:"Okay, I need the story behind that interview 😂 Drinks with a few friends in London?", scene:"party", celeb:true },
  Selena: { name:"Selena Gomez", role:"Singer and actor", city:"Los Angeles", opener:"That was a scary night. I hope everybody involved is doing okay. Would love to catch up sometime.", scene:"coffee", celeb:true },
  Pedro: { name:"Pedro Pascal", role:"Actor", city:"Los Angeles", opener:"The whole internet is talking about you. This is one fascinating plot twist. Lunch?", scene:"lunch", celeb:true },
  Ryan: { name:"Ryan Reynolds", role:"Actor and entrepreneur", city:"New York", opener:"So apparently you're collecting headlines. Want to brainstorm a business idea over lunch?", scene:"meeting", celeb:true },
  Beyoncé: { name:"Beyoncé", role:"Musician", city:"New York", opener:"I heard about the concert. My team thought we might have a creative opportunity worth discussing.", scene:"meeting", celeb:true },
  Billie: { name:"Billie Eilish", role:"Singer", city:"Los Angeles", opener:"That concert footage was intense. Glad everyone got out. You okay?", scene:"coffee", celeb:true },
  PresidentReed: {name:"President Alexandra Reed",role:"US President · alternate timeline",city:"Washington",opener:"My office received your proposal. Our governments have several difficult issues to discuss.",scene:"meeting",celeb:false},
  PrimeMinisterGrant: {name:"Prime Minister Oliver Grant",role:"UK Prime Minister · alternate timeline",city:"London",opener:"Your delegation's request has reached Downing Street. What exactly are you proposing?",scene:"meeting",celeb:false},
  PrimeMinisterLaurent: {name:"Prime Minister Camille Laurent",role:"Canadian Prime Minister · alternate timeline",city:"Ottawa",opener:"I would welcome a discussion about bilateral cooperation and humanitarian priorities.",scene:"meeting",celeb:false},
  PresidentCosta: {name:"President Mariana Costa",role:"Brazilian President · alternate timeline",city:"Brasília",opener:"Our regional advisers have raised several opportunities for constructive talks.",scene:"meeting",celeb:false},
  PresidentMoreau: {name:"President Émile Moreau",role:"French President · alternate timeline",city:"Paris",opener:"My office is interested in the proposed cultural and trade cooperation.",scene:"meeting",celeb:false},
  PresidentNavarro: {name:"President Isabel Navarro",role:"Mexican President · alternate timeline",city:"Mexico City",opener:"There are regional matters worth discussing through formal channels.",scene:"meeting",celeb:false},
  SabrinaFriend: { name:"Avery Hart", role:"Tour coordinator", city:"New York", opener:"Hey, I'm Avery from the tour crew. Sabrina asked me to make sure you got her invitation.", scene:"dinner", celeb:false },
  Maya: { name:"Maya Torres", role:"Entertainment journalist", city:"New York", opener:"I have a longer interview request for you. Can we meet in person?", scene:"interview", celeb:false },
  Elena: { name:"Elena Valdés", role:"Political organizer", city:"Havana", opener:"We should discuss the next reform proposal. I'm inviting you to a coalition meeting.", scene:"meeting", celeb:false },
  Sofía: { name:"Sofía Reyes", role:"Reporter", city:"Havana", opener:"There are rumors surrounding your latest deal. Can I get your side of it?", scene:"interview", celeb:false },
  Lucía: { name:"Lucía Herrera", role:"Business owner", city:"Havana", opener:"I have a local partnership proposal. Let's talk over lunch.", scene:"lunch", celeb:false },
  Rafael: { name:"Rafael Morales", role:"Community organizer", city:"Havana", opener:"People are waiting on answers. I can meet you at the community hall today.", scene:"meeting", celeb:false },
  Mercer: { name:"Daniel Mercer", role:"Investor", city:"Miami", opener:"I've got a deal for you. Let's talk numbers over dinner.", scene:"meeting", celeb:false },
  Nora: { name:"Nora Wells", role:"Political correspondent", city:"Washington", opener:"I have questions about the political situation. Join me for a short sit-down?", scene:"interview", celeb:false },
} as const;
export type SocialContact=keyof typeof SOCIAL_CAST;
export const SOCIAL_CONTACTS=Object.keys(SOCIAL_CAST) as SocialContact[];
export type SceneKind="dinner"|"coffee"|"lunch"|"meeting"|"party"|"interview";
export type SocialVisit={ contact:SocialContact; day:number; city:string; kind:SceneKind; outcome:string; status:"planned"|"completed" };
export type SocialLife={ incomingIds:string[]; seenByContact:Record<string,number>; rapport:Partial<Record<SocialContact,number>>; visits:SocialVisit[]; };
export type IncomingDM={id:string;contact:SocialContact;day:number;body:string};
export function createSocialLife():SocialLife {return { incomingIds:[],seenByContact:{},rapport:{},visits:[] };}
export function restoreSocialLife(raw:unknown):SocialLife {
 const blank=createSocialLife();if(!raw||typeof raw!=="object")return blank;
 const r=raw as Partial<SocialLife>;
 return {incomingIds:Array.isArray(r.incomingIds)?r.incomingIds.filter(x=>typeof x==="string").slice(-500):[],
 seenByContact:r.seenByContact&&typeof r.seenByContact==="object"?r.seenByContact:{},
 rapport:r.rapport&&typeof r.rapport==="object"?r.rapport:{},
 visits:Array.isArray(r.visits)?r.visits.filter(v=>v&&v.contact in SOCIAL_CAST&&["planned","completed"].includes(v.status)).slice(-80):[]};
}
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
export function incomingSocialWave(day:number,followers:number,chapter:"rescue"|"interview"|"cuba",already:readonly string[]):IncomingDM[]{
 if(day<2||followers<50000||chapter==="rescue")return [];
 // Two or three incoming contacts per day, spread over the cast. No background AI calls.
 const ordinaryContacts=SOCIAL_CONTACTS.filter(c=>!c.startsWith("President")&&!c.startsWith("PrimeMinister"));
 const candidates=chapter==="interview"?ordinaryContacts.slice(0,12):ordinaryContacts;
 const count=followers>=1_000_000?3:2;
 const out:IncomingDM[]=[];
 for(let offset=0;offset<count;offset++){
  const contact=offset===0 && day%3===1 ? "Sabrina" : candidates[(day*3+offset*5)%candidates.length]!;
  const id="inbound:"+day+":"+contact;
  if(already.includes(id)||out.some(o=>o.contact===contact))continue;
  const person=SOCIAL_CAST[contact];
  const variations=[
    person.opener,
    "Hey, "+(day%2?"I saw the coverage":"someone told me about your latest move")+". "+(person.celeb?"Could we catch up when we're in the same city?":"I'd like to talk to you directly."),
    person.celeb?"People keep sending me your posts. Want to meet up sometime?":"Something's changed since your last decision. We should talk in person.",
  ];
  out.push({id,contact,day,body:variations[(day+offset)%variations.length]!});
 }
 return out;
}
export function arrangeMeetup(life:SocialLife,contact:SocialContact,day:number,playerCity:string):{life:SocialLife;message:string;visit?:SocialVisit}{
 const person=SOCIAL_CAST[contact];
 if(!person)return {life,message:"Contact not available."};
 const existing=life.visits.find(v=>v.contact===contact&&v.status==="planned");
 if(existing)return {life,message:person.name+" already has plans with you in "+existing.city+" on Day "+existing.day+".",visit:existing};
 const planned:SocialVisit={contact,day:day+1,city:person.city,kind:person.scene,outcome:"",status:"planned"};
 return {life:{...life,visits:[...life.visits,planned].slice(-80)},visit:planned,
 message:playerCity===person.city
 ? person.name+" says yes. You're meeting tomorrow for "+person.scene+"."
 : person.name+" says yes. You're invited to "+person.city+" tomorrow for "+person.scene+"."};
}
export type MeetupApproach="personal"|"career"|"fun";
export function completeMeetup(life:SocialLife,contact:SocialContact,day:number,city:string,approach:MeetupApproach="personal"):{life:SocialLife;message:string}|null{
 const visit=life.visits.find(v=>v.contact===contact&&v.status==="planned");
 if(!visit||day<visit.day||city!==visit.city)return null;
 const person=SOCIAL_CAST[contact];
 const story={
  personal:"You ask how life has really been lately, listen without interruptions, and share a little about what you've been through. The conversation turns surprisingly personal.",
  career:"You trade ideas about your ambitions and the projects you hope to build. Some proposals interest "+person.name+"; others get a skeptical smile.",
  fun:"You leave the headlines outside and enjoy the evening. There's laughter, an unexpected story, and a memorable moment away from the cameras.",
 }[approach];
 const message="You meet "+person.name+" for "+visit.kind+" in "+city+". "+story+" You part on good terms, without making promises on their behalf.";
 const gain=approach==="personal"?16:approach==="fun"?11:8;
 return {life:{...life,rapport:{...life.rapport,[contact]:clamp((life.rapport[contact]??35)+gain)},
 visits:life.visits.map(v=>v===visit?{...v,status:"completed" as const,outcome:message}:v)},message};
}
export function unreadFrom(chat:readonly {from:string;id:number}[],seenByContact:Record<string,number>,contact:string):number {
 return chat.filter(m=>m.from===contact&&m.id>(seenByContact[contact]??0)).length;
}
