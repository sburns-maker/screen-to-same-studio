import { attachmentPresent } from "./photo-opportunities";
type PendingReply = { sender?: string; body?: string; visible_at?: string; metadata?: unknown };
/** Prepared text is a delivery queue, not an in-flight image or a refusal.
 * Existing photos remain protected; a new shot never overtakes queued replies.
 */
export function spontaneousPhotoQueue(rows: readonly PendingReply[], now: Date) {
  const pending = rows.filter(
    (r) => r.sender === "tess" && !!r.visible_at && Date.parse(r.visible_at) > now.getTime(),
  );
  const hasPhoto = pending.some((r) => attachmentPresent(r.metadata));
  return {
    blocked: hasPhoto || pending.length >= 40,
    reason: hasPhoto
      ? "A photo is already waiting for delivery"
      : pending.length >= 40
        ? "Character reply queue is full"
        : null,
    deliverAfter: pending.reduce(
      (last, r) => Math.max(last, Date.parse(r.visible_at!)),
      now.getTime(),
    ),
    texts: pending
      .filter((r) => !attachmentPresent(r.metadata))
      .map((r) => r.body?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 8),
  };
}
export function spontaneousPhotoTask(name: string) {
  return `TASK: ${name} is considering sharing a spontaneous photograph from the actual current moment. Decide about the photo first, then write any natural caption. If you independently want to share and an allowed category fits, return a complete photo request with willing=true, contextual=true, an allowed type and a concrete scene; attach the photo rather than merely saying you could send one. An ordinary selfie or everyday view is enough. Do not require a special event, flirt, joke or user request. If you do not want to share, photo=null is valid; an ordinary text or silence is also valid. Never promise an attachment you did not choose, invent an activity, override a boundary or treat scores as consent. This photo-specific task replaces the usual default of writing a text and normally leaving photo=null.`;
}
