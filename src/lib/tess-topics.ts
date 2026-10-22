// Pure, AI-free topic-saturation guard for every character. The model imitates
// its own transcript, so once a motif appears in several of a character's recent
// lines it keeps snowballing. This detects saturated motifs and explicit
// subject-change requests and turns them into short prompt guidance. It never
// bans a topic outright and never invents life events.

type MotifSet = Record<string, { re: RegExp; label: string }>;

export const CHARACTER_MOTIFS: Record<string, MotifSet> = {
  tess: {
    lasagna: { re: /\blasagn[ae]\b/i, label: "lasagna jokes" },
    scheduling: { re: /\b(schedul\w*|reshuffle|magic button|survival.kit)\b/i, label: "staff scheduling and magic-button callbacks" },
    mabel_socks: { re: /\bsocks?\b/i, label: "Mabel stealing socks" },
    trivia: { re: /\btrivia\b/i, label: "trivia" },
    cheese: { re: /\bchees(e|y)\b/i, label: "cheese jokes" },
    mabel: { re: /\bmabel\b/i, label: "Mabel" },
  },
  maya: {
    saturday: { re: /\b(saturday|our date|can.t wait.*see you)\b/i, label: "anticipation of the already-discussed date" },
    chase: { re: /\b(catch(ing)? me|the chase|keep up|the game)\b/i, label: "the 'catch me' chase line" },
    paintball: { re: /\bpaintball|\baim\b/i, label: "paintball" },
    coffee: { re: /\b(coffee|green bean|latte)\b/i, label: "coffee" },
    charm: { re: /\bcharm(ing)?\b/i, label: "teasing about his charm" },
  },
  claire: {
    fries: { re: /\b(french.fries|fries|fry theft|steal.*fries)\b/i, label: "French-fry jokes" },
    saturday: { re: /\b(saturday|our date)\b/i, label: "anticipation of the already-discussed date" },
    books: { re: /\b(books?|book club|novel|reading)\b/i, label: "books" },
    tea: { re: /\b(tea|chamomile)\b/i, label: "tea" },
    garden: { re: /\bgarden(ing)?\b/i, label: "her garden" },
    validation: { re: /\b(so valuable|invaluable|really important|meaningful|makes a difference)\b/i, label: "validating what he said" },
  },
  jordan: {
    tests: { re: /\b(prove|earn it|impress me|we.ll see|challenge|test|guard down)\b/i, label: "emotional tests and guarded challenges" },
    climbing: { re: /\b(climb(ing)?|boulder(ing)?|crag)\b/i, label: "climbing" },
    drafting: { re: /\b(cad|blueprints?|drafting)\b/i, label: "drafting work" },
    fairytale: { re: /\b(fairy ?tale|cinderella|onion|layers)\b/i, label: "fairy-tale/onion metaphors" },
  },
  ben: {
    hvac: { re: /\b(hvac|furnace|ductwork|ducts?)\b/i, label: "HVAC work" },
    grill: { re: /\bgrill(ing)?\b/i, label: "grilling" },
    fantasy: { re: /\bfantasy (football|team|league)\b/i, label: "fantasy football" },
    ninjas: { re: /\bninjas?\b/i, label: "kid ninja jokes" },
  },
};

/** Breadth of each character's life, so no single motif becomes default material. */
export const LIFE_BREADTH: Record<string, string> = {
  tess: "Your life is wide: work at the clinic, Sam and Dr. Halloran, Lena/Marcus/Dev, your parents, Evan's wedding, plans, things that annoy you, things you want. Mabel and trivia are just two parts of it — not your default material.",
  maya: "Your life is wide: event coordinating at the venue (vendors, clients, setups going wrong), your friends and social plans, family, things you want. Flirting, the chase, coffee and paintball are only parts of it — not your default material.",
  claire: "Your life is wide: the school library (students, budget, colleagues), family, your ex and life after divorce, friends, small plans and frustrations. Books, tea and the garden are only parts of it — and don't just validate him; share your own take.",
  jordan: "Your life is wide: deadlines and coworkers at the firm, your small circle, errands, things that bug you, things you quietly want. Climbing and sarcasm are only parts of it — not a permanent shield.",
  ben: "Your life is wide: Sarah and the kids, the current renovation, job-site stories, buddies, money, plans. HVAC, grilling and fantasy football are only parts of it — not your default material.",
};

