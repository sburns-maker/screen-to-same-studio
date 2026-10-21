// Deterministic guardrails for Tess's texting voice. Prompt instructions alone
// drift because the model imitates its own previous replies in the transcript;
// this filter enforces the style on output and cleans her past lines before
// they are fed back as context. Pure — no AI, tested in tess-voice.test.ts.

const ALLOWED_EMOJI = new Set(["😂", "😭", "🙄", "🤦‍♀️", "😬", "🙂", "👀"]);
const EMOJI_RE = /(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic}|\uFE0F|\u200d[\u2640\u2642]\uFE0F?)*)/gu;

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

const splitSentences = (s: string) => s.match(/[^.!?]+[.!?]*\s*/g) ?? [s];

function stripSentences(text: string): string {
  return splitSentences(text)
    .filter((sent) => !SELF_DESCRIPTION.some((r) => r.test(sent)) && !PRESENTER.some((r) => r.test(sent)))
    .join("")
    .trim();
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter((w) => w.length > 3));

/** Jaccard overlap of meaningful words — used to catch repeated jokes. */
export function similarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export type VoiceOptions = { maxBubbles?: number; recentTess?: string[] };

/** Enforce Tess's voice on a fresh reply. Returns cleaned bubbles (may be fewer). */
export function enforceTessVoice(bubbles: string[], opts: VoiceOptions = {}): string[] {
  const maxBubbles = opts.maxBubbles ?? 2;
  const recent = opts.recentTess ?? [];
  let emojiUsed = 0;
  let exclaimUsed = 0;
  const out: string[] = [];
  for (const raw of bubbles) {
    let t = stripSentences(raw);
    // Emoji: at most one per turn, only from her set.
    t = t.replace(EMOJI_RE, (e) => {
      if (emojiUsed >= 1 || !ALLOWED_EMOJI.has(e)) return "";
      emojiUsed++;
      return e;
    });
    // Exclamation marks: at most one per turn; collapse "!!" and turn the rest into periods.
    t = t.replace(/!+/g, () => (exclaimUsed++ === 0 ? "!" : "."));
    t = t.replace(/\s{2,}/g, " ").replace(/\s+([.,?!])/g, "$1").trim();
    if (!t || /^[.\s]+$/.test(t)) continue;
    // Repetition: drop bubbles that echo something she said recently or this turn.
    if ([...recent, ...out].some((prev) => similarity(prev, t) >= 0.6)) continue;
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
