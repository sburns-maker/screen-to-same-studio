/** Pure, narrowly-scoped fictional ceremony evidence checks.
 * Neither a planned date nor auto-completed simulation is a ceremony.
 */
export type CeremonyMoment={source:string;body:string;confirmed:boolean;created_at:string};
export function isExplicitVow(text:string) {
 const s=text.trim().replace(/[“”]/g,'"').toLowerCase();
 if(/\b(?:don't|do not|wouldn't|would|won't|if|maybe|someday|not ready|just kidding|hypothetical|pretend)\b/.test(s))return false;
 return /(?:^|[.?!\s"'—-])i\s+do(?:[.!?,\s"'—-]|$)/.test(s) ||
   /\bi\s+take\s+you\b/.test(s);
}
export function hasMutualVows(moments:readonly CeremonyMoment[],at:Date) {
 const real=moments.filter(m=>Date.parse(m.created_at)<=at.getTime());
 const player=real.some(m=>m.source==="user" && m.confirmed && isExplicitVow(m.body));
 const character=real.some(m=>m.source==="character" && isExplicitVow(m.body));
 return player && character;
}
