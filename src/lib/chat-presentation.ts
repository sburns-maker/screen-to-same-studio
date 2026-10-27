/** A request in flight is not proof of a read. Only a persisted, correlated reply is. */
export function messageReceipt(
  messageId: string,
  replies: readonly { sender: string; metadata: unknown }[],
  readReceipts: boolean,
): "Sent" | "Read" {
  return readReceipts &&
    replies.some(
      (r) =>
        r.sender === "tess" &&
        (r.metadata as { in_reply_to?: unknown } | null)?.in_reply_to === messageId,
    )
    ? "Read"
    : "Sent";
}

export function nearConversationEnd(
  element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 100;
}

/** Stable IDs make a local outbox replay safe after an interrupted acknowledgment. */
export type QueuedMessage = { id: string; body: string; at: number };
export function parseOutbox(raw: string | null): QueuedMessage[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((m): m is QueuedMessage => {
      if (
        !m ||
        typeof m !== "object" ||
        typeof m.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.id) ||
        typeof m.body !== "string" ||
        !m.body.trim() ||
        !Number.isFinite(m.at) ||
        seen.has(m.id)
      )
        return false;
      seen.add(m.id);
      return true;
    });
  } catch {
    return [];
  }
}
