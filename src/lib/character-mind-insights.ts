import { STATE_KEYS, type TessState } from "./tess-logic";
import { claireMindPossibility } from "./claire-romantic-arc";
export type MindMemory={memory_type:string;summary:string;importance:number;created_at:string};
export function mindSummary(state:TessState,stage:string,characterKey?:string){
 const notes:string[]=[];
 if(characterKey==="claire"){
   const possibility=claireMindPossibility(state);
   if(possibility)notes.push(possibility);
 }
 if(state.comfort>=85&&state.romantic_intent<20)notes.push("Very comfortable, but comfort is not the same as wanting a relationship.");
 if(state.emotional_intimacy>=45)notes.push("Meaningful personal familiarity is established.");
 if(state.romantic_attraction>=50&&state.romantic_intent<25)notes.push("Attraction and a decision to pursue dating are separate; intent is still limited.");
 if(state.perceived_pressure>=30)notes.push("Perceived pressure is elevated; pushing for reassurance may be counterproductive.");
 if(state.irritation>=30)notes.push("Recent friction may be influencing responses.");
 if(state.trust<30)notes.push("Trust remains relatively early even when conversation feels warm.");
 if(!notes.length)notes.push("No striking relationship-state imbalance is currently recorded. Look at recent events, not just scores.");
 return {stage,notes};
}
export function recentMindChanges(delta:Record<string,unknown>){
 return STATE_KEYS.map(key=>({key,value:Number(delta[key]??0)})).filter(v=>Number.isFinite(v.value)&&v.value!==0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
}
export function datedMemories(memories:MindMemory[]){
 return [...memories].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
}
