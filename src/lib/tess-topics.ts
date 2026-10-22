// Pure, AI-free topic-saturation guard for Tess. The model imitates its own
// transcript, so once a motif (socks, trivia…) appears in several of her recent
// lines it keeps snowballing. This detects saturated motifs and explicit
// subject-change requests and turns them into short prompt guidance. It never
// bans a topic outright and never invents life events.

export const MOTIFS: Record<string, RegExp> = {
  mabel_socks: /\bsocks?\b/i,
  trivia: /\btrivia\b/i,
  cheese: /\bchees(e|y)\b/i,
  mabel: /\bmabel\b/i,
};

export const MOTIF_LABEL: Record<string, string> = {
  mabel_socks: "Mabel stealing socks",
  trivia: "trivia",
  cheese: "cheese jokes",
  mabel: "Mabel",
};

/** Motifs used in at least `threshold` of her last `window` lines. */
export function saturatedMotifs(tessLines: string[], window = 8, threshold = 2): string[] {
  const recent = tessLines.slice(-window);
  return Object.entries(MOTIFS)
    .filter(([, re]) => recent.filter((l) => re.test(l)).length >= threshold)
    .map(([k]) => k);
}

const CHANGE_RE = /\b(unrelated to|other than|besides|not about|enough (about|with)|something (else|different|new)|change (the )?subject|anything but)\b/i;
const OPEN_RE = /\b(on your mind|haven'?t told me|tell me (something|about you)|what'?s new|what'?s going on (with you|in your life)|about your (day|week|life))\b/i;

/** Topics the user explicitly asked to move away from in his latest message. */
export function excludedTopics(userText: string): string[] {
  if (!CHANGE_RE.test(userText)) return [];
  const m = userText.match(CHANGE_RE);
  const after = m ? userText.slice((m.index ?? 0)) : userText;
  const hits = Object.entries(MOTIFS).filter(([, re]) => re.test(after)).map(([k]) => k);
  return hits.length ? hits : ["__current__"];
}

/** He's inviting her to share something from her own life. */
export const isOpenInvitation = (userText: string) => OPEN_RE.test(userText);

export function topicGuidance(tessLines: string[], lastUser: string): string {
  const out: string[] = [];
  const excluded = excludedTopics(lastUser);
  const saturated = saturatedMotifs(tessLines).filter((k) => !excluded.includes(k));
  if (excluded.length) {
    const names = excluded.includes("__current__") ? "the topic you've been on" : excluded.map((k) => MOTIF_LABEL[k]).join(", ");
    out.push(`He explicitly asked to talk about something other than ${names}. Do not mention it at all this reply — not even as a punchline or comparison.`);
  }
  if (saturated.length) {
    out.push(`You've leaned on ${saturated.map((k) => MOTIF_LABEL[k]).join(" and ")} a lot recently. Skip it this time unless he directly brings it up; callbacks are fine later, just not as a default.`);
  }
  if (isOpenInvitation(lastUser)) {
    out.push(`He's asking about YOUR life. Answer with one real, specific thing from WHAT SHE KNOWS LATELY, ACTIVE LIFE EVENT, CURRENT LIFE THREADS or your memories (work, family, Evan's wedding, friends, a plan, a frustration, something you want). A small honest disclosure is fine if trust allows; guarded is fine too. Don't invent a new dramatic event, and don't deflect with a pet joke.`);
  }
  if (!out.length) return "";
  return `TOPIC CHECK:\n- ${out.join("\n- ")}\n- Never swap one pet joke for another repeated catchphrase. You may introduce a new topic yourself when it fits.`;
}
