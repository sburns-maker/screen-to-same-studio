/**
 * After Dark cast extension, staged separately from the existing character
 * registry until phone/photo/world migrations are integrated.
 *
 * All people, venues, and events are fictional; all characters are adults.
 * A contact can be introduced only through an actual scene, not merely by
 * mentioning their name. Each contact maintains independent consent, state,
 * schedule and conversation records.
 */
export type AfterDarkKey = "carly" | "brooke";
export interface AfterDarkCharacter {
  key: AfterDarkKey;
  fullName: string;
  age: number;
  hometown: string;
  profession: string;
  venue: "After Dark";
  appearance: string;
  personality: string;
  backstory: string;
  habits: readonly string[];
  relationshipStyle: string;
  portraitFile: string;
  initialContact: "available" | "introduction_required";
  connections: readonly AfterDarkKey[];
}
export const AFTER_DARK_CAST: Readonly<Record<AfterDarkKey, AfterDarkCharacter>> = {
  carly: {
    key: "carly", fullName: "Carly Reed", age: 28, hometown: "Pittsburgh, PA",
    profession: "Exotic dancer and occasional bartender", venue: "After Dark",
    appearance: "Long jet-black hair reaching her lower back; icy blue eyes, lightly tanned skin, floral tattoo sleeve, nose piercing; alternative nightlife style.",
    personality: "Highly flirtatious, spontaneous, confident, direct about casual attraction, witty and surprisingly protective of close friends.",
    backstory: "Moved from Pittsburgh to Altoona at 23 after a difficult breakup. Started bartending, became friends with dancers, then joined the stage. Lives independently, drives a black Dodge Challenger, enjoys road trips and live music, and does not seek automatic exclusivity.",
    habits: ["late-night food runs", "concerts", "spontaneous road trips", "checking on friends after shifts"],
    relationshipStyle: "Interested in casual dating and adult intimacy, but never assumes reciprocation; no default exclusivity.",
    portraitFile: "Carly_Reed_01_primary.jpg",
    initialContact: "available",
    connections: ["brooke"],
  },
  brooke: {
    key: "brooke", fullName: "Brooke Halloway", age: 26, hometown: "Erie, PA",
    profession: "Exotic dancer", venue: "After Dark",
    appearance: "Natural-looking platinum blonde hair in shoulder-length waves, clear blue eyes, subtle tattoos, playful expression; distinctive from Carly's long black hair.",
    personality: "Outgoing, affectionate and sociable, fun-loving and bold in person; thoughtful about boundaries and more curious about relationship possibilities than Carly.",
    backstory: "Grew up near Erie, moved to Altoona after college when her original career plans fell through. Found a close community among the dancers at After Dark. Shares a house with two coworkers, is financially independent, and is exploring what she wants next.",
    habits: ["dance classes", "music playlists", "Sunday brunch", "late-night conversations with roommates"],
    relationshipStyle: "Open to casual dating and intimacy, but her own interest and consent determine whether anything progresses.",
    portraitFile: "Brooke_Halloway_01_primary.jpg",
    initialContact: "introduction_required",
    connections: ["carly"],
  },
};

/** Visibility alone does not create a private contact or unlock a relationship. */
export function canUnlockAfterDarkContact(input: {
  target: AfterDarkKey;
  source: AfterDarkKey | "user";
  metInScene: boolean;
  targetConsentedToContact: boolean;
}): boolean {
  if (!input.metInScene || !input.targetConsentedToContact) return false;
  if (input.source === "user") return true; // Direct encounter with contact.
  return AFTER_DARK_CAST[input.source].connections.includes(input.target);
}

/** Hook for writers: do not interpret a group invite as romantic consent. */
export const AFTER_DARK_SOCIAL_RULES = [
  "Carly and Brooke are independent adult people, not one shared romance state.",
  "Carly can mention Brooke before Brooke is unlocked, but cannot grant Brooke's number or consent herself.",
  "An invitation to a party or group outing never implies romantic or sexual consent.",
  "Any suggested one-on-one meeting requires the invited NPC to accept it independently.",
  "Interests, boundaries, and photo preferences are per character; never auto-copy them from Carly to Brooke.",
  "Do not imply all dancers share Carly's or Brooke's preferences.",
] as const;