const motifsFor = (key: string): MotifSet => CHARACTER_MOTIFS[key] ?? {};

/** Motifs used in at least `threshold` of the character's last `window` lines. */
export function saturatedMotifs(lines: string[], window = 8, threshold = 2, key = "tess"): string[] {
  const recent = lines.slice(-window);
  return Object.entries(motifsFor(key))
    .filter(([, m]) => recent.filter((l) => m.re.test(l)).length >= threshold)
    .map(([k]) => k);
}

const CHANGE_RE = /\b(unrelated to|other than|besides|not about|enough (about|with)|something (else|different|new)|change (the )?subject|anything but)\b/i;
const OPEN_RE = /\b(on your mind|haven'?t told me|tell me (something|about you)|what'?s new|what'?s going on (with you|in your life)|about your (day|week|life))\b/i;

/** Topics the user explicitly asked to move away from in his latest message. */
export function excludedTopics(userText: string, key = "tess"): string[] {
  const m = userText.match(CHANGE_RE);
  if (!m) return [];
  const after = userText.slice(m.index ?? 0);
  const hits = Object.entries(motifsFor(key)).filter(([, x]) => x.re.test(after)).map(([k]) => k);
  return hits.length ? hits : ["__current__"];
}

/** He's inviting the character to share something from their own life. */
export const isOpenInvitation = (userText: string) => OPEN_RE.test(userText);

export function topicGuidance(lines: string[], lastUser: string, key = "tess"): string {
  const set = motifsFor(key);
  const out: string[] = [];
  const excluded = excludedTopics(lastUser, key);
  const saturated = saturatedMotifs(lines, 8, 2, key).filter((k) => !excluded.includes(k));
  if (excluded.length) {
    const names = excluded.includes("__current__") ? "the topic you've been on" : excluded.map((k) => set[k]!.label).join(", ");
    out.push(`He explicitly asked to talk about something other than ${names}. Do not mention it at all this reply — not even as a punchline or comparison.`);
  }
  if (saturated.length) {
    out.push(`You've leaned on ${saturated.map((k) => set[k]!.label).join(" and ")} a lot recently. Skip it this time unless he directly brings it up; callbacks are fine later, just not as a default.`);
  }
  if (isOpenInvitation(lastUser)) {
    out.push(`He's asking about YOUR life. Answer with one real, specific thing from what you know lately, active life events, current life threads or your memories (work, family, friends, a plan, a frustration, something you want). A small honest disclosure is fine if trust allows; guarded is fine too. Don't invent a new dramatic event, and don't deflect with a pet joke.`);
  }
  if (/\b(good ?night|talk (to you )?later|gotta go|have to go|see you (then|tomorrow)|sounds good|all set)\b/i.test(lastUser)) {
    out.push("This may be a natural conversation ending. A brief acknowledgment or sign-off is enough; do not reopen settled plans, add a question, or invent a new obstacle.");
  }
  if (key === "jordan" && /\b(appreciate|thank you|proud of you|care about you|admire|beautiful|means a lot)\b/i.test(lastUser)) {
    out.push("You may accept a sincere compliment or vulnerable statement plainly. Reserved does not require a challenge, test, deflection, or romantic escalation.");
  }
  if (!out.length) return "";
  return `TOPIC CHECK:\n- ${out.join("\n- ")}\n- Never swap one pet joke for another repeated catchphrase. You may introduce a new topic yourself when it fits.`;
}
