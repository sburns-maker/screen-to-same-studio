export type Group = "solids" | "stripes";
export type Player = 1 | 2;
export type RulesState = { turn: Player; groups: {1:Group|null;2:Group|null}; breakShot:boolean; winner:Player|null; ballInHand:boolean; status:string; calledBall?:number|null; calledPocket?:number|null; safety?:boolean };
export type ShotEvents = { firstContact:number|null; pocketed:number[]; cueScratch:boolean; railAfterContact:boolean; breakRails:number; pocketEvents?:Array<{ball:number;pocket:number}>; offTable?:number[]; foulReasons?:string[]; railBalls?:number[] };
export const initialRules = ():RulesState=>({turn:1,groups:{1:null,2:null},breakShot:true,winner:null,ballInHand:false,status:"Break shot: pocket a ball or drive four object balls to a rail.",calledBall:null,calledPocket:null,safety:false});
const groupOf=(number:number):Group|null=>number>=1&&number<=7?"solids":number>=9&&number<=15?"stripes":null;
export function adjudicate(state:RulesState,shot:ShotEvents,remainingBefore:number[]):RulesState{
 if(state.winner!==null)return state;
 const you=state.turn,other:Player=you===1?2:1;
 const selected=state.groups[you],pocket=shot.pocketed.filter(n=>n>0&&n!==8),first=shot.firstContact;
 const legal8=selected!==null&&!remainingBefore.some(n=>groupOf(n)===selected);
 const callMade=shot.pocketEvents?.some(p=>p.ball===state.calledBall&&p.pocket===state.calledPocket)??false;
 let foul:string|null=null;
 if(shot.cueScratch)foul="Cue-ball scratch";
 else if(shot.offTable?.length)foul="Ball driven off the table";
 else if(shot.foulReasons?.length)foul=shot.foulReasons[0];
 else if(first===null)foul="No object ball contacted";
 else if(state.breakShot){
  if(!pocket.length&&(shot.railBalls?.length??shot.breakRails)<4)foul="Illegal break (fewer than four rail contacts)";
 }else{
  if(selected===null&&first===8)foul="8 ball contacted first on open table";
  if(selected!==null&&groupOf(first)!==selected&&!(legal8&&first===8))foul="Wrong first ball contacted";
  if(!foul&&!shot.pocketed.length&&!shot.railAfterContact)foul="No pocket or rail after contact";
 }
 if(shot.offTable?.includes(8)&&!state.breakShot)return {...state,winner:other,status:"Loss: 8 ball driven off table."};
 if(shot.pocketed.includes(8)){
  if(state.breakShot)return {...state,turn:other,breakShot:false,ballInHand:true,status:"8 ball pocketed on break: re-rack required (not scored as a win)."};
  if(foul||!legal8||!callMade)return {...state,winner:other,status:"Loss: 8 ball pocketed illegally."};
  return {...state,winner:you,status:"8 ball pocketed legally. You win!"};
 }
 let groups=state.groups;
 if(!state.breakShot&&!foul&&!selected){
  const firstPocket=callMade?state.calledBall:null;
  const assign=firstPocket?groupOf(firstPocket):null;
  if(assign)groups={...groups,[you]:assign,[other]:assign==="solids"?"stripes":"solids"};
 }
 const retained=!foul&&!state.safety&&(state.breakShot?pocket.length>0:callMade&&groupOf(state.calledBall??0)===(selected??groupOf(state.calledBall??0)));
 const next=retained?you:other;
 return {turn:next,groups,breakShot:false,winner:null,ballInHand:!!foul,calledBall:null,calledPocket:null,safety:false,status:foul?`Foul: ${foul}. Ball in hand for ${next===1?"you":"opponent"}.`:retained?"Legal pocket: shoot again.":"Turn passes to the other player."};
}
