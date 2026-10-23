import { PHOTOGRAPHY_PROFILES } from "./photo-personality";
import { photoPacing, reactionPhotoCue, visualCue } from "./photo-pacing";
import type { CharacterKey } from "./characters";
import type { TessActivity } from "./tess-life";
import type { TessState } from "./tess-logic";
import { FREQUENCY_RULES, type PhotoFrequency } from "./tess-photos";

export const PHOTO_TENDENCIES = Object.fromEntries(
  Object.entries(PHOTOGRAPHY_PROFILES).map(([key, p]) => [
    key,
    { hours: p.hours, messages: p.messages, chance: p.spontaneity, subjects: p.subjects },
  ]),
) as Record<CharacterKey, { hours: number; messages: number; chance: number; subjects: string }>;

export type PhotoOpportunity = {
  eligible: boolean;
  selected: boolean;
  reason: string;
  key: string;
  hint: string;
};
export function photoOpportunity(args: {
  character: CharacterKey;
  conversationId: string;
  now: Date;
  schedule: TessActivity;
  state: TessState;
  frequency: PhotoFrequency;
  eligibleTypes: readonly string[];
  lastPhotoAt: string | null;
  ownSinceLastPhoto: number;
  gapHours: number;
  lastInitiatedAt?: string | null;
  context?: string;
  preview?: boolean;
  activeConversation?: boolean;
  developerOverride?: boolean;
  userText?: string;
}): PhotoOpportunity {
  const profile = PHOTO_TENDENCIES[args.character];
  const slot = Math.floor(args.now.getTime() / (profile.hours * 3_600_000));
  const key = `${args.conversationId}:${args.character}:${slot}`;
  const no = (reason: string): PhotoOpportunity => ({
    eligible: false,
    selected: false,
    reason,
    key,
    hint: "",
  });
  if (args.schedule.availability === "asleep" || args.schedule.availability === "busy")
    return no(
      `Unavailable right now: ${args.schedule.detail} (${args.schedule.availability}). Wait for a compatible break.`,
    );
  if (
    /driv|surgery|emergency|phone (?:down|away)|patient|private|winding down/i.test(
      args.schedule.detail,
    )
  )
    return no("current activity is incompatible with a photo");
  if (!args.eligibleTypes.length)
    return no("no permitted photo categories (capability, relationship or boundary)");
  if (args.state.curiosity < 30 || (args.state.comfort < 40 && args.state.trust < 25))
    return no("not sufficiently interested or comfortable to initiate sharing");
  if (args.state.irritation >= 20 || args.state.perceived_pressure >= 30)
    return no("not independently inclined to share");
  const scale = args.frequency === "rare" ? 2 : args.frequency === "frequent" ? 0.75 : 1;
  const contextualReaction =
    reactionPhotoCue(args.context ?? "") || reactionPhotoCue(args.userText ?? "");
  if (args.activeConversation || args.developerOverride || contextualReaction) {
    const pacing = photoPacing({
      character: args.character,
      frequency: args.frequency,
      now: args.now,
      lastPhotoAt: args.lastPhotoAt,
      ownSinceLastPhoto: args.ownSinceLastPhoto,
      userText: args.userText ?? "",
      context: args.context ?? "",
      developerOverride: !!args.developerOverride,
    });
    if (!pacing.allowed) return no(pacing.reason);
  } else {
    const hours = profile.hours * scale * (visualCue(args.context ?? "") ? 0.6 : 1);
    if (args.lastPhotoAt && args.now.getTime() - Date.parse(args.lastPhotoAt) < hours * 3600000)
      return no("photo time cooldown");
    if (
      args.lastPhotoAt &&
      args.ownSinceLastPhoto <
        Math.min(FREQUENCY_RULES[args.frequency].cooldown, Math.ceil(profile.messages * scale))
    )
      return no("photo message cooldown");
  }
  if (args.gapHours < 0) return no("a reply is still pending");
  if (!args.preview && !args.activeConversation && args.gapHours < 0.5)
    return no("conversation was active very recently");
  if (args.lastInitiatedAt && args.now.getTime() - Date.parse(args.lastInitiatedAt) < 3_600_000)
    return no("already initiated recently");
  if (!args.context?.trim()) return no("no current visual context");
  // Stable per opportunity: polling more often (or Practice mode) never rerolls the chance.
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const chance = Math.min(
    0.85,
    profile.chance +
      (visualCue(args.userText ?? "") ? 0.15 : visualCue(args.context ?? "") ? 0.08 : 0),
  );
  const selected = !!args.preview || (hash >>> 0) / 4294967296 < chance;
  return {
    eligible: true,
    selected,
    reason: selected ? "contextual photo opportunity" : "chooses not to share this opportunity",
    key,
    hint: `PHOTO OPPORTUNITY (optional, not an obligation): ${args.context}. Your own tendencies: ${profile.subjects}. You may open with an ordinary photo and a short in-character caption, including two brief texts if natural. Use only established memories for callbacks, gifts and upcoming plans. Never invent a visit, object, date or completed event. A shared image is not a flirting reward. Respect eligibility and your independent willingness; choose photo=null or no message if you don't want to share. No clinic patients, records, screens, identifying paperwork or bystanders. For a specific new moment prefer generating it over an unrelated stock photo.`,
  };
}

export function attachmentPresent(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return !!(md["photo"] || md["generated_path"] || md["generated_image_id"]);
}
