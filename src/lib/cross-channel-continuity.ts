/** Explicitly marked call turns only. Never invent speech from a call-log status. */
export type ConversationTurn = {
  sender: string;
  body: string;
  created_at: string;
  metadata: unknown;
};
export function recentSpokenMoments(
  recentNewestFirst: readonly ConversationTurn[],
  characterName: string,
  limit = 8,
): string[] {
  return [...recentNewestFirst]
    .filter((m) => {
      const md = m.metadata as { channel?: string } | null;
      return md?.channel === "voice" && typeof m.body === "string" && m.body.trim().length > 0;
    })
    .slice(0, limit)
    .reverse()
    .map((m) => {
      const md = m.metadata as { call_id?: string } | null;
      return `[Phone call ${m.created_at}, call ${md?.call_id ?? "unknown"}] ${m.sender === "user" ? "Player" : characterName}: ${m.body.slice(0, 300)}`;
    });
}
