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
  | "leave"
  | "cook"
  | "movie"
  | "games"
  | "chores"
  | "relax";
const actions: Record<string, readonly VenueAction[]> = {
  home: ["look", "seat", "wait", "cook", "movie", "games", "chores", "relax"],
  bar: ["look", "menu", "order_food", "seat", "join", "discuss", "wait"],
  cafe: ["look", "menu", "order_coffee", "seat", "wait"],
  restaurant: ["look", "menu", "seat", "order_food", "wait"],
  park: ["look", "walk", "seat", "wait"],
  garden: ["look", "walk", "seat"],
  bookshop: ["look", "browse", "seat", "discuss"],
  library: ["look", "browse", "seat", "join", "discuss", "wait"],
  community: ["look", "browse", "seat", "join", "discuss"],
  shop: ["look", "browse"],
  workplace: ["look", "wait", "discuss", "leave"],
};
export const ACTION_LABELS: Record<VenueAction, string> = {
  cook: "Prepare a meal",
  movie: "Watch a movie",
  games: "Play a game",
  chores: "Work on household chores",
  relax: "Relax",
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
// Street addresses supplied by the owner; all other venues keep the virtual map meeting point.
const VERIFIED_ADDRESSES: Record<string, string> = {
  "bar:4ds": "1801 Logan Avenue, Altoona, PA",
};
export const PLACE_REGISTRY = TOWN_PLACES.map((p) => ({
  ...p,
  designation:
    p.key === "hope:drop-in" || p.key === "dinner:fanellis" || p.key === "bar:4ds"
      ? ("unverified_real_name_fictional_scene" as const)
      : ("fictional" as const),
  address: (VERIFIED_ADDRESSES[p.key] ?? null) as string | null,
  addressStatus: (VERIFIED_ADDRESSES[p.key] ? "verified" : "unverified") as
    "verified" | "unverified",
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
      : p.key === "bar:4ds"
        ? ["drinks", "date", "meetup"]
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
// Short names people actually type for a registered venue, including common misspellings.
const VENUE_ALIASES: Record<string, readonly string[]> = {
  "dinner:fanellis": ["fanelli", "finelli"],
  "bar:4ds": ["4d's", "4ds", "4d", "four d's"],
};
const normalizeVenueText = (text: string) => text.toLocaleLowerCase().replace(/[’‘`]/g, "'");
export function venueFromText(text: string) {
  const s = normalizeVenueText(text);
  return PLACE_REGISTRY.filter((p) => {
    const label = normalizeVenueText(p.label.replace(" · virtual scene", ""));
    if (s.includes(label)) return true;
    return (VENUE_ALIASES[p.key] ?? []).some((a) => new RegExp(`\\b${a}\\b`).test(s));
  });
}
export function placeKnowledge() {
  return (
    "PUBLIC VIRTUAL VENUE REGISTRY (fictional activities, never GPS): " +
    PLACE_REGISTRY.map(
      (p) =>
        `${p.key}: ${p.label}, ${p.community}, ${p.designation}, hours ${p.opens}:00–${p.closes}:00 Eastern${p.closes < p.opens ? " (past midnight)" : ""}, ${p.eventCategories.join("/")}; ${p.address ? "verified address " + p.address : "NO VERIFIED STREET ADDRESS; offer the virtual map meeting point, never invent an address"}`,
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
  if (/\b(?:cook|cooking|prepare.*meal)\b/.test(s)) return { action: "cook", quantity: 1 };
  if (/\b(?:watch|put on)\b.*\b(?:movie|film)\b/.test(s)) return { action: "movie", quantity: 1 };
  if (/\bplay\b.*\bgame\b/.test(s)) return { action: "games", quantity: 1 };
  if (/\b(?:clean|chores|tidy)\b/.test(s)) return { action: "chores", quantity: 1 };
  if (/\brelax\b/.test(s)) return { action: "relax", quantity: 1 };
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
