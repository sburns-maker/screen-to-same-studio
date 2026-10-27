/** Transport-neutral signal: the paid task is durable, but no image is delivered yet. */
export class PendingPhotoTask extends Error {
  constructor(public readonly actionId: string) {
    super("spicy_photo_pending");
  }
}
