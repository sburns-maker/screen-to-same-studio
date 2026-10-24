import { TOWN_PLACES, travelMinutes } from "./town";
export const PLACE_CATEGORIES = {
  all: "Everything",
  cafe: "Coffee",
  restaurant: "Food",
  bar: "Bars & Nightlife",
  library: "Books",
  park: "Outdoors",
  community: "Community",
  shop: "Shops",
} as const;
export type PlaceCategory = keyof typeof PLACE_CATEGORIES;
export function matchesPlace(kind: string, category: PlaceCategory) {
  return (
    category === "all" ||
    kind === category ||
    (category === "library" && kind === "bookshop") ||
    (category === "park" && kind === "garden")
  );
}
export function placeTravelMinutes(fromKey: string | null | undefined, toKey: string) {
  const from = TOWN_PLACES.find((p) => p.key === fromKey),
    to = TOWN_PLACES.find((p) => p.key === toKey);
  return to && from ? (from.key === to.key ? 0 : travelMinutes(from, to)) : null;
}
export function searchPlace(
  place: { label: string; community: string; kind: string },
  search: string,
) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  return normalize(`${place.label} ${place.community} ${place.kind}`).includes(normalize(search));
}
