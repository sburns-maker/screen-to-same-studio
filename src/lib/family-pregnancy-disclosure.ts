import {z} from "zod";
export const pregnancyDisclosureActionSchema=z.object({
  eventId:z.string().uuid(),
  quote:z.string().min(3).max(300),
}).nullable().optional();
export type PregnancyDisclosureAction=z.infer<typeof pregnancyDisclosureActionSchema>;
export const PREGNANCY_DISCLOSURE_RULES = `FICTIONAL PREGNANCY DISCOVERY: pregnancy_disclosure_action normally null. Only if your private canonical world context explicitly provides a due pregnancy event ID and its result may you choose independently to share that result in your own visible words and set pregnancy_disclosure_action={eventId:exact provided ID,quote:exact contiguous passage from your outgoing message}. Do not invent pregnancy results, infer them from intimacy, promise outcomes, or treat an undisclosed result as player knowledge. You may delay disclosure; your character's autonomy applies. This is an accelerated fictional time system, not medical advice.`;
export function validPregnancyDisclosure(action:PregnancyDisclosureAction,body:string,eligible:readonly string[]) {
 return !!action?.eventId && !!action.quote && body.includes(action.quote) && eligible.includes(action.eventId);
}
