export type Group = "solids" | "stripes";
export type Player = 1 | 2;
export type RulesState = { turn: Player; groups: {1:Group|null;2:Group|null}; breakShot:boolean; winner:Player|null; ballInHand:boolean; status:string };
export type ShotEvents = { firstContact:number|null; pocketed:number[]; cueScratch:boolean; railAfterContact:boolean; breakRails:number };
export const initialRules = ():RulesState=>({turn:1,groups:{1:null,2:null},breakShot:true,winner:null,ballInHand:false,status:"Break shot: pocket a ball or drive four object balls to a rail."});
const groupOf=(number:number):Group|null=>number>=1&&number<=7?"solids":number>=9&&number<=15?"stripes":null;
export function adjudicate(state:RulesState,shot:ShotEvents,remainingBefore:number[]):RulesState{
 if(state.winner!==null)return state;
 const you=state.turn,other:Player=you===1?2:1;
 const selected=state.groups[you],pocket=shot.pocketed.filter(n=>n>0&&n!==8),first=shot.firstContact;
 const legal8=selected!==null&&!remainingBefore.some(n=>groupOf(n)===selected);
 let foul:string|null=null;
 if(shot.cueScratch)foul="Cue-ball scratch";
 else if(first===null)foul="No object ball contacted";
 else if(state.breakShot){
  if(!pocket.length&&shot.breakRails<4)foul="Illegal break (fewer than four rail contacts)";
 }else{
  if(selected!==null&&groupOf(first)!==selected&&!(legal8&&first===8))foul="Wrong first ball contacted";
  if(!foul&&!pocket.length&&!shot.railAfterContact)foul="No pocket or rail after contact";
 }
 if(shot.pocketed.includes(8)){
  if(state.breakShot)return {...state,turn:other,breakShot:false,ballInHand:true,status:"8 ball pocketed on break: spot the 8 and replay is required (prototype adjudication)."};
  if(foul||!legal8)return {...state,winner:other,status:"Loss: 8 ball pocketed illegally."};
  return {...state,winner:you,status:"8 ball pocketed legally. You win!"};
 }
 let groups=state.groups;
 if(!state.breakShot&&!foul&&!selected){
  const firstPocket=pocket.find(n=>groupOf(n)!==null);
  const assign=firstPocket?groupOf(firstPocket):null;
  if(assign)groups={...groups,[you]:assign,[other]:assign==="solids"?"stripes":"solids"};
 }
 const retained=!foul&&pocket.some(n=>selected?groupOf(n)===selected:groupOf(n)!==null);
 const next=retained?you:other;
 return {turn:next,groups,breakShot:false,winner:null,ballInHand:!!foul,status:foul?`Foul: ${foul}. Ball in hand for ${next===1?"you":"opponent"}.`:retained?"Legal pocket: shoot again.":"Turn passes to the other player."};
}
