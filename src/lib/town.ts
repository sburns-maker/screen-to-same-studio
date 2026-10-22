/** Fictional venues near approximate public community centers; never device GPS. */
export const TOWN_PLACES = [
  {
    key: "coffee:local",
    label: "Switchyard Coffee",
    kind: "cafe",
    community: "Altoona",
    latitude: 40.5187,
    longitude: -78.3947,
    description:
      "A fictional neighborhood cafe: mismatched mugs, a community board, and a quiet window table.",
    opens: 7,
    closes: 19,
  },
  {
    key: "park:local",
    label: "Juniper Commons",
    kind: "park",
    community: "Altoona",
    latitude: 40.525,
    longitude: -78.405,
    description: "A fictional pocket park with a walking loop and sheltered picnic tables.",
    opens: 7,
    closes: 20,
  },
  {
    key: "books:hollidaysburg",
    label: "Paper & Fern",
    kind: "bookshop",
    community: "Hollidaysburg",
    latitude: 40.4273,
    longitude: -78.3889,
    description:
      "A fictional independent bookshop with used paperbacks and a small reading corner.",
    opens: 10,
    closes: 18,
  },
  {
    key: "hall:tyrone",
    label: "Little Juniata Workshop",
    kind: "community",
    community: "Tyrone",
    latitude: 40.6706,
    longitude: -78.2386,
    description:
      "A fictional community workshop for repairs, crafts, and occasional small gatherings.",
    opens: 10,
    closes: 18,
  },
] as const;
export type TownNpc = {
  key: string;
  name: string;
  age: number;
  place: string;
  days: readonly number[];
  start: number;
  end: number;
  blurb: string;
  personality: string;
  interests: readonly string[];
};
export const TOWN_NPCS = [
  {
    key: "rowan-ellis",
    name: "Rowan Ellis",
    age: 33,
    place: "coffee:local",
    days: [1, 2, 3, 4, 5, 6],
    start: 9,
    end: 15,
    blurb: "A patient bicycle mechanic who likes old railway photographs and weekend rides.",
    personality:
      "Warm but matter-of-fact. Finishing a crossword over coffee before the afternoon repair shift. Values practical curiosity, dislikes pressure. Friendship is possible; no assumed romance.",
    interests: ["Bicycles", "Local history", "Crosswords"],
  },
  {
    key: "leah-moss",
    name: "Leah Moss",
    age: 36,
    place: "books:hollidaysburg",
    days: [0, 2, 3, 4, 5, 6],
    start: 11,
    end: 17,
    blurb: "A freelance illustrator browsing used books and botanical prints.",
    personality:
      "Observant, gently witty, a little private. Researching a personal botanical illustration project. Has obligations beyond this encounter. Interested in a thoughtful conversation, not automatic intimacy.",
    interests: ["Illustration", "Plants", "Used books"],
  },
  {
    key: "nolan-reed",
    name: "Nolan Reed",
    age: 38,
    place: "hall:tyrone",
    days: [0, 3, 5, 6],
    start: 11,
    end: 16,
    blurb: "A volunteer repair host with an interest in cooking and restoring radios.",
    personality:
      "Friendly in a quiet, practical way. Sorting donated tools for the next repair session. Enjoys exchanging ideas, can end a conversation when busy. Does not owe the user friendship or contact access.",
    interests: ["Repair", "Cooking", "Old radios"],
  },
] as const;
export type TownNpcKey = (typeof TOWN_NPCS)[number]["key"];
export function easternClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  return {
    hour: Number(parts.find((p) => p.type === "hour")!.value),
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.find((p) => p.type === "weekday")!.value,
    ),
  };
}
export function npcPresent(npc: TownNpc, now: Date) {
  const { hour, day } = easternClock(now);
  return (npc.days as readonly number[]).includes(day) && hour >= npc.start && hour < npc.end;
}
export function placeOpen(place: (typeof TOWN_PLACES)[number], now: Date) {
  const { hour } = easternClock(now);
  return hour >= place.opens && hour < place.closes;
}
export function travelMinutes(
  from: (typeof TOWN_PLACES)[number] | undefined,
  to: (typeof TOWN_PLACES)[number],
) {
  if (!from) return 15; // Virtual home has no public address.
  if (from.key === to.key) return 0;
  const r = Math.PI / 180;
  const a =
    Math.sin(((to.latitude - from.latitude) * r) / 2) ** 2 +
    Math.cos(from.latitude * r) *
      Math.cos(to.latitude * r) *
      Math.sin(((to.longitude - from.longitude) * r) / 2) ** 2;
  return Math.max(
    5,
    Math.ceil(((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 35) * 60 + 5),
  );
}
