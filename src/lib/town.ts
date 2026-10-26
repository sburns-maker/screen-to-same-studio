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
  {
    key: "hope:drop-in",
    label: "H.O.P.E. Drop-In · virtual scene",
    kind: "community",
    community: "Altoona",
    latitude: 40.514,
    longitude: -78.398,
    description:
      "A fictional drop-in social scene using a local name as geographic grounding. All people and activities are fictional; this is not a representation of real visitors or services. Pin and hours are illustrative, not service information.",
    opens: 10,
    closes: 18,
  },
  {
    key: "park:canal",
    label: "Canal Green",
    kind: "park",
    community: "Hollidaysburg",
    latitude: 40.431,
    longitude: -78.397,
    description:
      "A fictional canalside green with a walking path, benches and ordinary quiet afternoons.",
    opens: 7,
    closes: 20,
  },
  {
    key: "coffee:porch",
    label: "The Open Porch",
    kind: "cafe",
    community: "Altoona",
    latitude: 40.51,
    longitude: -78.402,
    description:
      "A fictional small bakery and casual hangout with a sheltered porch and a shared puzzle table.",
    opens: 8,
    closes: 19,
  },
  {
    key: "reading:lantern",
    label: "Lantern Reading Room",
    kind: "library",
    community: "Hollidaysburg",
    latitude: 40.429,
    longitude: -78.393,
    description:
      "A fictional evening reading room with a discussion table, public shelves and quiet corners. All programs and attendees are invented.",
    opens: 10,
    closes: 22,
  },
  {
    key: "diner:valley",
    label: "Valley Table",
    kind: "restaurant",
    community: "Hollidaysburg",
    latitude: 40.432,
    longitude: -78.39,
    description: "A fictional casual diner with booths and an unhurried dinner service.",
    opens: 8,
    closes: 22,
  },
  {
    key: "market:borough",
    label: "Borough Market",
    kind: "shop",
    community: "Altoona",
    latitude: 40.516,
    longitude: -78.408,
    description: "A fictional neighborhood grocery and small provisions shop.",
    opens: 8,
    closes: 21,
  },
  {
    key: "garden:rail",
    label: "Rail Garden",
    kind: "garden",
    community: "Tyrone",
    latitude: 40.668,
    longitude: -78.243,
    description: "A fictional public garden and short walking loop near the virtual town center.",
    opens: 7,
    closes: 20,
  },
  {
    key: "trivia:foundry",
    label: "Foundry Table",
    kind: "bar",
    community: "Altoona",
    latitude: 40.521,
    longitude: -78.401,
    description:
      "A fictional casual bar with a public trivia table, warm booths and non-alcoholic refreshments. Games and guests are invented, not a real venue's event listing.",
    opens: 16,
    closes: 23,
  },
  {
    key: "park:willow",
    label: "Willow Bend Green",
    kind: "park",
    community: "Duncansville",
    latitude: 40.425,
    longitude: -78.434,
    description: "A fictional green with a gentle loop, a shaded bench and a small picnic area.",
    opens: 7,
    closes: 20,
  },
  {
    key: "arts:orchard",
    label: "Orchard Studio",
    kind: "community",
    community: "Duncansville",
    latitude: 40.423,
    longitude: -78.431,
    description:
      "A fictional open arts room with sketch tables and a small display wall. All activities and visitors are fictional.",
    opens: 10,
    closes: 20,
  },
  {
    key: "dinner:fanellis",
    label: "Fanelli's Italian Villa",
    kind: "restaurant",
    community: "Altoona",
    latitude: 40.512,
    longitude: -78.396,
    description:
      "A virtual Italian dining scene using a local restaurant name as geographic grounding. Menu, staff, guests and hours are invented; this is not service information, a reservation or a verified address.",
    opens: 11,
    closes: 22,
  },
  {
    key: "bar:4ds",
    label: "4D's Lounge",
    kind: "bar",
    community: "Altoona",
    latitude: 40.4985,
    longitude: -78.4105,
    description:
      "A casual neighborhood bar on Logan Avenue: drinks, music and easy socializing. Staff, guests and nightly happenings in scenes are invented.",
    opens: 16,
    closes: 2,
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
  {
    key: "mira-dalton",
    name: "Mira Dalton",
    age: 32,
    place: "park:canal",
    days: [0, 2, 4, 6],
    start: 12,
    end: 17,
    blurb: "A ceramicist who enjoys unhurried walks and notices small details.",
    personality:
      "Curious and dryly funny, independent and protective of quiet time. Taking a break from a personal ceramics project. Open to friendship without assumed romance; compliments do not buy access.",
    interests: ["Ceramics", "Walking", "Birds"],
  },
  {
    key: "theo-finch",
    name: "Theo Finch",
    age: 35,
    place: "coffee:porch",
    days: [1, 2, 3, 5, 6],
    start: 10,
    end: 16,
    blurb: "A baker and puzzle enthusiast grabbing a break between small projects.",
    personality:
      "Sociable in short bursts, playful and practical. Values reliability over flashy flirting. Has work and friends beyond the user. Can decline contact or end a conversation naturally.",
    interests: ["Baking", "Puzzles", "Live music"],
  },
  {
    key: "inez-carter",
    name: "Inez Carter",
    age: 41,
    place: "hope:drop-in",
    days: [1, 3, 4, 5],
    start: 11,
    end: 16,
    blurb: "A fictional craft-session volunteer who likes community gardens and old films.",
    personality:
      "Thoughtful, grounded and gently humorous. An invented person in the fictional scene, never a real visitor or service worker. Shares ordinary hobby interests; never invents real attendees, private support histories or clinical advice. Likes connection without assuming romance.",
    interests: ["Crafts", "Community gardens", "Old films"],
  },
  {
    key: "orla-june",
    name: "Orla June",
    age: 44,
    place: "reading:lantern",
    days: [2, 4],
    start: 18,
    end: 21,
    blurb: "A fictional volunteer reading-group host who enjoys unhurried discussion.",
    personality:
      "Patient and curious, allows disagreement and quiet listeners. Leads fictional open reading discussions. Never claims real bookings or private attendee information. No automatic friendship, romance or contact consent.",
    interests: ["Reading", "Community arts", "Walking"],
  },
  {
    key: "elliot-reed",
    name: "Elliot Reed",
    age: 34,
    place: "reading:lantern",
    days: [2, 4],
    start: 18,
    end: 21,
    blurb: "A fictional regular at public reading discussions with a taste for science fiction.",
    personality:
      "Warm, observant and independent. Enjoys talking about books without testing people. May be busy or decline contact. Do not invent private facts about other attendees.",
    interests: ["Science fiction", "Gardens", "Board games"],
  },
  {
    key: "robin-hale",
    name: "Robin Hale",
    age: 42,
    place: "trivia:foundry",
    days: [4, 5, 6],
    start: 18,
    end: 22,
    blurb: "A fictional regular who likes a good trivia question more than a perfect score.",
    personality:
      "Wry, welcoming and independent. Enjoys science and music; never assumes friendship or contact consent. Describes only fictional local games, never real patrons or staff.",
    interests: ["Trivia", "Music", "Cycling"],
  },
  {
    key: "dana-soler",
    name: "Dana Soler",
    age: 37,
    place: "arts:orchard",
    days: [2, 5, 6],
    start: 14,
    end: 19,
    blurb: "A fictional amateur printmaker who enjoys quiet company at the sketch table.",
    personality:
      "Observant and gently direct. Interested in art, local walks and community projects. Can decline conversation or contact. No assumed romance or private knowledge about other people.",
    interests: ["Printmaking", "Walking", "Community art"],
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
export function placeOpen(place: {opens:number;closes:number}, now: Date) {
  const { hour } = easternClock(now);
  // Closing hour below opening hour means the place stays open past midnight.
  return place.closes > place.opens
    ? hour >= place.opens && hour < place.closes
    : hour >= place.opens || hour < place.closes;
}
export function travelMinutes(
  from: {key:string;latitude:number;longitude:number} | undefined,
  to: {key:string;latitude:number;longitude:number},
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
