export type BackstageTurn={ speaker:"player"|"Sabrina"|"security"|"staff"; text:string };
export type BackstageScene={ status:"open"|"finished"; turns:BackstageTurn[] };
export function openBackstageScene():BackstageScene {
 return {status:"open",turns:[{
  speaker:"Sabrina",
  text:"The dressing-room door closes behind you. Sabrina sits on the edge of the couch, still shaking. A security guard confirms the attacker has been detained. She looks up at you. \"You stayed. Are you okay? I don't even know your name.\"",
 }]};
}
export function restoreBackstageScene(value:unknown,rescued:boolean,interviewFinished:boolean):BackstageScene|null {
 if(value&&typeof value==="object"){
  const scene=value as Partial<BackstageScene>;
  if(scene.status==="open"||scene.status==="finished"){
   const turns=Array.isArray(scene.turns)?scene.turns.filter(t=>t && ["player","Sabrina","security","staff"].includes(t.speaker) && typeof t.text==="string").slice(-40):[];
   return {status:scene.status,turns:turns.length?turns:openBackstageScene().turns};
  }
 }
 // Upgrade a fresh Day-2 save without resetting reactions or existing DMs.
 return rescued&&!interviewFinished?openBackstageScene():null;
}
export function appendBackstageTurn(scene:BackstageScene,speaker:BackstageTurn["speaker"],text:string):BackstageScene {
 if(scene.status!=="open"||!text.trim())return scene;
 return {...scene,turns:[...scene.turns,{speaker,text:text.trim().slice(0,900)}].slice(-40)};
}
export function finishBackstageScene(scene:BackstageScene):BackstageScene {
 return {...scene,status:"finished"};
}
