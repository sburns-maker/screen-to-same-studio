import type { TessState } from "./tess-logic";

export type PhotoDef = {
  id: string;
  selfie: boolean;
  /** What the photo shows, for Tess to decide when it fits. */
  about: string;
  min: Partial<TessState>;
};

/** Selfies unlock as comfort/trust grow; the most personal ones need real warmth. */
export const PHOTOS: PhotoDef[] = [
  { id: "mabel-sock", selfie: false, about: "Mabel guarding a stolen sock", min: {} },
  { id: "mabel-walk", selfie: false, about: "Mabel on a fall trail walk", min: {} },
  { id: "cooking-disaster", selfie: false, about: "burnt short ribs, recipe gone wrong", min: { comfort: 45 } },
  { id: "trivia-sheet", selfie: false, about: "trivia answer sheet full of wrong answers", min: {} },
  { id: "coffee", selfie: false, about: "latte at an indie coffee shop next to a terrible gas-station snack", min: {} },
  { id: "roadside", selfie: false, about: "giant coffee pot roadside attraction", min: { comfort: 48 } },
  { id: "selfie-work", selfie: true, about: "tired deadpan selfie at work with coffee", min: { comfort: 52, trust: 35 } },
  { id: "selfie-snow", selfie: true, about: "selfie in the snow in a winter coat and beanie", min: { comfort: 55, trust: 38 } },
  { id: "selfie-out", selfie: true, about: "selfie dressed up a bit at a bar", min: { comfort: 58, trust: 42, romantic_attraction: 40 } },
  { id: "selfie-couch", selfie: true, about: "no-makeup cozy couch selfie at night", min: { comfort: 65, trust: 55, emotional_intimacy: 35 } },
];

export function eligiblePhotos(state: TessState, opts: { irritation?: boolean } = {}) {
  if (state.irritation >= 40) return [];
  return PHOTOS.filter((p) => {
    if (opts.irritation && p.selfie) return false;
    return Object.entries(p.min).every(([k, v]) => state[k as keyof TessState] >= (v as number));
  });
}

export const PHOTO_FREQUENCIES = ["rare", "normal", "frequent"] as const;
export type PhotoFrequency = (typeof PHOTO_FREQUENCIES)[number];

/** Minimum Tess messages between photos, and chance a justified new photo is actually created. */
export const FREQUENCY_RULES: Record<PhotoFrequency, { cooldown: number; generateChance: number }> = {
  rare: { cooldown: 20, generateChance: 0.35 },
  normal: { cooldown: 12, generateChance: 0.65 },
  frequent: { cooldown: 7, generateChance: 0.9 },
};

export const GENERATED_TYPES = ["object", "tess_candid", "casual_selfie", "personal_selfie", "intimate_selfie"] as const;
export type GeneratedType = (typeof GENERATED_TYPES)[number];

const GENERATED_MIN: Record<GeneratedType, Partial<TessState>> = {
  object: {},
  tess_candid: { comfort: 50, trust: 32 },
  casual_selfie: { comfort: 52, trust: 35 },
  personal_selfie: { comfort: 60, trust: 45, romantic_attraction: 40, playfulness: 40 },
  intimate_selfie: { comfort: 65, trust: 55, emotional_intimacy: 40, romantic_attraction: 45 },
};

/** Which kinds of new photos Tess could plausibly create right now. */
export function allowedGeneratedTypes(state: TessState): GeneratedType[] {
  if (state.irritation >= 40) return [];
  return GENERATED_TYPES.filter((t) => {
    if (t !== "object" && state.irritation >= 20) return false;
    if ((t === "personal_selfie" || t === "intimate_selfie") && state.perceived_pressure >= 30) return false;
    return Object.entries(GENERATED_MIN[t]).every(([k, v]) => state[k as keyof TessState] >= (v as number));
  });
}

/** Pick a curated non-selfie that loosely matches a scene, used as a quiet fallback. */
export function curatedFallback(scene: string, eligible: PhotoDef[]) {
  const s = scene.toLowerCase();
  const keys: [RegExp, string][] = [
    [/sock/, "mabel-sock"],
    [/mabel|dog|walk|trail|hik/, "mabel-walk"],
    [/cook|burn|recipe|dinner|rib/, "cooking-disaster"],
    [/trivia/, "trivia-sheet"],
    [/coffee|latte|snack/, "coffee"],
    [/roadside|statue|attraction/, "roadside"],
  ];
  for (const [re, id] of keys) if (re.test(s)) { const p = eligible.find((e) => e.id === id && !e.selfie); if (p) return p.id; }
  return null;
}
