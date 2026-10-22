import type { CharacterKey } from "./characters";
import type { TessActivity } from "./tess-life";
import type { TessState } from "./tess-logic";
import { FREQUENCY_RULES, type PhotoFrequency } from "./tess-photos";

export const PHOTO_TENDENCIES: Record<
  CharacterKey,
  { hours: number; messages: number; chance: number; subjects: string }
> = {
  tess: {
    messages: 4,
    hours: 8,
    chance: 0.38,
    subjects:
      "dry everyday observations, clinic desk breaks, Mabel, cooking; occasional unposed selfie",
  },
  maya: {
    messages: 3,
    hours: 6,
    chance: 0.6,
    subjects:
      "adventures, event preparations, places she's actually visiting, casual expressive selfies",
  },
  claire: {
    messages: 5,
    hours: 12,
    chance: 0.35,
    subjects: "garden, plants, small outdoor discoveries; an occasional quiet natural selfie",
  },
  jordan: {
    messages: 8,
    hours: 24,
    chance: 0.16,
    subjects: "a specific interesting detail worth sharing; rarely a selfie, never a performance",
  },
  ben: {
    messages: 5,
    hours: 12,
    chance: 0.25,
    subjects: "an everyday oddity, project or joke; entirely platonic",
  },
};

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
  if (!args.eligibleTypes.length)
    return no("no permitted photo categories (capability, relationship or boundary)");
  if (args.schedule.availability === "asleep" || args.schedule.availability === "busy")
    return no(`unavailable: ${args.schedule.availability}`);
  if (
    /driv|surgery|emergency|phone (?:down|away)|patient|private|winding down/i.test(
      args.schedule.detail,
    )
  )
    return no("current activity is incompatible with a photo");
  if (args.state.curiosity < 30 || (args.state.comfort < 40 && args.state.trust < 25))
    return no("not sufficiently interested or comfortable to initiate sharing");
  if (args.state.irritation >= 20 || args.state.perceived_pressure >= 30)
    return no("not independently inclined to share");
  const scale = args.frequency === "rare" ? 2 : args.frequency === "frequent" ? 0.75 : 1;
  if (
    args.lastPhotoAt &&
    args.now.getTime() - Date.parse(args.lastPhotoAt) < profile.hours * scale * 3_600_000
  )
    return no("photo time cooldown");
  if (
    args.lastPhotoAt &&
    args.ownSinceLastPhoto <
      Math.min(FREQUENCY_RULES[args.frequency].cooldown, Math.ceil(profile.messages * scale))
  )
    return no("photo message cooldown");
  if (args.gapHours < 0) return no("a reply is still pending");
  if (!args.preview && !args.activeConversation && args.gapHours < 0.5)
    return no("conversation was active very recently");
  if (args.lastInitiatedAt && args.now.getTime() - Date.parse(args.lastInitiatedAt) < 3_600_000)
    return no("already initiated recently");
  if (!args.context?.trim()) return no("no current visual context");
  // Stable per opportunity: polling more often (or Practice mode) never rerolls the chance.
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const selected = !!args.preview || (hash >>> 0) / 4294967296 < profile.chance;
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
