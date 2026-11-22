export type BackstageTurn={ speaker:"player"|"Sabrina"|"security"|"staff"; text:string };
export type BackstageScene={ status:"open"|"finished"; turns:BackstageTurn[]; continuity?:LiveSceneContinuity };
export function openBackstageScene():BackstageScene {
 return {status:"open",continuity:{location:"backstage",establishedFacts:["The initial concert attacker was detained. Sabrina survived the first rescue."]},turns:[{
  speaker:"Sabrina",
  text:"The dressing-room door closes behind you. Sabrina sits on the edge of the couch, still shaking. A security guard confirms the attacker has been detained. She looks up at you. \"You stayed. Are you okay? I don't even know your name.\"",
 }]};
}
export function restoreBackstageScene(value:unknown,rescued:boolean,interviewFinished:boolean):BackstageScene|null {
 if(value&&typeof value==="object"){
  const scene=value as Partial<BackstageScene>;
  if(scene.status==="open"||scene.status==="finished"){
   const turns=Array.isArray(scene.turns)?scene.turns.filter(t=>t && ["player","Sabrina","security","staff"].includes(t.speaker) && typeof t.text==="string").slice(-40):[];
   const known=scene.continuity && typeof scene.continuity==="object" && Array.isArray(scene.continuity.establishedFacts) && ["backstage","in vehicle","Havana streets / military checkpoint","military airfield"].includes(scene.continuity.location) ? scene.continuity : undefined;
   return {status:scene.status,turns:turns.length?turns:openBackstageScene().turns,continuity:known??deriveLiveSceneContinuity(turns)};
  }
 }
 // Upgrade a fresh Day-2 save without resetting reactions or existing DMs.
 return rescued&&!interviewFinished?openBackstageScene():null;
}
export function appendBackstageTurn(scene:BackstageScene,speaker:BackstageTurn["speaker"],text:string):BackstageScene {
 if(scene.status!=="open"||!text.trim())return scene;
 const continuity=speaker==="player"?deriveLiveSceneContinuity([],text,scene.continuity??deriveLiveSceneContinuity(scene.turns)):scene.continuity;
 return {...scene,turns:[...scene.turns,{speaker,text:text.trim().slice(0,900)}].slice(-40),continuity};
}
export function finishBackstageScene(scene:BackstageScene):BackstageScene {
 return {...scene,status:"finished"};
}

/** The player can leave the original dressing room without ending the live scene.
 * Derive location from established player actions, NOT from stale narrator replies.
 * Never infer that a destination has been reached merely because it was discussed.
 */
export type LiveSceneLocation="backstage"|"in vehicle"|"Havana streets / military checkpoint"|"military airfield";
export type LiveSceneContinuity={location:LiveSceneLocation; establishedFacts:string[]};
export function deriveLiveSceneContinuity(turns:BackstageTurn[],nextAction:string="",baseline?:LiveSceneContinuity):LiveSceneContinuity {
 let location:LiveSceneLocation=baseline?.location??"backstage";
 const facts=new Set<string>(baseline?.establishedFacts??["The initial concert attacker was detained. Sabrina survived the first rescue."]);
 const actions=baseline?[nextAction]:[...turns.filter(t=>t.speaker==="player").map(t=>t.text),nextAction];
 for(const action of actions){
  if(!action)continue;
  if(/\b(?:Havana|Cuba)\b/i.test(action))facts.add("The concert and subsequent events take place in Havana, Cuba.");
  if(/(?:second|another)\s+(?:gunman|attacker)|(?:gunman|attacker)[^.]{0,45}(?:backstage|dressing.room)/i.test(action))facts.add("A second armed attacker entered the dressing room; that confrontation has already happened.");
  if(/(?:driver|chauffeur)[^.]{0,95}(?:shot|hit|wounded)|(?:shot|hit|wounded)[^.]{0,95}(?:driver|chauffeur)/i.test(action))facts.add("The escape driver was shot during the flight from the concert.");
  if(/(?:driver|wounded man)[^.]{0,95}(?:medic|ambulance|taken away)|(?:medic|ambulance)[^.]{0,95}(?:driver|wounded man)/i.test(action))facts.add("Military medics evacuated the wounded driver.");
  if(/(?:military (?:unit|units)|soldiers)[^.]{0,95}(?:fire on|firing on|shoot at|shooting at|against|each other)|(?:military|soldier)[^.]{0,100}(?:split|fight each other)/i.test(action))facts.add("Two military units began fighting each other at a Havana checkpoint.");
  if(/(?:security (?:team|guard)|last guard)[^.]{0,90}(?:lost|disappear|missing)|(?:lost|lose)[^.]{0,70}(?:security|guard)/i.test(action))facts.add("Sabrina's security team was lost in the chaos; the last guard's fate is unknown.");
  if(/(?:grab|pick up|take|raise)[^.]{0,45}(?:rifle|gun)|(?:rifle|gun)[^.]{0,40}(?:grab|raise)/i.test(action))facts.add("The player has taken possession of a weapon during the checkpoint escape.");
  if(/(?:climb|jump|get|duck)[^.]{0,40}(?:into|inside) (?:the|her|a) (?:car|vehicle)|(?:take (?:over|the) wheel|start driving|drive (?:through|away|down|toward))/i.test(action))location="in vehicle";
  if(/(?:checkpoint|military unit|soldiers? (?:appear|approach)|concrete wall|behind (?:the|a) wall|armed soldiers|across the street|street fighting|rifle|raise the rifle)/i.test(action))location="Havana streets / military checkpoint";
  if(/(?:reach|arrive at|enter|land at) (?:the |a )?(?:military )?(?:airfield|airport)/i.test(action))location="military airfield";
 }
 return {location,establishedFacts:[...facts]};
}

/** A conservative guard for location-specific continuity failures. */
export function contradictsSceneLocation(reply:string,location:LiveSceneLocation):boolean {
 if(location==="backstage")return false;
 if(/\b(?:we(?:'re| are) backstage|back in (?:the )?(?:dressing room|backstage)|dressing.room door closes|couch (?:in the dressing room|backstage)|still (?:in|at) the dressing room)\b/i.test(reply))return true;
 if(location==="Havana streets / military checkpoint" && /\b(?:the (?:concert )?attacker(?:'s| is) detained|security guard (?:remains|stands) (?:outside|by) the (?:dressing.room )?door)\b/i.test(reply))return true;
 return false;
}
