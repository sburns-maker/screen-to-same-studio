import {z} from "zod";
export const pregnancyDisclosureActionSchema=z.object({
  eventId:z.string().uuid(),
  quote:z.string().min(3).max(300),
}).nullable();
export type PregnancyDisclosureAction=z.infer<typeof pregnancyDisclosureActionSchema>;
export const PREGNANCY_DISCLOSURE_RULES = `FICTIONAL PREGNANCY DISCOVERY: pregnancy_disclosure_action normally null. Only if your private canonical world context explicitly provides a due pregnancy event ID and its result may you choose independently to share that result in your own visible words and set pregnancy_disclosure_action={eventId:exact provided ID,quote:exact contiguous passage from your outgoing message}. Do not invent pregnancy results, infer them from intimacy, promise outcomes, or treat an undisclosed result as player knowledge. You may delay disclosure; your character's autonomy applies. This is an accelerated fictional time system, not medical advice.`;
export function validPregnancyDisclosure(
 action:PregnancyDisclosureAction,body:string,eligible:readonly string[],
 status?:"positive"|"negative",
) {
 if(!action?.eventId || !action.quote || !body.includes(action.quote) || !eligible.includes(action.eventId))return false;
 if(!status)return true;
 const text=body.toLowerCase();
 return status==="positive"
   ? /\b(?:i(?:['’]m| am) pregnant|we(?:['’]re| are) expecting|pregnancy test (?:was |is )?positive|test (?:came back|was) positive)\b/.test(text)
   : /\b(?:not pregnant|pregnancy test (?:was |is )?negative|test (?:came back|was) negative)\b/.test(text);
}


/** Parse only an unambiguous first-person result disclosure already visible
 * to the player. This is conversational evidence, never a conception roll.
 */
export function visiblePregnancyResultDisclosure(body: string): "positive" | "negative" | null {
  const s = body.toLowerCase();
  const positive = /\b(?:i(?:['’]m| am) pregnant|my pregnancy test (?:was|is|came back) positive|i (?:got|had|received) a positive pregnancy (?:test|result)|we(?:['’]re| are) expecting (?:a|our) (?:baby|child))\b/i.test(s);
  const negative = /\b(?:i(?:['’]m| am) not pregnant|my pregnancy test (?:was|is|came back) negative|i (?:got|had|received) a negative pregnancy (?:test|result))\b/i.test(s);
  return positive === negative ? null : positive ? "positive" : "negative";
}

/** Exact disclosure lines are visible shared history, independently of whether
 * their structured action metadata was attached successfully.
 */
export function priorPregnancyDisclosureContext(
  messages: readonly { body: string; visible_at?: string | null }[],
): string[] {
  const match = messages.find(m => visiblePregnancyResultDisclosure(m.body));
  if (!match) return [];
  const status = visiblePregnancyResultDisclosure(match.body);
  return [
    `PREVIOUSLY VISIBLE PREGNANCY CONVERSATION (shared with player): You already told the player a ${status} pregnancy result in a previous visible message${match.visible_at ? ` at ${match.visible_at}` : ""}. Do not present the same result as a new revelation, or say you are telling them for the first time. Continue the established conversation naturally. This visible statement is conversation evidence, not proof of a new conception event, a doctor's confirmation or an additional pregnancy.`,
  ];
}
