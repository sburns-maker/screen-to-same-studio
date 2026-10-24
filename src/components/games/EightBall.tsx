import { adjudicate, initialRules, type RulesState, type ShotEvents } from "@/lib/eight-ball-rules";
import { useEffect, useRef, useState, type PointerEvent } from "react";
type Ball={x:number;y:number;vx:number;vy:number;number:number;active:boolean};
const W=720,H=360,R=10,LEFT=34,RIGHT=686,TOP=28,BOTTOM=332;
const POCKETS=[[LEFT,TOP],[(LEFT+RIGHT)/2,TOP],[RIGHT,TOP],[LEFT,BOTTOM],[(LEFT+RIGHT)/2,BOTTOM],[RIGHT,BOTTOM]];
function startBalls():Ball[]{
 const a:Ball[]=[{x:LEFT+165,y:H/2,vx:0,vy:0,number:0,active:true}];
 let n=1;for(let row=0;row<5;row++)for(let j=0;j<=row;j++){a.push({x:RIGHT-190+row*18,y:H/2-row*10+j*20,vx:0,vy:0,number:n++,active:true});}
 return a;
}
function stationary(a:Ball[]){return a.every(b=>!b.active||Math.hypot(b.vx,b.vy)<.15);}
function integrate(a:Ball[], events:ShotEvents):Ball[]{
 const balls=a.map(b=>({...b}));
 for(const b of balls){if(!b.active)continue;b.x+=b.vx;b.y+=b.vy;b.vx*=.985;b.vy*=.985;if(Math.abs(b.vx)<.035)b.vx=0;if(Math.abs(b.vy)<.035)b.vy=0;
  const pocketIndex=POCKETS.findIndex(([x,y])=>Math.hypot(b.x-x,b.y-y)<19);if(pocketIndex>=0){events.pocketEvents??=[];events.pocketEvents.push({ball:b.number,pocket:pocketIndex});b.active=false;b.vx=0;b.vy=0;events.pocketed.push(b.number);if(b.number===0)events.cueScratch=true;continue;}
  if(b.x<LEFT+R||b.x>RIGHT-R){if(events.firstContact!==null)events.railAfterContact=true;else if(b.number!==0)events.breakRails++;b.x=Math.min(RIGHT-R,Math.max(LEFT+R,b.x));b.vx*=-.86;}
  if(b.y<TOP+R||b.y>BOTTOM-R){if(events.firstContact!==null)events.railAfterContact=true;else if(b.number!==0)events.breakRails++;b.y=Math.min(BOTTOM-R,Math.max(TOP+R,b.y));b.vy*=-.86;}
 }
 for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
  const a=balls[i],b=balls[j];if(!a.active||!b.active)continue;
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<=0||d>=R*2)continue;
  if(events.firstContact===null && (a.number===0||b.number===0)){events.firstContact=a.number===0?b.number:a.number;}
  const nx=dx/d,ny=dy/d,overlap=(R*2-d)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
  const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(relative<0){const force=relative*.94;a.vx+=nx*force;a.vy+=ny*force;b.vx-=nx*force;b.vy-=ny*force;}
 }
 return balls;
}
function paint(ctx:CanvasRenderingContext2D,balls:Ball[],aim:{x:number;y:number}|null){
 ctx.clearRect(0,0,W,H);ctx.fillStyle="#75482b";ctx.fillRect(0,0,W,H);
 ctx.fillStyle="#145b36";ctx.fillRect(LEFT-14,TOP-14,RIGHT-LEFT+28,BOTTOM-TOP+28);
 ctx.fillStyle="#0d8150";ctx.fillRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
 for(const [x,y] of POCKETS){ctx.beginPath();ctx.arc(x,y,19,0,Math.PI*2);ctx.fillStyle="#151515";ctx.fill();}
 for(const b of balls){if(!b.active)continue;ctx.beginPath();ctx.arc(b.x,b.y,R,0,Math.PI*2);ctx.fillStyle=b.number===0?"#fff":b.number===8?"#222":b.number<=7?["#f6d83d","#4478ca","#d94444","#9b65b9","#ff912e","#37a86e","#832e2e"][(b.number-1)%7]:["#f6d83d","#4478ca","#d94444","#9b65b9","#ff912e","#37a86e","#832e2e"][(b.number-9)%7];ctx.fill();ctx.lineWidth=1;ctx.strokeStyle="#2228";ctx.stroke();if(b.number!==0){ctx.font="8px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=b.number===8?"white":"#191919";ctx.fillText(String(b.number),b.x,b.y);}}
 const cue=balls[0];if(aim&&cue?.active&&stationary(balls)){ctx.save();ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.strokeStyle="#fff9";ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(aim.x,aim.y);ctx.stroke();ctx.restore();}
}
export function EightBall(){
 const canvas=useRef<HTMLCanvasElement|null>(null),balls=useRef<Ball[]>(startBalls()),aim=useRef<{x:number;y:number}|null>(null),frame=useRef<number|undefined>(undefined),shots=useRef(0);
 const rules=useRef<RulesState>(initialRules()),events=useRef<ShotEvents>({firstContact:null,pocketed:[],cueScratch:false,railAfterContact:false,breakRails:0}),before=useRef<number[]>([]),opponentTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [callBall,setCallBall]=useState(1),[callPocket,setCallPocket]=useState(0),[isSafety,setIsSafety]=useState(false);
 const [ruleDisplay,setRuleDisplay]=useState<RulesState>(initialRules()),[shotCount,setShotCount]=useState(0),[remaining,setRemaining]=useState(15),[running,setRunning]=useState(false),[message,setMessage]=useState("Drag backward from the cue ball to aim and set power.");
 useEffect(()=>{
  let alive=true;let ticks=0;
  function loop(){if(!alive)return;const b=balls.current;if(!stationary(b)){for(let k=0;k<3;k++)balls.current=integrate(balls.current,events.current);ticks++;}
   if(ticks>0&&stationary(balls.current)){ticks=0;setRunning(false);setRemaining(balls.current.filter(x=>x.active&&x.number!==0).length);
    const wasBreak=rules.current.breakShot;
    const result=adjudicate(rules.current,events.current,before.current);
    if(wasBreak && events.current.pocketed.includes(8)){
      balls.current=startBalls();rules.current=initialRules();setRuleDisplay(rules.current);setMessage("8 ball on break: re-racked automatically. Break again.");setRemaining(15);setRunning(false);
      const ctx=canvas.current?.getContext("2d");if(ctx)paint(ctx,balls.current,null);
      frame.current=requestAnimationFrame(loop);return;
    }
    rules.current=result;setRuleDisplay(result);setMessage(result.status);
    if(!balls.current[0].active){balls.current[0]={x:LEFT+160,y:H/2,vx:0,vy:0,number:0,active:true};}
    if(result.ballInHand && result.turn===1)balls.current[0]={x:LEFT+160,y:H/2,vx:0,vy:0,number:0,active:true};
    if(result.winner===null&&result.turn===2){
      if(opponentTimer.current)clearTimeout(opponentTimer.current);
      opponentTimer.current=setTimeout(()=>{
        if(!alive||rules.current.turn!==2||rules.current.winner!==null)return;
        const cue=balls.current[0];if(!cue.active)return;
        const eligible=balls.current.filter(b=>b.active&&b.number>0&&b.number!==8&&(!rules.current.groups[2]||(rules.current.groups[2]==="solids"?b.number<=7:b.number>=9)));
        const targets=eligible.length?eligible:balls.current.filter(b=>b.active&&b.number===8);
        const target=targets.sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y))[0];
        if(!target)return;
        const dx=target.x-cue.x,dy=target.y-cue.y,dist=Math.hypot(dx,dy)||1;
        before.current=balls.current.filter(b=>b.active&&b.number>0).map(b=>b.number);
        events.current={firstContact:null,pocketed:[],cueScratch:false,railAfterContact:false,breakRails:0};
        cue.vx=(dx/dist)*7.8;cue.vy=(dy/dist)*7.8;setRunning(true);setMessage("Opponent shoots…");
      },700);
    }
   }
   const ctx=canvas.current?.getContext("2d");if(ctx)paint(ctx,balls.current,aim.current);frame.current=requestAnimationFrame(loop);
  }
  loop();return()=>{alive=false;if(frame.current!==undefined)cancelAnimationFrame(frame.current);if(opponentTimer.current)clearTimeout(opponentTimer.current)};
 },[]);
 function pos(e:PointerEvent<HTMLCanvasElement>){const box=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-box.left)*W/box.width,y:(e.clientY-box.top)*H/box.height}}
 function reset(){if(opponentTimer.current)clearTimeout(opponentTimer.current);rules.current=initialRules();setRuleDisplay(rules.current);setCallBall(1);setCallPocket(0);setIsSafety(false);balls.current=startBalls();aim.current=null;shots.current=0;setShotCount(0);setRemaining(15);setRunning(false);setMessage("New rack. Drag backward from the white cue ball to aim.");}
 function release(e:PointerEvent<HTMLCanvasElement>){
  if(!aim.current)return;const p=pos(e),cue=balls.current[0];const dx=cue.x-p.x,dy=cue.y-p.y;const dist=Math.hypot(dx,dy);aim.current=null;
  if(dist<12||!cue.active||!stationary(balls.current)||rules.current.turn!==1||rules.current.winner!==null)return;
  rules.current={...rules.current,calledBall:rules.current.breakShot?null:callBall,calledPocket:rules.current.breakShot?null:callPocket,safety:!rules.current.breakShot&&isSafety};
  before.current=balls.current.filter(b=>b.active&&b.number>0).map(b=>b.number);events.current={firstContact:null,pocketed:[],cueScratch:false,railAfterContact:false,breakRails:0};
  const speed=Math.min(12,dist*.065);cue.vx=dx/dist*speed;cue.vy=dy/dist*speed;shots.current++;setShotCount(shots.current);setRunning(true);setMessage("Balls in motion…");
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 return <section className="mt-6 space-y-4" aria-label="8 Ball pool">
  <div className="rounded-xl bg-muted p-4"><h2 className="font-semibold">8 Ball · Pool table</h2><p className="text-sm text-muted-foreground">Interactive physics practice table. Aim by pulling back from the white cue ball and release to shoot.</p><div className="mt-2 flex justify-between text-sm"><span>Shots: {shotCount}</span><span>Object balls left: {remaining}</span></div></div>
  {!ruleDisplay.breakShot && ruleDisplay.turn===1 && ruleDisplay.winner===null && <div className="rounded-xl border p-3 space-y-3">
   <p className="font-semibold">Call your shot</p>
   <label className="flex items-center gap-2 text-sm">Ball <select aria-label="Called ball" value={callBall} onChange={e=>setCallBall(Number(e.target.value))} className="min-h-11 flex-1 rounded-lg border bg-background px-2">{Array.from({length:15},(_,i)=>i+1).filter(n=>balls.current.some(b=>b.active&&b.number===n)).map(n=><option key={n} value={n}>Ball {n}</option>)}</select></label>
   <label className="flex items-center gap-2 text-sm">Pocket <select aria-label="Called pocket" value={callPocket} onChange={e=>setCallPocket(Number(e.target.value))} className="min-h-11 flex-1 rounded-lg border bg-background px-2">{["Top left","Top middle","Top right","Bottom left","Bottom middle","Bottom right"].map((label,i)=><option key={label} value={i}>{label}</option>)}</select></label>
   <label className="flex items-center min-h-10 gap-2 text-sm"><input type="checkbox" checked={isSafety} onChange={e=>setIsSafety(e.target.checked)}/> Call safety (turn passes)</label>
  </div>}
  <div className="overflow-hidden rounded-xl border bg-[#75482b]"><canvas ref={canvas} width={W} height={H} aria-label="Interactive billiards table; drag to take a shot" className="block w-full touch-none"
   onPointerDown={e=>{if(!running&&stationary(balls.current)&&rules.current.turn===1&&rules.current.winner===null){aim.current=pos(e);e.currentTarget.setPointerCapture(e.pointerId)}}}
   onPointerMove={e=>{if(aim.current)aim.current=pos(e)}} onPointerUp={release} onPointerCancel={()=>{aim.current=null;}}/></div>
  <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">{ruleDisplay.winner!==null?(ruleDisplay.winner===1?"You win!":"Opponent wins!"):(ruleDisplay.turn===1?"Your turn":"Opponent turn")}</p><p>Yours: {ruleDisplay.groups[1]??"open table"} · Opponent: {ruleDisplay.groups[2]??"open table"}</p><p>{ruleDisplay.ballInHand?"Ball in hand · ":""}{message}</p></div>
  <button type="button" className="min-h-12 w-full rounded-xl border" onClick={reset}>Re-rack balls</button>
  <p className="text-xs text-muted-foreground">Rule-based prototype with called shots and safeties; simplified physics still cannot automatically identify every physical foul.</p>
 </section>;
}
