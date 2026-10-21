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
