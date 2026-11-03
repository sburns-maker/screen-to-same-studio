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

/** A first-person, affirmative statement in an actually visible CHARACTER
 * message. This does not create pregnancy or establish any medical outcome;
 * it only determines whether this conversation already contains disclosure.
 */
export function observedPregnancyDisclosureStatus(body: string): "positive" | "negative" | null {
  const value = body.replace(/\s+/g, " ").trim();
  if (/\b(?:i(?:['’]m| am) not pregnant|my pregnancy test (?:was|is|came back) negative|i (?:got|had) a negative pregnancy test)\b/i.test(value))
    return "negative";
  if (/\b(?:my pregnancy test (?:was|is|came back) positive|i (?:got|had|have|did get) a positive pregnancy test|we(?:['’]re| are) expecting(?: a baby)?)\b/i.test(value))
    return "positive";
  const pregnant = /\bi(?:['’]m| am) pregnant\b/i.exec(value);
  if (!pregnant) return null;
  const before = value.slice(Math.max(0, pregnant.index - 60), pregnant.index);
  if (/\b(?:if|what if|maybe|might|could|possibly|think|thought|wonder|imagine)\b[^.!?]*$/i.test(before))
    return null;
  return "positive";
}

/** A recent visible disclosure remains known even if a crowded chat has
 * pushed the original message out of the provider's bounded transcript.
 * Source is observed dialogue, NOT a synthetic canonical pregnancy record.
 */
export function sharedPregnancyDisclosureContext(
  messages: readonly { sender: string; body: string }[],
): string | null {
  const latest = [...messages].reverse().find(m =>
    m.sender === "tess" && !!observedPregnancyDisclosureStatus(m.body));
  if (!latest) return null;
  const status = observedPregnancyDisclosureStatus(latest.body);
  return status === "positive"
    ? "SHARED PREGNANCY DISCLOSURE HISTORY: You have already told the player in a visible conversation that you are pregnant or had a positive pregnancy test. He already knows you said this. Do not announce it as brand-new information or claim you are telling him for the first time. Respond to his actual question and discuss only established follow-up details. The earlier statement alone is not proof of a canonical pregnancy event or any later medical result."
    : "SHARED PREGNANCY DISCLOSURE HISTORY: You have already told the player in a visible conversation that you were not pregnant or had a negative pregnancy test. He already knows you said this. Do not repeat it as first-time news. Do not invent a new result or medical event.";
}

/** Match a visible self-disclosure to exactly one eligible canonical result.
 * An explicit event ID, when present, must match; older metadata-free replies
 * may be reconciled only when there is one possible due result.
 */
export function matchesVisiblePregnancyDisclosure(args: {
  body: string;
  metadata: unknown;
  visibleAt: string | null;
  event: { id: string; status: "positive" | "negative"; revealAt: string };
  soleDueEvent: boolean;
}): boolean {
  const visible = Date.parse(args.visibleAt ?? "");
  const due = Date.parse(args.event.revealAt);
  if (!Number.isFinite(visible) || !Number.isFinite(due) || visible < due)
    return false;
  const md = args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)
    ? args.metadata as Record<string, unknown>
    : null;
  const action = md?.["pregnancy_disclosure_action"];
  if (action != null) {
    const parsed = pregnancyDisclosureActionSchema.safeParse(action);
    return parsed.success && validPregnancyDisclosure(
      parsed.data, args.body, [args.event.id], args.event.status,
    );
  }
  return args.soleDueEvent &&
    observedPregnancyDisclosureStatus(args.body) === args.event.status;
}
