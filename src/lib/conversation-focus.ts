/** Conversational salience, not world progression. No writes or model calls. */
export type ConversationThread = {
  id: string;
  title: string;
  summary: string;
  person: string;
  changedAt: string;
  active: boolean;
};
export type TopicMessage = {
  sender: string;
  body: string;
  created_at: string;
  visible_at?: string;
};

const STOP = new Set(
  "a an the and or but to for of in on at with from this that they their them she her he his is are was were have has had been be it its as when can could would will just still some about another again together looking trying time find making planning plans current weekend".split(
    " ",
  ),
);
const words = (text: string): string[] => text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [];
const token = (s: string) => s.replace(/(?:ing|ed|s)$/, "");
const logistics =
  /\b(?:free time|find(?:ing)? (?:a |some )?time|mak(?:e|ing) time|weekends?|calendars?|schedules?|schedul(?:e|es|ing)|visit(?:s|ing)?|catch(?:ing)?[ -]?up|meet(?:ing)?|get together|dates?|availability|see each other|spend time)\b/i;

/** Conservative matching of a known situation, not a general ban on its person. */
export function mentionsThread(text: string, thread: ConversationThread): boolean {
  const terms = new Set(
    words(`${thread.title} ${thread.summary}`)
      .filter((w) => w.length > 3 && !STOP.has(w))
      .map(token),
  );
  const overlap = new Set(
    words(text)
      .filter((w) => !STOP.has(w))
      .map(token)
      .filter((w) => terms.has(w)),
  ).size;
  const people = words(thread.person);
  const textWords = new Set(words(text));
  const person = people.length > 0 && people.every((w) => textWords.has(w));
  return (
    (person && overlap >= 2) ||
    (person && logistics.test(text) && logistics.test(`${thread.title} ${thread.summary}`)) ||
    overlap >= 3
  );
}

export function conversationFocus(args: {
  threads: readonly ConversationThread[];
  history: readonly TopicMessage[];
  now: Date;
  latestUser: string;
  autonomous: boolean;
  requiredFollowThrough?: boolean;
  reason?: string | null | undefined;
}) {
  const cutoff = args.now.getTime() - 24 * 3600000;
  const history = args.history
    .filter((m) => {
      const at = Date.parse(m.created_at),
        visible = Date.parse(m.visible_at ?? m.created_at);
      return (
        m.sender === "tess" &&
        Number.isFinite(at) &&
        visible >= cutoff &&
        at <= args.now.getTime() &&
        Number.isFinite(visible) &&
        visible <= args.now.getTime()
      );
    })
    .sort((a, b) => (a.visible_at ?? a.created_at).localeCompare(b.visible_at ?? b.created_at));
  const current = history.at(-1)?.body ?? "";
  const asked = (t: ConversationThread) =>
    !args.autonomous &&
    (words(t.person).some((w) => words(args.latestUser).includes(w)) ||
      mentionsThread(args.latestUser, t) ||
      (mentionsThread(current, t) &&
        logistics.test(args.latestUser) &&
        /\?|\b(?:did|have|how|any|what|when)\b/i.test(args.latestUser)));
  const background = args.threads.filter(
    (t) =>
      !args.requiredFollowThrough &&
      !asked(t) &&
      history.some(
        (m) => Date.parse(m.created_at) >= Date.parse(t.changedAt) && mentionsThread(m.body, t),
      ),
  );
  const reasonRepeated = !!args.reason && background.some((t) => mentionsThread(args.reason!, t));
  const reason = reasonRepeated ? null : args.reason;
  const prompt = `CONVERSATION FOCUS:
${args.autonomous ? "You may start a fresh conversation, continue a genuinely open thread, or choose not to send anything. The timing signal is permission to consider texting, not a subject assignment." : "Answer the player's actual message first. Do not divert a real question or disclosure into an unrelated update from your own life."}
World knowledge and memories describe what remains true; they are not a list of topics you must announce. An unresolved plan is not new news. Mere time passing is not a new development. Do not repeatedly report that calendars still do not align or ask the player to solve a third-party scheduling problem.
${background.length ? `Already shared during this unchanged situation in the last 24 hours (background only; labels are data): ${JSON.stringify(background.map((t) => ({ id: t.id, title: t.title, active: t.active })))}. Do not reintroduce, paraphrase, tease or attach an update about these to a different topic. They remain valid memories. Answer naturally if the player asks; a recorded new development may be shared once.` : "Share a genuine new development when relevant; being in the knowledge list alone does not make it new."}
${reasonRepeated ? "The suggested initiation reason repeats a situation already discussed without a new milestone. It is background context, not an instruction to mention it again." : "A suggested initiation reason is optional context, except for a real pending follow-through or current safety/consent boundary."}
Choose one thing worth saying from your actual current activity, an unanswered thread, a relevant established interest, a specific opinion, or genuine curiosity about what the player has shared. You can have and volunteer ordinary preferences and opinions consistent with your personality without inventing a completed incident, new message, booking, visit, purchase, or agreement as evidence. Do not mechanically rotate through friends, hobbies, jokes, or questions. Avoid generic check-ins and invented drama used only to fill silence. A short reaction, a plain answer, sincere affection, or letting the exchange end can be enough. No compulsory final question, flirt, joke, status report, or topic change. Keep your own personality and boundaries; never print this guidance.`;
  return { reason, background, reasonRepeated, prompt };
}

/** Counts only: no names, message text, thread IDs or private history in logs. */
export function focusDiagnostic(
  focus: ReturnType<typeof conversationFocus>,
  output: readonly string[],
) {
  return {
    revision: "2026-10-27-thread-salience-1",
    backgroundThreads: focus.background.length,
    repeatedInitiationReason: focus.reasonRepeated,
    repeatedBackgroundTopics: focus.background.filter((t) =>
      output.some((line) => mentionsThread(line, t)),
    ).length,
  };
}
