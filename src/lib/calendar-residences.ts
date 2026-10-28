export type CalendarResidence = {
  key: string;
  label: string;
  canPlan: boolean;
  existingPermission: boolean;
  characters: string[];
};
/** Only an actual present invitation, not a memory, hypothetical, refusal or a player's claim. */
export function homeInvitationActivity(
  text: string,
): { title: string; category: "dinner" | "meetup" } | null {
  const s = text.replace(/(?:can['’]t|cannot) wait/gi, "look forward");
  if (
    /\b(?:don['’]t|do not|can['’]t|cannot|not tonight|never|won['’]t|no longer|not ready|not sure|not inviting|not hosting|cancelled|canceled|rather not|maybe|someday|if(?! you (?:bring|want|like))|wish|remember|yesterday|you said|you asked)\b/i.test(
      s,
    )
  )
    return null;
  if (!/\b(?:my (?:house|home|place|apartment)|at mine)\b/i.test(s)) return null;
  if (
    !/\b(?:come (?:over|round|to)|want to|would you|how about|you['’]re invited|you are invited|let['’]s|we (?:could|should)|i['’]d (?:love|like)|(?:my (?:house|home|place|apartment)|mine) (?:is|works|sounds) (?:fine|good|great|perfect)|(?:is|it['’]s) (?:still )?the plan|put (?:it|us|that) down|works for me|see you (?:then|there|at))\b/i.test(
      s,
    )
  )
    return null;
  if (/\b(?:movies?|film)\b/i.test(s)) return { title: "Movie night", category: "meetup" };
  if (/\b(?:games?|game night)\b/i.test(s)) return { title: "Game night", category: "meetup" };
  if (/\b(?:cook|cooking|dinner)\b/i.test(s))
    return { title: "Dinner together", category: "dinner" };
  return { title: "Visit at home", category: "meetup" };
}
export function sameHomeActivity(a: string, b: string) {
  const classify = (s: string) =>
    /\b(?:movie|film)/i.test(s)
      ? "movie"
      : /\bgame/i.test(s)
        ? "game"
        : /\b(?:cook|dinner)/i.test(s)
          ? "dinner"
          : s.trim().toLowerCase();
  return classify(a) === classify(b);
}

export function homeInvitationRefused(text: string): boolean {
  return /\b(?:(?:don['’]t|do not) (?:come|visit)|(?:can['’]t|cannot|won['’]t|will not) (?:host|have you over)|not hosting|no longer inviting|cancel (?:the |our )?(?:movie|game|dinner))\b/i.test(
    text,
  );
}
