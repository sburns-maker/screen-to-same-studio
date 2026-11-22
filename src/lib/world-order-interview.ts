/** Persistent, multi-turn televised interview. The user—not an option click—
 * decides when the broadcast ends.
 */
export type InterviewTone="question"|"joke"|"facts";
export type InterviewTurn={speaker:"host"|"player"|"Sabrina"|"audience";text:string};
export type InterviewScene={status:"open"|"finished";tone:InterviewTone;turns:InterviewTurn[];suggestedReplies?:string[]};
export type InterviewGuestTurn=Pick<InterviewTurn,"speaker"|"text">;
const OPENING:InterviewTurn={
 speaker:"host",
 text:"We're back live, and sitting beside me are Sabrina Carpenter and the stranger who helped protect her at the concert. First, how are you both doing? And what do you make of the president's response to what happened?",
};
export function createInterviewScene():InterviewScene{return {status:"open",tone:"question",turns:[OPENING]};}
export function restoreInterviewScene(raw:unknown,chapter:string):InterviewScene|null{
 if(chapter!=="interview")return null;
 if(raw && typeof raw==="object"){
  const value=raw as Partial<InterviewScene>;
  if(value.status==="open"||value.status==="finished"){
   const turns=Array.isArray(value.turns)?value.turns.filter(v=>v&&typeof v.text==="string"&&["host","player","Sabrina","audience"].includes(v.speaker)).slice(-50):[];
   return {status:value.status,tone:["question","joke","facts"].includes(value.tone??"")?value.tone!:"question",turns:turns.length?turns:[OPENING],...(Array.isArray(value.suggestedReplies)?{suggestedReplies:value.suggestedReplies.filter((v):v is string=>typeof v==="string"&&v.length<=220).slice(0,3)}:{})};
  }
 }
 return createInterviewScene();
}
export function classifyInterviewTone(action:string):InterviewTone{
 if(/\b(joke|laugh|funny|humor|ridicul|clown|comed|roast|mock)\b/i.test(action))return "joke";
 if(/\b(document|proof|record|evidence|data|statistic|fact|source|report)\b/i.test(action))return "facts";
 return "question";
}
export function addInterviewExchange(scene:InterviewScene,action:string,reply:string,speaker:"host"|"Sabrina"|"audience"="host"):InterviewScene{
 if(scene.status!=="open"||!action.trim()||!reply.trim())return scene;
 const turns:InterviewTurn[]=[...scene.turns,{speaker:"player",text:action.trim().slice(0,900)},{speaker,text:reply.trim().slice(0,1100)}];
 return {...scene,tone:classifyInterviewTone(action),turns:turns.slice(-50)};
}
export function closeInterviewScene(scene:InterviewScene):InterviewScene{return {...scene,status:"finished"};}

/** One player message can be followed by several independently speaking NPCs.
 * Never invent player dialogue. Existing saves and the legacy one-speaker API remain compatible.
 */
export function appendInterviewExchange(scene:InterviewScene,action:string,guests:InterviewGuestTurn[],suggestedReplies:string[]=[]):InterviewScene{
 if(scene.status!=="open"||!action.trim())return scene;
 const valid=guests.filter(t=>t&&["host","Sabrina","audience"].includes(t.speaker)&&typeof t.text==="string"&&t.text.trim());
 if(!valid.length)return scene;
 const turns:InterviewTurn[]=[...scene.turns,{speaker:"player",text:action.trim().slice(0,700)},...valid.slice(0,3).map(t=>({speaker:t.speaker,text:t.text.trim().slice(0,1000)}))];
 return {...scene,tone:classifyInterviewTone(action),turns:turns.slice(-50),suggestedReplies:suggestedReplies.filter(v=>typeof v==="string"&&v.trim()).slice(0,3).map(v=>v.slice(0,220))};
}

/** Legacy interviews without AI-generated suggestions still show relevant, non-repeating choices. */
export function interviewSuggestedReplies(scene:InterviewScene):string[]{
 if(scene.suggestedReplies?.length)return scene.suggestedReplies;
 const last=scene.turns.at(-1)?.text??"";
 if(/Sabrina/i.test(last)&&/\?|how|what/i.test(last))return [
   "I'd like Sabrina to answer that first. She was there with me.",
   "I can tell you what I saw firsthand and what we're doing now.",
   "Before we move on, I want to address what happened to the families.",
 ];
 if(/president|Washington|government/i.test(last))return [
   "I'd like the president to explain what concrete help is being sent.",
   "Let's talk about what people on the ground actually need.",
   "I disagree with the premise of that question. Here's why.",
 ];
 return [
   "Let me answer that directly, starting with what I witnessed.",
   "I'd like to hear Sabrina's perspective on that.",
   "There's another part of this story people haven't heard yet.",
 ];
}

/** A question to Sabrina should be answered by Sabrina, without consuming a player turn. */
export function interviewNeedsGuestReply(scene:InterviewScene):boolean{
 if(scene.status!=="open")return false;
 const last=scene.turns.at(-1);
 return Boolean(last?.speaker==="host" && /\bSabrina\b/i.test(last.text) && /\?|\b(how|what|why|would|could|do you)\b/i.test(last.text));
}

export function appendInterviewGuests(scene:InterviewScene,guests:InterviewGuestTurn[],suggestedReplies:string[]=[]):InterviewScene{
 if(scene.status!=="open"||!interviewNeedsGuestReply(scene))return scene;
 const valid=guests.filter(t=>t&&["host","Sabrina","audience"].includes(t.speaker)&&typeof t.text==="string"&&t.text.trim());
 if(!valid.length||valid[0].speaker!=="Sabrina")return scene;
 return {...scene,turns:[...scene.turns,...valid.slice(0,3).map(t=>({speaker:t.speaker,text:t.text.trim().slice(0,1000)}))].slice(-50),
  suggestedReplies:suggestedReplies.filter(v=>typeof v==="string"&&v.trim()).slice(0,3).map(v=>v.slice(0,220))};
}
