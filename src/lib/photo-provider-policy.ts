/**
 * Pure, shared photo-provider policy. Every image entry point (chat replies,
 * autonomous/spontaneous photos, developer lab, recovery) resolves the provider
 * through `configuredPhotoProvider`, which calls this; keyed by stable
 * character key, never display name.
 */
export type PhotoProviderKind = "ordinary" | "spicyapi";
export type SpicyCategory = "ordinary" | "mature_romantic" | "suggestive";

/** Characters whose every person photo (selfies, candids, portraits) uses SpicyAPI. */
export const SPICY_ALL_PERSON_PHOTOS = ["carly", "brooke"] as const;

const MATURE = new Set(["mature_romantic", "suggestive"]);

export function configuredProviderFor(key: string, type: string): PhotoProviderKind {
  if (MATURE.has(type)) return "spicyapi";
  if (type !== "object" && (SPICY_ALL_PERSON_PHOTOS as readonly string[]).includes(key)) return "spicyapi";
  return "ordinary";
}

export function spicyCategory(type: string): SpicyCategory {
  return type === "suggestive" ? "suggestive" : type === "mature_romantic" ? "mature_romantic" : "ordinary";
}
