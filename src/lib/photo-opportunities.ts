import { PHOTOGRAPHY_PROFILES } from "./photo-personality";
import { reactionPhotoCue, visualCue } from "./photo-pacing";
import type { CharacterKey } from "./characters";
import type { TessActivity } from "./tess-life";
import { photoActivityBlock } from "./photo-activity";
import type { TessState } from "./tess-logic";
import type { PhotoFrequency } from "./tess-photos";

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
  const moment = (args.context ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 180);
  const activitySlot = Math.floor(args.now.getTime() / 3_600_000);
  const key = `${args.conversationId}:${args.character}:${activitySlot}:${moment}`;
  const no = (reason: string): PhotoOpportunity => ({
    eligible: false,
    selected: false,
    reason,
    key,
    hint: "",
  });
  const activityBlock = photoActivityBlock(args.schedule);
  if (activityBlock)
    return no(
      activityBlock === "asleep"
        ? `Unavailable right now: ${args.schedule.detail} (asleep). Wait for a compatible break.`
        : activityBlock,
    );
  if (!args.eligibleTypes.length)
    return no("no permitted photo categories (capability, relationship or boundary)");
  if (args.state.curiosity < 30 || (args.state.comfort < 40 && args.state.trust < 25))
    return no("not sufficiently interested or comfortable to initiate sharing");
  if (args.state.irritation >= 20 || args.state.perceived_pressure >= 30)
    return no("not independently inclined to share");
  // Ordinary activity is sufficient; a special event is never required. There is no wall-clock or message-count
  // cooldown: a new grounded visual moment can justify another picture immediately.
  // Repeated worker polls for the same moment remain deterministic below.
  if (args.gapHours < 0) return no("a reply is still pending");
  if (!args.context?.trim()) return no("no current visual context");
  // Stale storyline/day-off context is not an eligibility veto. The shared
  // scene check validates the actual request against current physical state.
  // Stable per opportunity: polling more often (or Practice mode) never rerolls the chance.
  let hash = 2166136261;
  for (const c of `${args.conversationId}:${args.character}:${activitySlot}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const chance = Math.min(
    0.85,
    (args.frequency === "rare" ? 0.65 : args.frequency === "frequent" ? 1.3 : 1) * profile.chance +
      (visualCue(args.userText ?? "") ? 0.15 : visualCue(args.context ?? "") ? 0.08 : 0),
  );
  const selected = !!args.preview || (hash >>> 0) / 4294967296 < chance;
  return {
    eligible: true,
    selected,
    reason: selected ? "contextual photo opportunity" : "chooses not to share this opportunity",
    key,
    hint: `PHOTO OPPORTUNITY (optional, not an obligation): ${args.context}. Your own tendencies: ${profile.subjects}. You may open with an ordinary photo and a short in-character caption, including two brief texts if natural. Use only established memories for callbacks, gifts and upcoming plans. Never invent a visit, object, date or completed event. An ordinary selfie or snapshot while doing this is enough; no special event, joke or visual punchline is required. A shared image is not a flirting reward. Respect eligibility and your independent willingness; choose photo=null or no message if you don't want to share. No clinic patients, records, screens, identifying paperwork or bystanders. For a specific new moment prefer generating it over an unrelated stock photo.`,
  };
}

export function attachmentPresent(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return !!(md["photo"] || md["generated_path"] || md["generated_image_id"]);
}
