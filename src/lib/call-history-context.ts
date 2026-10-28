/** Call attempts are facts; they are not evidence of a conversation, motive or audible ring. */
export type CallHistoryFact = {
  direction: string;
  state: string;
  offered_at: string;
  answered_at: string | null;
  ended_at: string | null;
  ring_until: string;
  reason: string;
};
export function callHistoryLines(rows: CallHistoryFact[], now: Date): string[] {
  const cutoff = now.getTime() - 7 * 86400000;
  const facts = rows
    .filter((r) => {
      const at = Date.parse(r.offered_at);
      return (
        at >= cutoff &&
        at <= now.getTime() &&
        ["incoming", "outgoing"].includes(r.direction) &&
        !/developer.*test ring/i.test(r.reason)
      );
    })
    .sort((a, b) => Date.parse(b.offered_at) - Date.parse(a.offered_at))
    .slice(0, 8);
  if (!facts.length) return [];
  return [
    "AUTHORITATIVE RECENT CALL HISTORY: These are this conversation's actual phone records. Incoming means YOU called the player; outgoing means the PLAYER called you. Do not deny a recorded attempt. These records override contradictory guesses or denials in earlier messages; if asked, correct an earlier mistake naturally without discussing prompts or the ledger. An unanswered/missed call contains no shared dialogue or agreement. Never invent its purpose, audible ringing, voicemail, topics or blame. An empty/partial history is not proof no call occurred. A missed attempt does not rule out a separate later answered call. Mention calls only when relevant.",
    ...facts.map((r) => {
      const at = new Date(r.offered_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      const caller = r.direction === "incoming" ? "You called the player" : "The player called you";
      const answered = r.answered_at && Date.parse(r.answered_at) <= now.getTime();
      const expired = r.state === "ringing" && Date.parse(r.ring_until) <= now.getTime();
      const outcome = answered
        ? `answered; ${r.ended_at && Date.parse(r.ended_at) <= now.getTime() ? "call ended" : "no confirmed end recorded"}. Topics are known only from retained call dialogue or memories, not this record`
        : r.state === "missed" || expired
          ? "missed / not answered; no conversation occurred"
          : r.state === "declined"
            ? "declined / not answered"
            : r.state === "failed"
              ? "connection failed; no answer recorded"
              : ["calling", "ringing", "connecting"].includes(r.state)
                ? "attempt in progress; no answer recorded"
                : "no answer recorded";
      return `CALL RECORD ${at} Eastern: ${caller}; ${outcome}.`;
    }),
  ];
}
