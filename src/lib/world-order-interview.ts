/** Persistent, multi-turn televised interview. The user—not an option click—
 * decides when the broadcast ends.
 */
export type InterviewTone="question"|"joke"|"facts";
export type InterviewTurn={speaker:"host"|"player"|"Sabrina"|"audience";text:string};
export type InterviewScene={status:"open"|"finished";tone:InterviewTone;turns:InterviewTurn[]};
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
   return {status:value.status,tone:["question","joke","facts"].includes(value.tone??"")?value.tone!:"question",turns:turns.length?turns:[OPENING]};
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
