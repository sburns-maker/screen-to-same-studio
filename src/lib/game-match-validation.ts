import { QUESTION_BANK } from "./game-trivia";
export type Verdict={outcome:"win"|"loss"|"draw";player:number;opponent:number};
export function trivia(p:unknown):Verdict|null {
 const s=p as {deck?:unknown;answers?:unknown;characterKey?:unknown};
 if(!Array.isArray(s?.deck)||s.deck.length!==10||!Array.isArray(s.answers)||s.answers.length!==10)return null;
 if(new Set(s.deck).size!==10 || s.deck.some(n=>!Number.isInteger(n)||n<0||n>=QUESTION_BANK.length))return null;
 if(s.answers.some(n=>!Number.isInteger(n)||n<0||n>3))return null;
 const key=typeof s.characterKey==="string"?s.characterKey:"";
 const player=s.answers.filter((n,i)=>n===QUESTION_BANK[s.deck[i]].correct).length;
 const opponent=s.deck.filter((n,i)=>{const q=QUESTION_BANK[n];const favored=key==="maya"?"Movies":key==="tess"?"Science":"";return (i*7+q.question.length+key.length)%10<(q.category===favored?8:6);}).length;
 return {outcome:player>opponent?"win":player<opponent?"loss":"draw",player,opponent};
}
export function boardVerdict(p:unknown):Verdict|null {
 const s=p as {moves?:unknown};
 if(!Array.isArray(s?.moves)||s.moves.length<1||s.moves.length>42||s.moves.some(n=>!Number.isInteger(n)||n<0||n>6))return null;
 const b=Array(42).fill(0) as number[];
 const at=(r:number,c:number)=>r*7+c;
 const won=()=>{for(let r=0;r<6;r++)for(let c=0;c<7;c++){const v=b[at(r,c)];if(!v)continue;for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]])if(Array.from({length:4},(_,k)=>[r+k*dr,c+k*dc]).every(([rr,cc])=>rr>=0&&rr<6&&cc>=0&&cc<7&&b[at(rr,cc)]===v))return v;}return b.every(Boolean)?3:0;};
 const place=(col:number,player:number)=>{for(let r=5;r>=0;r--)if(!b[at(r,col)]){b[at(r,col)]=player;return true;}return false;};
 let end=0;
 const candidate=(column:number,player:number)=>{const copy=[...b];for(let r=5;r>=0;r--)if(!copy[at(r,column)]){copy[at(r,column)]=player;break;}for(let r=0;r<6;r++)for(let c=0;c<7;c++){const v=copy[at(r,c)];if(!v)continue;for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]])if(Array.from({length:4},(_,k)=>[r+k*dr,c+k*dc]).every(([rr,cc])=>rr>=0&&rr<6&&cc>=0&&cc<7&&copy[at(rr,cc)]===v))return v;}return 0;};
 const computerMove=()=>{const legal=[3,2,4,1,5,0,6].filter(c=>b.some((v,i)=>i%7===c&&v===0));for(const player of [2,1]){const c=legal.find(col=>candidate(col,player)===player);if(c!==undefined)return c;}return legal[0]??-1;};
 for(let i=0;i<s.moves.length;i++){
  const player=i%2===0?1:2;
  if(end!==0 || (player===2 && s.moves[i]!==computerMove()) || !place(s.moves[i],player))return null;
  end=won();
 }
 if(!end)return null;
 return {outcome:end===3?"draw":end===1?"win":"loss",player:end===1?1:0,opponent:end===2?1:0};
}
