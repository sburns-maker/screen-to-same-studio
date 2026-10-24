/** Grounded Altoona / Blair County setting anchors. Not an opening-hours database.
 * Verify public hours and scheduled events at runtime before making definite claims. */
export type AltoonaPlace={name:string;area:string;kind:string;address:string;ideas:string[];seasonal?:boolean};
export const ALTOONA_PLACES:AltoonaPlace[]=[
{name:"Mishler Theatre",area:"Downtown Altoona",kind:"arts",address:"1212 12th Avenue, Altoona, PA",ideas:["theater performances","concerts","evening plans"]},
{name:"Railroaders Memorial Museum",area:"Downtown Altoona",kind:"museum",address:"1200 9th Avenue, Altoona, PA",ideas:["railroad history","museum visit"]},
{name:"Horseshoe Curve",area:"West of Altoona",kind:"landmark",address:"2400 Veterans Memorial Highway, Altoona, PA",ideas:["train watching","railroad history","scenic overlook"]},
{name:"Baker Mansion",area:"Altoona",kind:"museum",address:"3419 Oak Lane, Altoona, PA",ideas:["local history","historic home tour"]},
{name:"Southern Alleghenies Museum of Art",area:"Downtown Altoona",kind:"arts",address:"1210 11th Avenue, Altoona, PA",ideas:["art exhibits","quiet cultural outing"]},
{name:"Peoples Natural Gas Field",area:"Altoona",kind:"sports",address:"1000 Park Avenue, Altoona, PA",ideas:["Altoona Curve baseball","stadium events"],seasonal:true},
{name:"Fort Roberdeau",area:"Sinking Valley",kind:"history",address:"383 Fort Roberdeau Road, Altoona, PA",ideas:["historic tours","stargazing programs","walking trails"]},
{name:"Canoe Creek State Park",area:"Hollidaysburg",kind:"outdoors",address:"205 Canoe Creek Road, Hollidaysburg, PA",ideas:["hiking","lake","picnics"]},
{name:"Chimney Rocks Park",area:"Hollidaysburg",kind:"outdoors",address:"Chimney Rocks Road, Hollidaysburg, PA",ideas:["short hike","scenic view"]},
{name:"Lakemont Park",area:"Altoona",kind:"recreation",address:"700 Park Avenue, Altoona, PA",ideas:["walking grounds","seasonal amusements"],seasonal:true},
{name:"Galactic Ice",area:"Altoona",kind:"recreation",address:"Altoona, PA",ideas:["ice skating","hockey"]},
{name:"Logan Valley Mall",area:"Altoona",kind:"shopping",address:"5580 Goods Lane, Altoona, PA",ideas:["shopping","people watching"]},
{name:"Fort Roberdeau Observatory",area:"Sinking Valley",kind:"night_sky",address:"383 Fort Roberdeau Road, Altoona, PA",ideas:["organized stargazing","astronomy events"],seasonal:true},
{name:"DelGrosso's Park",area:"Tipton",kind:"recreation",address:"4352 East Pleasant Valley Boulevard, Tipton, PA",ideas:["amusement park","summer day trip"],seasonal:true},
{name:"Altoona Area Public Library",area:"Downtown Altoona",kind:"library",address:"1600 5th Avenue, Altoona, PA",ideas:["books","reading","community programs"]},
{name:"Penn State Altoona",area:"Ivyside",kind:"campus",address:"3000 Ivyside Park, Altoona, PA",ideas:["campus activities","arts festival"],seasonal:true},
{name:"Holiday Bowl",area:"Altoona",kind:"recreation",address:"Altoona, PA",ideas:["bowling","casual night out"]},
{name:"Pleasant Valley Bowl",area:"Altoona",kind:"recreation",address:"Altoona, PA",ideas:["bowling","friendly competition"]},
{name:"Escape Room Altoona",area:"Altoona",kind:"recreation",address:"Altoona, PA",ideas:["escape room","group challenge"]},
{name:"Juniata Memorial Spray Park",area:"Juniata, Altoona",kind:"park",address:"Altoona, PA",ideas:["summer family recreation"],seasonal:true}
];
export function altoonaContext(characterKey:string,now:Date):string[]{
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const h=[...(characterKey+day)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17);
 const selection=Array.from({length:4},(_,i)=>ALTOONA_PLACES[(h+i*7)%ALTOONA_PLACES.length]);
 return ["LOCAL SETTING: Altoona, Pennsylvania and nearby Blair County, not Altoona, Iowa. Real places for casual suggestions and character life: "+selection.map(p=>p.name+" ("+p.area+"; "+p.ideas.join("/")+")").join("; ")+". These are reference places, not evidence of a booked outing, current business hours, or an event happening tonight. Do not invent live schedules; for real visits verify hours and dates first."];
}
