import type { CharacterKey } from "./characters";
import type { PhotoFrequency } from "./tess-photos";
/** A visual cue opens an opportunity; it never overrides consent, safety, availability or budget. */
export function visualCue(text: string) {
  return /\b(photo|picture|pic|selfie|outfit|wearing|hair|look like|weather|rain|raining|snow|snowing|sunny|sunset|garden|flowers|puppy|dog|cat|kitten|mabel|pet|coffee|food|meal|breakfast|lunch|dinner|baking|cooking|view|scenery|park|trail|venue|decorat|book display)\b/i.test(
    text,
  );
}
export function directPhotoRequest(text: string) {
  return /\b(?:send|share|show|take|see|get|snap)\b.{0,65}\b(?:photo|picture|pic|selfie|outfit|view)\b|\b(?:photo|picture|selfie)\s*\?/i.test(
    text,
  );
}
export function photoPacing(args: {
  character: CharacterKey;
  frequency: PhotoFrequency;
  now: Date;
  lastPhotoAt: string | null;
  ownSinceLastPhoto: number;
  userText: string;
  context: string;
}) {
  const direct = directPhotoRequest(args.userText),
    visual = visualCue(args.userText + " " + args.context);
  const scale =
    (args.frequency === "rare" ? 2 : args.frequency === "frequent" ? 0.6 : 1) *
    { tess: 1, maya: 0.8, claire: 1.25, jordan: 1.75, ben: 1.25 }[args.character];
  const minutes = Math.max(3, Math.ceil((direct ? 3 : visual ? 10 : 30) * scale));
  const messages = direct ? 0 : visual ? 1 : args.frequency === "rare" ? 4 : 2;
  const age = args.lastPhotoAt ? args.now.getTime() - Date.parse(args.lastPhotoAt) : Infinity;
  const allowed =
    !args.lastPhotoAt || (age >= minutes * 60000 && args.ownSinceLastPhoto >= messages);
  return {
    allowed,
    direct,
    visual,
    minutes,
    messages,
    reason: allowed
      ? direct
        ? "direct contextual request; consent and budgets still apply"
        : visual
          ? "visual context permits a naturally paced photo"
          : "ordinary photo pacing permits sharing"
      : `photo pacing: wait ${minutes} minutes and ${messages} character messages after the last photo`,
  };
}
