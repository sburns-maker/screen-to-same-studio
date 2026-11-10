import { boundaryAllows, type PhotoBoundary, type PhotoCategory } from "./photo-policy";

/**
 * Check the category actually purchased, not the provider used to produce it.
 * Brooke/Carly route ordinary selfies through SpicyAPI; that alone never
 * requires mature-photography consent or a boundary of "none".
 * Missing/unknown categories or settings fail closed.
 */
export function spicyDeliveryBoundaryAllows(
  photo: { type?: string; photoType?: string },
  conversation: { mature_photography: boolean | null; photo_boundary: string | null } | null,
): boolean {
  if (!conversation) return false;
  const boundary = conversation.photo_boundary;
  if (boundary !== "none" && boundary !== "selfies" &&
      boundary !== "all_photos" && boundary !== "mature") return false;
  let category: PhotoCategory;
  if (photo.type === "ordinary") {
    const ordinary = photo.photoType ?? "personal_selfie";
    if (!["object", "tess_candid", "casual_selfie", "personal_selfie", "intimate_selfie"].includes(ordinary))
      return false;
    category = ordinary as PhotoCategory;
  } else if (photo.type === "mature_romantic" || photo.type === "suggestive") {
    if (conversation.mature_photography !== true) return false;
    category = photo.type;
  } else {
    return false;
  }
  return boundaryAllows(boundary as PhotoBoundary, category);
}
