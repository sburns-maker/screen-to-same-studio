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
