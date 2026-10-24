import type { TessActivity } from "./tess-life";
import { tessLocalParts } from "./tess-life";

/** Rare, stable wake windows. A given character gets at most one selected night
 * every ~9 nights, never a new dice roll on each worker tick. */
export function overnightWake(character: string, now: Date): TessActivity | null {
 const {hour}=tessLocalParts(now);
 if(hour<0||hour>=6)return null;
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now.getTime()-6*3600000));
 const seed=[...character+date].reduce((v,c)=>(v*33+c.charCodeAt(0))>>>0,5381);
 if(seed%9!==0)return null;
 const start=1+(seed%3);
 if(hour<start||hour>=start+2)return null;
 const scenes=[
  "woke from a weird dream; may text a brief, playful half-awake observation, but never claim a romantic dream was real",
  "woke from a bad dream; may seek ordinary company without expecting immediate emotional rescue",
  "can't get back to sleep; is quietly making tea and might send a small observation",
  "the dog or street noise woke them; mildly annoyed and awake enough to text",
  "woke early with a thought from yesterday; may mention it naturally"
 ];
 const detail=scenes[Math.floor(seed/9)%scenes.length];
 if (detail === undefined) return null;
 return {activity:"unexpectedly awake at night",availability:"limited",detail};
}
