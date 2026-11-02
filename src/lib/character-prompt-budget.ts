/** Bound prompt-only copies of old context; never alter saved chat or memories. */
export function boundedCharacterFacts(lines: readonly string[], maxCharacters = 18000): string {
  const selected: string[] = [];
  let length = 0;
  for (const value of lines) {
    const line = value.trim();
    if (!line) continue;
    if (length + line.length + 3 > maxCharacters) break;
    selected.push(line);
    length += line.length + 3;
  }
  return selected.join(" | ") + (selected.length < lines.filter(Boolean).length
    ? " | [Additional saved context omitted from this turn's prompt; stored history unchanged.]"
    : "");
}

export function boundedRecentDialogue<T extends { body: string }>(
  messages: readonly T[],
  maxCharacters = 24000,
  maxMessages = 26,
): T[] {
  const kept: T[] = [];
  let remaining = maxCharacters;
  for (let index = messages.length - 1; index >= 0 && kept.length < maxMessages; index--) {
    const m = messages[index]!;
    // Retain more of the newest message, but avoid one pasted essay excluding the conversation.
    const maxBody = Math.min(index === messages.length - 1 ? 6000 : 2400, remaining - 100);
    if (maxBody < 200) break;
    const body = m.body.length > maxBody
      ? "[Beginning of older message omitted from prompt] " + m.body.slice(-(maxBody - 55))
      : m.body;
    kept.unshift({ ...m, body });
    remaining -= body.length + 100;
  }
  return kept;
}

export type PromptBudget = { dialogue: number; messages: number; memories: number; world: number };
/** Progressively smaller prompt-only windows; the saved thread and memory bank are untouched. */
export const PROMPT_BUDGETS: readonly PromptBudget[] = [
  { dialogue: 24000, messages: 26, memories: 12000, world: 18000 },
  { dialogue: 14000, messages: 18, memories: 9000, world: 12000 },
  { dialogue: 8000, messages: 12, memories: 7000, world: 8000 },
  { dialogue: 4000, messages: 8, memories: 5000, world: 5000 },
];
/** Pick the largest context that keeps the whole request under the provider ceiling. */
export function fitPromptContext(build: (b: PromptBudget) => string, otherCharacters: number, limit = 96_000): string {
  for (const b of PROMPT_BUDGETS) {
    const text = build(b);
    if (text.length + otherCharacters <= limit) return text;
  }
  return build(PROMPT_BUDGETS[PROMPT_BUDGETS.length - 1]!);
}
