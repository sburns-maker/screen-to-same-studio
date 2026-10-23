import { TOWN_PLACES } from "./town";
import { EXPERIENCE_TEMPLATES, experienceForPlace } from "./venue-experiences";
export type VenueAction =
  | "look"
  | "menu"
  | "order_coffee"
  | "order_food"
  | "seat"
  | "wait"
  | "walk"
  | "browse"
  | "join"
  | "discuss"
  | "leave";
const actions: Record<string, readonly VenueAction[]> = {
  bar: ["look", "menu", "order_food", "seat", "join", "discuss", "wait"],
  cafe: ["look", "menu", "order_coffee", "seat", "wait"],
  restaurant: ["look", "menu", "seat", "order_food", "wait"],
  park: ["look", "walk", "seat", "wait"],
  garden: ["look", "walk", "seat"],
  bookshop: ["look", "browse", "seat", "discuss"],
  library: ["look", "browse", "seat", "join", "discuss", "wait"],
  community: ["look", "browse", "seat", "join", "discuss"],
  shop: ["look", "browse"],
};
export const ACTION_LABELS: Record<VenueAction, string> = {
  look: "Look around",
  menu: "Browse the fictional menu",
  order_coffee: "Order a virtual coffee",
  order_food: "Order a virtual meal",
  seat: "Find a seat",
  wait: "Wait for a companion",
  walk: "Take a walk",
  browse: "Explore the public space",
  join: "Join the activity",
  discuss: "Participate in discussion",
  leave: "Leave this visit",
};
export const PLACE_REGISTRY = TOWN_PLACES.map((p) => ({
  ...p,
  designation:
    p.key === "hope:drop-in" || p.key === "dinner:fanellis"
      ? ("unverified_real_name_fictional_scene" as const)
      : ("fictional" as const),
  address: null as string | null,
  addressStatus: "unverified" as const,
  state: "PA",
  zip: null as string | null,
  coordinatesStatus: "illustrative_fictional" as const,
  public: true,
  walkIns: true,
  reservationRequired: false,
  invitationRequired: false,
  areas:
    p.kind === "restaurant"
      ? ["public dining area"]
      : p.kind === "library"
        ? ["public reading room", "discussion table"]
        : ["public area"],
  experience_templates: Object.fromEntries(
    experienceForPlace(p.kind).map((kind) => [kind, EXPERIENCE_TEMPLATES[kind]]),
  ),
  activities: actions[p.kind] ?? actions["community"]!,
  eventCategories:
    p.kind === "library" || p.kind === "bookshop"
      ? ["book_club", "meetup"]
      : p.kind === "bar"
        ? ["trivia", "meetup"]
        : p.kind === "restaurant"
          ? ["dinner", "meetup"]
          : ["coffee", "walk", "meetup"],
  associations:
    p.key === "reading:lantern" || p.key === "books:hollidaysburg" ? ["claire"] : ([] as string[]),
  marker: {
    category: p.kind,
    icon:
      p.kind === "library" || p.kind === "bookshop"
        ? "📚"
        : p.kind === "park" || p.kind === "garden"
          ? "🌿"
          : p.kind === "restaurant"
            ? "🍽️"
            : p.kind === "cafe"
              ? "☕"
              : "🏘️",
  },
  visual: {
    kind: "stable_local_artwork" as const,
    palette: p.kind === "park" || p.kind === "garden" ? "green" : "warm",
  },
}));
export const placeByKey = (key: string | null | undefined) =>
  PLACE_REGISTRY.find((p) => p.key === key);
export function venueFromText(text: string) {
  return PLACE_REGISTRY.filter((p) =>
    text.toLocaleLowerCase().includes(p.label.replace(" · virtual scene", "").toLocaleLowerCase()),
  );
}
export function placeKnowledge() {
  return (
    "PUBLIC VIRTUAL VENUE REGISTRY (fictional activities, never GPS): " +
    PLACE_REGISTRY.map(
      (p) =>
        `${p.key}: ${p.label}, ${p.community}, ${p.designation}, virtual hours ${p.opens}–${p.closes} Eastern, ${p.eventCategories.join("/")}; ${p.address ? "verified address " + p.address : "NO VERIFIED STREET ADDRESS; offer the virtual map meeting point, never invent an address"}`,
    ).join("\n") +
    "\nChoose a venue only when it fits; leave details undecided if not agreed. Never claim bookings, emails, reservations or host confirmations that are unavailable. Fictional H.O.P.E. encounters never describe real clients, records or staff."
  );
}
export function interpretVenueAction(
  text: string,
): { action: VenueAction; quantity: number } | null {
  const s = text.toLowerCase();
  if (/\b(?:drive|teleport|force|kiss|hug|buy.*friend)\b/.test(s)) return null;
  if (/\b(?:order|buy|get)\b.*\b(?:coffee|tea|drink)\b/.test(s))
    return { action: "order_coffee", quantity: /\btwo\b|\b2\b/.test(s) ? 2 : 1 };
  if (/\b(?:order|buy|get)\b.*\b(?:food|meal|dinner)\b/.test(s))
    return { action: "order_food", quantity: 1 };
  if (/\b(?:sit|seat|table|bench)\b/.test(s)) return { action: "seat", quantity: 1 };
  if (/\b(?:look|find|around)\b/.test(s)) return { action: "look", quantity: 1 };
  if (/\bmenu\b/.test(s)) return { action: "menu", quantity: 1 };
  if (/\bwait\b/.test(s)) return { action: "wait", quantity: 1 };
  if (/\b(?:join|check in)\b/.test(s)) return { action: "join", quantity: 1 };
  if (/\b(?:discuss|discussion|participate)\b/.test(s)) return { action: "discuss", quantity: 1 };
  if (/\b(?:walk|trail)\b/.test(s)) return { action: "walk", quantity: 1 };
  if (/\b(?:browse|explore)\b/.test(s)) return { action: "browse", quantity: 1 };
  if (/\b(?:leave|finish)\b/.test(s)) return { action: "leave", quantity: 1 };
  return null;
}
