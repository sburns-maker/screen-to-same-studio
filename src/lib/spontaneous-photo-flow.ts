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
  return `TASK: ${name} is considering sharing a spontaneous photograph from the actual current moment. Decide about the photo first, then write any natural caption. If you independently want to share and an allowed category fits, return a complete photo request with willing=true, contextual=true, an allowed type and a concrete scene; attach the photo rather than merely saying you could send one. An ordinary selfie or everyday view is enough, but do not reflexively choose ordinary if an explicitly eligible, independently welcome, non-explicit suggestive photo fits a truly private romantic moment. You may prefer to keep that moment private or share nothing. Only use the eligible categories supplied in the main prompt; never infer approval from flirting, attraction, previous photos or developer tests. Do not require a special event, flirt, joke or user request. If you do not want to share, photo=null is valid; an ordinary text or silence is also valid. Never promise an attachment you did not choose, invent a significant event, override a boundary or treat scores as consent. If exact outfit, ordinary object or background is unstated, a plausible detail consistent with schedule and place is allowed. This photo-specific task replaces the usual default of writing a text and normally leaving photo=null.`;
}

/** An authenticated developer opportunity checks the character's actual choice,
 * not whether a separate spontaneous-photo scheduler happened to fire.
 * Context is hypothetical grounding, never an incoming player message. */
/**
 * Diagnostic-only classification. It does not alter character decisions.
 * Test UI can distinguish a declined photo from a provider or delivery failure.
 */
export type PhotoChoiceOutcome = "photo" | "text_only" | "silence" | "ineligible" | "generation_failed" | "delivery_failed";
export function classifyPhotoChoice(input: {
  evaluated: boolean;
  eligible: boolean;
  photoSelected: boolean;
  hasText: boolean;
  generationAttempted?: boolean;
  generationSucceeded?: boolean;
  deliveryAttempted?: boolean;
  deliverySucceeded?: boolean;
}): PhotoChoiceOutcome {
  if (!input.eligible || !input.evaluated) return "ineligible";
  if (!input.photoSelected) return input.hasText ? "text_only" : "silence";
  if (input.generationAttempted && input.generationSucceeded === false) return "generation_failed";
  if (input.deliveryAttempted && input.deliverySucceeded === false) return "delivery_failed";
  return "photo";
}

export function summarizePhotoDecisionBatch(results: readonly PhotoChoiceOutcome[]) {
  const counts: Record<PhotoChoiceOutcome, number> = {
    photo: 0, text_only: 0, silence: 0, ineligible: 0, generation_failed: 0, delivery_failed: 0,
  };
  for (const result of results) counts[result]++;
  return { total: results.length, counts, photoChoiceRate: results.length ? counts.photo / results.length : 0 };
}

export function controlledPhotoTask(name: string) {
  return `TASK: Controlled photo opportunity for ${name}. The supplied context describes a POSSIBLE current photo-sharing moment; it is NOT a new message from the player, not a request you must obey, and not proof of consent or a change of clothes or location. Decide whether you independently want to send an eligible photo in this established moment BEFORE composing any text. If yes, return a complete photo action with willing=true, contextual=true, the chosen eligible type, actual scene and honest framing; let the provider generate and attach the photo rather than merely promising one. If an image genuinely fits, select it through the normal action fields rather than merely describing one in text. Otherwise choose a normal text reply or silence. Preserve boundaries, eligibility and known scene facts; unspecified everyday visual details can be filled plausibly rather than automatically blocking the photo. No outcome is guaranteed. This focused decision is an ordinary communication choice, not a compliance test.`;
}
