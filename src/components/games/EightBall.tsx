import { adjudicate, initialRules, type RulesState, type ShotEvents } from "@/lib/eight-ball-rules";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
type Ball={x:number;y:number;vx:number;vy:number;number:number;active:boolean};
const W=720,H=360,R=11,LEFT=34,RIGHT=686,TOP=28,BOTTOM=332;
const COLORS=["#f6d83d","#4478ca","#dc4344","#9454b8","#fa8c2e","#248a64","#873336"];
const POCKETS=[[LEFT,TOP],[(LEFT+RIGHT)/2,TOP],[RIGHT,TOP],[LEFT,BOTTOM],[(LEFT+RIGHT)/2,BOTTOM],[RIGHT,BOTTOM]];
function startBalls():Ball[]{
 const a:Ball[]=[{x:LEFT+165,y:H/2,vx:0,vy:0,number:0,active:true}];
 let n=1;for(let row=0;row<5;row++)for(let j=0;j<=row;j++){a.push({x:RIGHT-190+row*20,y:H/2-row*11+j*22,vx:0,vy:0,number:n++,active:true});}
 const center=a.find(b=>b.number===5);const eight=a.find(b=>b.number===8);if(center&&eight){center.number=8;eight.number=5;}
 return a;
}
function stationary(a:Ball[]){return a.every(b=>!b.active||Math.hypot(b.vx,b.vy)<.15);}
function integrate(a:Ball[], events:ShotEvents):Ball[]{
 const balls=a.map(b=>({...b}));
 for(const b of balls){if(!b.active)continue;b.x+=b.vx;b.y+=b.vy;b.vx*=.985;b.vy*=.985;if(Math.abs(b.vx)<.035)b.vx=0;if(Math.abs(b.vy)<.035)b.vy=0;
  const pocketIndex=POCKETS.findIndex(([x,y])=>Math.hypot(b.x-x,b.y-y)<19);if(pocketIndex>=0){events.pocketEvents??=[];events.pocketEvents.push({ball:b.number,pocket:pocketIndex});b.active=false;b.vx=0;b.vy=0;events.pocketed.push(b.number);if(b.number===0)events.cueScratch=true;continue;}
  if(b.x<LEFT+R||b.x>RIGHT-R){if(events.firstContact!==null)events.railAfterContact=true;if(b.number>0){events.railBalls??=[];if(!events.railBalls.includes(b.number))events.railBalls.push(b.number);}b.x=Math.min(RIGHT-R,Math.max(LEFT+R,b.x));b.vx*=-.86;}
  if(b.y<TOP+R||b.y>BOTTOM-R){if(events.firstContact!==null)events.railAfterContact=true;if(b.number>0){events.railBalls??=[];if(!events.railBalls.includes(b.number))events.railBalls.push(b.number);}b.y=Math.min(BOTTOM-R,Math.max(TOP+R,b.y));b.vy*=-.86;}
 }
 for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
  const a=balls[i]!,b=balls[j]!;if(!a.active||!b.active)continue;
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
 for(const b of balls){
  if(!b.active)continue;
  const n=b.number,stripe=n>=9,base=n===0?"#fff":n===8?"#171717":COLORS[(n<=7?n-1:n-9)%7];
  ctx.save();ctx.translate(b.x,b.y);ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.fillStyle=stripe?"#fff":base;ctx.fill();ctx.clip();
  if(stripe){ctx.fillStyle=base;ctx.fillRect(-R,-R*.56,R*2,R*1.12);}
  const gloss=ctx.createRadialGradient(-R*.35,-R*.43,1,0,0,R*1.6);gloss.addColorStop(0,"#ffffff55");gloss.addColorStop(1,"#00000044");ctx.fillStyle=gloss;ctx.fillRect(-R,-R,R*2,R*2);
  if(n!==0){ctx.beginPath();ctx.ellipse(0,0,n>=10?7.8:6.5,6.4,0,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
   ctx.fillStyle="#141414";ctx.font="bold 10px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(n),0,0.4);}
  ctx.restore();ctx.beginPath();ctx.arc(b.x,b.y,R,0,Math.PI*2);ctx.strokeStyle="#06150b99";ctx.lineWidth=1;ctx.stroke();
 }
 const cue=balls[0];if(aim&&cue?.active&&stationary(balls)){ctx.save();ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.strokeStyle="#fff9";ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(aim.x,aim.y);ctx.stroke();ctx.restore();}
}
export function EightBall({onFinish,onReset}:{onFinish?:(won:boolean,shots:number)=>void;onReset?:()=>void}){
 const finishedNotice=useRef(false),canvas=useRef<HTMLCanvasElement|null>(null),balls=useRef<Ball[]>(startBalls()),aim=useRef<{x:number;y:number}|null>(null),frame=useRef<number|undefined>(undefined),shots=useRef(0);
 const rules=useRef<RulesState>(initialRules()),events=useRef<ShotEvents>({firstContact:null,pocketed:[],cueScratch:false,railAfterContact:false,breakRails:0}),before=useRef<number[]>([]),opponentTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [placingCue,setPlacingCue]=useState(false),[isSafety,setIsSafety]=useState(false),[expanded,setExpanded]=useState(false),[showHelp,setShowHelp]=useState(false);
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
    if(result.winner!==null&&!finishedNotice.current){finishedNotice.current=true;onFinish?.(result.winner===1,shots.current);}
    if(!balls.current[0].active){balls.current[0]={x:LEFT+160,y:H/2,vx:0,vy:0,number:0,active:true};}
    if(result.ballInHand && result.turn===1){balls.current[0]={x:LEFT+160,y:H/2,vx:0,vy:0,number:0,active:true};setPlacingCue(true);}
    if(result.winner===null&&result.turn===2){
      if(opponentTimer.current)clearTimeout(opponentTimer.current);
      opponentTimer.current=setTimeout(()=>{
        if(!alive||rules.current.turn!==2||rules.current.winner!==null)return;
        const cue=balls.current[0]!;if(!cue.active)return;
        if(rules.current.ballInHand){
          const chosen=[{x:LEFT+160,y:H/2},{x:LEFT+130,y:H/2-70},{x:LEFT+130,y:H/2+70}].find(p=>balls.current.every(b=>!b.active||b.number===0||Math.hypot(b.x-p.x,b.y-p.y)>R*2+2));
          if(chosen){cue.x=chosen.x;cue.y=chosen.y;}
          rules.current={...rules.current,ballInHand:false};setRuleDisplay(rules.current);
        }
        const eligible=balls.current.filter(b=>b.active&&b.number>0&&b.number!==8&&(!rules.current.groups[2]||(rules.current.groups[2]==="solids"?b.number<=7:b.number>=9)));
        const targets=eligible.length?eligible:balls.current.filter(b=>b.active&&b.number===8);
        const target=targets.sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y))[0];
        if(!target)return;
        const dx=target.x-cue.x,dy=target.y-cue.y,dist=Math.hypot(dx,dy)||1;
        rules.current={...rules.current,safety:false};
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
 function reset(){onReset?.();finishedNotice.current=false;if(opponentTimer.current)clearTimeout(opponentTimer.current);rules.current=initialRules();setRuleDisplay(rules.current);setIsSafety(false);setPlacingCue(false);balls.current=startBalls();aim.current=null;shots.current=0;setShotCount(0);setRemaining(15);setRunning(false);setMessage("New rack. Drag backward from the white cue ball to aim.");}
 function release(e:PointerEvent<HTMLCanvasElement>){
  if(!aim.current)return;const p=pos(e),cue=balls.current[0];const dx=cue.x-p.x,dy=cue.y-p.y;const dist=Math.hypot(dx,dy);aim.current=null;
  if(placingCue||dist<12||!cue.active||!stationary(balls.current)||rules.current.turn!==1||rules.current.winner!==null)return;
  rules.current={...rules.current,safety:!rules.current.breakShot&&isSafety};
  before.current=balls.current.filter(b=>b.active&&b.number>0).map(b=>b.number);events.current={firstContact:null,pocketed:[],cueScratch:false,railAfterContact:false,breakRails:0};
  const speed=Math.min(12,dist*.065);cue.vx=dx/dist*speed;cue.vy=dy/dist*speed;shots.current++;setShotCount(shots.current);setRunning(true);setMessage("Balls in motion…");
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 const activeNumbers=new Set(balls.current.filter(b=>b.active).map(b=>b.number));
 const displayGroup=(group:"solids"|"stripes"|null)=>group==="solids"?"Solids · 1–7":group==="stripes"?"Stripes · 9–15":"Open table";
 const tray=(numbers:number[])=><div className="flex flex-wrap gap-1.5">{numbers.map(n=>{
  const stripe=n>=9;const color=COLORS[(stripe?n-9:n-1)%7];
  return <span key={n} aria-label={`Ball ${n} ${activeNumbers.has(n)?"on table":"pocketed"}`}
   className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/25 text-[10px] font-bold shadow-sm ${activeNumbers.has(n)?"":"opacity-25 grayscale"}`}
   style={{background:stripe?`linear-gradient(to bottom, white 25%, ${color} 25% 75%, white 75%)`:color,color:n===1||n===9?"#1f2937":"white",textShadow:n===1||n===9?"none":"0 1px 1px #222"}}>
   <span className="rounded-full bg-white px-1 text-[#111]">{n}</span>
  </span>;
 })}</div>;
 const table=<div className="overflow-hidden rounded-2xl border-4 border-[#85522e] bg-[#75482b] shadow-lg"><canvas ref={canvas} width={W} height={H} aria-label="Interactive billiards table. Solid balls have full color and stripes have white bands. Drag from the cue ball to shoot." className="block w-full touch-none"
   onPointerDown={e=>{if(placingCue&&rules.current.turn===1){const p=pos(e);const x=Math.min(RIGHT-R,Math.max(LEFT+R,p.x)),y=Math.min(BOTTOM-R,Math.max(TOP+R,p.y));if(balls.current.some(b=>b.active&&b.number!==0&&Math.hypot(b.x-x,b.y-y)<R*2+2))return;balls.current[0]={x,y,vx:0,vy:0,number:0,active:true};rules.current={...rules.current,ballInHand:false};setRuleDisplay(rules.current);setPlacingCue(false);return;}if(!running&&stationary(balls.current)&&rules.current.turn===1&&rules.current.winner===null){aim.current=pos(e);e.currentTarget.setPointerCapture(e.pointerId)}}}
   onPointerMove={e=>{if(aim.current)aim.current=pos(e)}} onPointerUp={release} onPointerCancel={()=>{aim.current=null;}}/></div>;
 return <section className="mt-4 space-y-3" aria-label="8 Ball pool">
  <div className="flex items-center justify-between gap-2">
   <div><h2 className="text-lg font-bold">8 Ball</h2><p className="text-xs text-muted-foreground">{shotCount} shots · {remaining} balls left</p></div>
   <button type="button" aria-label={expanded?"Close large pool table":"Expand pool table"} className="flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium" onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>} {expanded?"Close":"Larger table"}</button>
  </div>
  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/70 p-3 text-sm">
   <div><p className="mb-1 font-semibold">You</p><p className="mb-2 text-xs">{displayGroup(ruleDisplay.groups[1])}</p>{tray(ruleDisplay.groups[1]==="stripes"?[9,10,11,12,13,14,15]:[1,2,3,4,5,6,7])}</div>
   <div><p className="mb-1 font-semibold">Opponent</p><p className="mb-2 text-xs">{displayGroup(ruleDisplay.groups[2])}</p>{tray(ruleDisplay.groups[2]==="solids"?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15])}</div>
  </div>
  <div className={expanded?"fixed inset-0 z-[100] flex flex-col justify-center gap-3 bg-[#101b18] p-3 text-white":"space-y-2"}>
   {expanded&&<div className="flex items-center justify-between"><strong>8 Ball · Large table</strong><button type="button" onClick={()=>setExpanded(false)} className="rounded-xl bg-white/15 px-4 py-2">Close</button></div>}
   {table}
   {expanded&&<p className="text-center text-xs text-white/80">Rotate your phone for the biggest table. Pull back from the white ball, then release.</p>}
  </div>
  <div className="rounded-xl border bg-card p-3 text-sm" aria-live="polite">
   <p className="font-semibold">{ruleDisplay.winner!==null?(ruleDisplay.winner===1?"You win!":"Opponent wins!"):(running?"Balls moving…":ruleDisplay.turn===1?"Your turn":"Opponent turn")}</p>
   <p className="mt-1 text-muted-foreground">{ruleDisplay.ballInHand?"Ball in hand · ":""}{message}</p>
  </div>
  {placingCue&&ruleDisplay.turn===1&&<p className="rounded-lg border p-3 text-sm">Ball in hand: tap an open position on the table to place the cue ball.</p>}
  {!ruleDisplay.breakShot&&ruleDisplay.turn===1&&ruleDisplay.winner===null&&<label className="flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm"><input type="checkbox" checked={isSafety} onChange={e=>setIsSafety(e.target.checked)}/> Play a safety shot</label>}
  <div className="flex gap-2"><button type="button" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm" onClick={reset}><RotateCcw size={16}/> Re-rack</button><button type="button" className="min-h-11 flex-1 rounded-xl border text-sm" aria-expanded={showHelp} onClick={()=>setShowHelp(v=>!v)}>{showHelp?"Hide rules":"How to play"}</button></div>
  {showHelp&&<div className="rounded-xl bg-muted p-3 text-sm"><p>Drag backward from the white cue ball to aim and set power. Release to shoot. Solid balls are 1–7, stripes are 9–15. Pocket your group, then the black 8. No called shots. Scratches and illegal first hits are fouls.</p><p className="mt-2 text-xs text-muted-foreground">Physics and stroke-foul simulation are simplified.</p></div>}
 </section>;
}
