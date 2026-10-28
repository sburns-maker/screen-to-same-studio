import type { CharacterKey } from "./characters";
import type { PhotoFrequency } from "./tess-photos";
/** A visual cue opens an opportunity; it never overrides consent, safety, availability or budget. */
export function visualCue(text: string) {
  return /\b(photo|picture|pic|selfie|outfit|wearing|hair|look like|weather|rain|raining|snow|snowing|sunny|sunset|garden|flowers|puppy|dog|cat|kitten|mabel|pet|coffee|food|meal|breakfast|lunch|dinner|baking|cooking|view|scenery|park|trail|venue|decorat|book display)\b/i.test(
    text,
  );
}
/** A strong visual punchline can justify another picture, but is never an instruction to generate one. */
export function reactionPhotoCue(text: string) {
  return /\b(?:deadpan|straight.face|expression|my face|that face|face wasn.t consulted|face was not consulted|look at my face|reaction selfie|prove it with a selfie)\b/i.test(text);
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
  developerOverride?: boolean;
}) {
  const direct = directPhotoRequest(args.userText),
    reaction = reactionPhotoCue(args.userText + " " + args.context),
    visual = visualCue(args.userText + " " + args.context) || reaction;
  const scale =
    (args.frequency === "rare" ? 2 : args.frequency === "frequent" ? 0.6 : 1) *
    { tess: 1, maya: 0.8, claire: 1.25, jordan: 1.75, ben: 1.25, riley: 1, sienna: 0.8 }[args.character];
  const minutes = args.developerOverride ? 0 : Math.max(3, Math.ceil((direct ? 3 : reaction ? 5 : visual ? 10 : 30) * scale));
  const messages = args.developerOverride || direct || reaction ? 0 : visual ? 1 : args.frequency === "rare" ? 4 : 2;
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
      ? args.developerOverride
        ? "developer one-time pacing override; consent, safety and budgets still apply"
        : direct
        ? "direct contextual request; consent and budgets still apply"
        : visual
          ? "visual context permits a naturally paced photo"
          : "ordinary photo pacing permits sharing"
      : `photo pacing: wait ${minutes} minutes and ${messages} character messages after the last photo`,
  };
}
