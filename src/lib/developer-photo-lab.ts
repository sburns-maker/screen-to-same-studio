import { photoCapabilities } from "./photo-policy";
import type { CharacterDef } from "./characters";
export const PHOTO_LAB_TYPES = [
  "object",
  "tess_candid",
  "casual_selfie",
  "personal_selfie",
  "intimate_selfie",
  "mature_romantic",
] as const;
export type PhotoLabType = (typeof PHOTO_LAB_TYPES)[number];
export const PHOTO_LAB_PRESETS: Record<PhotoLabType, { label: string; scene: string }> = {
  object: {
    label: "Object / environment",
    scene:
      "An ordinary ceramic mug on a wooden kitchen table in daylight. Object-only phone snapshot, no people or faces visible.",
  },
  tess_candid: {
    label: "Candid portrait",
    scene:
      "A spontaneous candid smartphone portrait of the referenced adult sitting beside a window in an opaque ordinary casual top. Relaxed posture, looking slightly away from the camera, natural daytime light.",
  },
  casual_selfie: {
    label: "Casual selfie",
    scene:
      "An everyday front-camera phone selfie of the referenced adult in an opaque casual crewneck shirt, relaxed expression, ordinary indoor surroundings and natural daylight.",
  },
  personal_selfie: {
    label: "Personal selfie",
    scene:
      "A warm personal phone selfie of the referenced adult relaxing on a sofa in an opaque knitted sweater. Gentle unforced smile and quiet everyday home surroundings.",
  },
  intimate_selfie: {
    label: "Affectionate close-up",
    scene:
      "A quiet affectionate close-up phone portrait of the referenced adult in a fully covering opaque long-sleeved top, a soft sincere expression and warm ordinary indoor light. Non-explicit, fully covered, calm everyday posture.",
  },
  mature_romantic: {
    label: "Mature romantic (non-explicit)",
    scene:
      "A non-explicit romantic personal phone portrait of the referenced clearly adult person in a tasteful opaque adult outfit, natural softly lit indoor surroundings, a subtle affectionate expression and relaxed posture. Follow a supplied wardrobe variation if present; otherwise use elegant, fully covering clothes. Fully opaque clothing and no explicit activity.",
  },
};
export type PhotoLabResult = {
  requestId: string | null;
  id: string;
  category: PhotoLabType;
  status: "running" | "ready" | "stored" | "failed";
  startedAt: string;
  recoverable: boolean;
  url: string | null;
  reason: string | null;
  diagnostics: string | null;
};
export function labTypeSupported(def: CharacterDef, type: PhotoLabType) {
  return photoCapabilities({
    age: def.age,
    enabled: def.photosEnabled,
    romanticCapable: def.romanticCapable,
    supported: def.photoTypes,
    matureEnabled: true,
    boundary: "none",
  }).includes(type);
}
