// Deterministic guardrails for Tess's texting voice. Prompt instructions alone
// drift because the model imitates its own previous replies in the transcript;
// this filter enforces the style on output and cleans her past lines before
// they are fed back as context. Pure — no AI, tested in tess-voice.test.ts.

const ALLOWED_EMOJI = new Set(["😂", "😭", "🙄", "🤦‍♀️", "😬", "🙂", "👀"]);
const EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200d\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu;

/** Sentences where Tess narrates her own personality instead of showing it. */
const SELF_DESCRIPTION = [
  /\b(sarcasm|sarcastic|dry humou?r|deadpan|wit|witty|chaos|chaotic|funny)\b[^.!?]*\b(is|are)\s+(basically\s+)?my\b/i,
  /\bmy\s+(dry\s+humou?r|sarcasm|wit|deadpan|chaotic energy|humou?r)\b/i,
  /\bi'?m\s+(so\s+|very\s+|pretty\s+|kind of\s+)?(sarcastic|witty|deadpan|funny|chaotic|hilarious)\b/i,
  /\b(second language|in full effect)\b/i,
];

/** Presenter / cheerleader phrasing that is never Tess. */
const PRESENTER = [
  /\boh boy\b/i,
  /\bget ready for\b/i,
  /\bjust wait until\b/i,
  /\bat its finest\b/i,
  /\bserious [a-z]+ magic\b/i,
  /\bmagic\b!/i,
  /\bdelicate balance\b/i,
  /\bbuckle up\b/i,
  /\bstay tuned\b/i,
];

const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const splitSentences = (s: string) => Array.from(sentences.segment(s), (part) => part.segment);

function stripSentences(text: string, contact = false): string {
  // Sincerity is not filler. Other contacts do not inherit Tess's presenter/personality bans.
  const bans = contact ? [] : [...SELF_DESCRIPTION, ...PRESENTER];
  if (!bans.some((r) => r.test(text))) return text.trim();
  return splitSentences(text)
    .filter((sent) => !bans.some((r) => r.test(sent)))
    .join("")
    .trim();
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

/** Jaccard overlap of meaningful words — used to catch repeated jokes. */
export function similarity(a: string, b: string): number {
  const A = words(a),
    B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export type VoiceOptions = {
  maxBubbles?: number;
  recentTess?: string[];
  /** Max emoji per turn (default 1). */
  maxEmoji?: number;
  /** Allowed emoji; null = any (default Tess's set). */
  allowedEmoji?: Set<string> | null;
  /** Max exclamation marks per turn (default 1). */
  maxExclaim?: number;
};

/** Per-character voice limits for non-Tess contacts. */
export const CONTACT_VOICE: Record<string, Omit<VoiceOptions, "recentTess">> = {
  maya: { maxBubbles: 3, maxEmoji: 2, allowedEmoji: null, maxExclaim: 2 },
  claire: { maxBubbles: 2, maxEmoji: 1, allowedEmoji: null, maxExclaim: 1 },
  jordan: { maxBubbles: 2, maxEmoji: 1, allowedEmoji: new Set(["🙄"]), maxExclaim: 0 },
  ben: { maxBubbles: 2, maxEmoji: 1, allowedEmoji: null, maxExclaim: 1 },
  riley: { maxBubbles: 3, maxEmoji: 1, allowedEmoji: null, maxExclaim: 1 },
  sienna: { maxBubbles: 3, maxEmoji: 2, allowedEmoji: null, maxExclaim: 2 },
};

/** Enforce Tess's voice on a fresh reply. Returns cleaned bubbles (may be fewer). */
export function enforceTessVoice(bubbles: string[], opts: VoiceOptions = {}): string[] {
  const maxBubbles = opts.maxBubbles ?? 2;
  const maxEmoji = opts.maxEmoji ?? 1;
  const allowed = opts.allowedEmoji === undefined ? ALLOWED_EMOJI : opts.allowedEmoji;
  const maxExclaim = opts.maxExclaim ?? 1;
  let emojiUsed = 0;
  let exclaimUsed = 0;
  const out: string[] = [];
  for (const raw of bubbles) {
    let t = stripSentences(raw, opts.allowedEmoji !== undefined);
    // Emoji: at most one per turn, only from her set.
    t = t.replace(EMOJI_RE, (e) => {
      if (emojiUsed >= maxEmoji || (allowed && !allowed.has(e))) return "";
      emojiUsed++;
      return e;
    });
    // Exclamation marks: at most one per turn; collapse "!!" and turn the rest into periods.
    t = t.replace(/!+/g, (marks, offset: number, source: string) => {
      if (exclaimUsed++ < maxExclaim) return "!";
      // Removing emphasis must not turn a question into malformed "?." or ".?".
      return source[offset - 1] === "?" || source[offset + marks.length] === "?" ? "" : ".";
    });
    t = t
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,?!])/g, "$1")
      .trim();
    if (!t || /^[.\s]+$/.test(t)) continue;
    // Deduplicate this output only. Historical overlap can be a requested fact,
    // boundary or plan confirmation; pattern guidance handles stale jokes instead.
    // Near-matches may differ in a crucial negation, name, amount or meeting time.
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= maxBubbles) break;
  }
  return out;
}

/** Clean one of her past lines before it re-enters the prompt, so drift isn't imitated. */
export function cleanTessHistoryLine(body: string): string {
  const cleaned = enforceTessVoice([body], { maxBubbles: 1 })[0];
  return cleaned ?? "…";
}

/** Format a non-Tess history line without deleting sincerity or applying Tess's phrase bans. */
export function cleanContactHistoryLine(body: string, name: string): string {
  const v = CONTACT_VOICE[name.toLowerCase()] ?? { allowedEmoji: null };
  return enforceTessVoice([body], { ...v, maxBubbles: 1, maxEmoji: 3, maxExclaim: 3 })[0] ?? "…";
}
