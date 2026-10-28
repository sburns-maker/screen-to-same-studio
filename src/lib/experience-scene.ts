import { placeByKey, venueFromText } from "./place-registry";
export const SCENE_ACTIVITIES = [
  "talking",
  "walking",
  "sitting",
  "driving",
  "arriving",
  "ordering",
  "dining",
  "finished_meal",
  "at_front_door",
  "waiting",
  "cooking",
  "watching_movie",
  "playing_game",
  "household_chore",
  "relaxing",
] as const;
export type LiveScene = {
  locationKey: string;
  locationLabel: string;
  locationKind: string;
  area: string;
  activity: (typeof SCENE_ACTIVITIES)[number];
  participants: string[];
  destinationKey: string | null;
};
export function initialScene(character: string, place: string, label: string): LiveScene {
  return {
    locationKey: place,
    locationLabel: label,
    locationKind:
      placeByKey(place)?.kind ?? (/^(?:home:|residence:)/.test(place) ? "home" : "place"),
    area: "",
    activity: placeByKey(place)?.kind === "park" ? "walking" : "talking",
    participants: ["user", character],
    destinationKey: null,
  };
}
/** Only performed actions count. Suggestions, memories, hypotheticals and negated actions do not move anyone. */
function transitionClause(
  current: LiveScene,
  text: string,
  character: string,
  name: string,
  homes?: { user: string | null; character: string | null },
): LiveScene | null {
  const s = text.trim();
  if (
    /\?|\b(?:let['’]s|shall we|want to|would you|could we|if we|maybe|tomorrow|remember|used to|last night|yesterday|earlier|wish|imagine|would|could|should|will|going to|haven['’]t|didn['’]t|not yet|don['’]t|do not)\b/i.test(
      s,
    )
  )
    return null;
  let next = { ...current };
  const home =
    new RegExp(
      `\\b(?:your|her|his|${name}(?:['’]s)?|${character}(?:['’]s)?)\\s+(?:home|house|apartment|place|front door|doorstep)\\b`,
      "i",
    ).test(s) || /\b(?:drive|drove|driving|take|took|taking) (?:you|her|him) home\b/i.test(s);
  const playerHome = /\b(?:my|our)\s+(?:home|house|apartment|place)\b/i.test(s);
  const homeDestination = homes
    ? playerHome
      ? homes.user
      : homes.character
    : playerHome
      ? "home:user"
      : `home:${character}`;
  const atResidence = home || playerHome;
  const places = venueFromText(s);
  const destination = atResidence ? homeDestination : places.length === 1 ? places[0]!.key : null;
  const arrived =
    /\b(?:arriv(?:e|ed|ing)|made it to|got (?:back )?to|pull(?:ed)? (?:up|in)|park(?:ed|s)? (?:outside|at|in front of|the car)|(?:we['’]re|we are|we['’]ve arrived) (?:now )?(?:at|inside|outside)|(?:walk|walked|step|stepped|go|went) (?:up )?(?:in(?:to)?|to)|reach(?:ed)?)\b/i.test(
      s,
    );
  const driving =
    /\b(?:(?:i|we|and) (?:drive|drove|drives)|driving|got (?:back )?in(?:to)? (?:the|my|your|her|his) car|(?:i|we) get (?:back )?in(?:to)? (?:the|my|your|her|his) car)\b/i.test(
      s,
    );
  if (arrived && destination) {
    const p = placeByKey(destination);
    next = {
      ...next,
      locationKey: destination,
      locationLabel: atResidence ? (playerHome ? "Your home" : `${name}'s home`) : p!.label,
      locationKind: atResidence ? "home" : p!.kind,
      area: atResidence ? "outside" : "",
      activity: atResidence && /front door|doorstep|porch/i.test(s) ? "at_front_door" : "arriving",
      destinationKey: null,
    };
  } else if (driving) {
    next = {
      ...next,
      locationKey: "vehicle:current",
      locationLabel: "the car",
      locationKind: "vehicle",
      area: "",
      activity: "driving",
      destinationKey: destination ?? current.destinationKey,
    };
  } else if (arrived && current.locationKind === "vehicle" && current.destinationKey) {
    const key = current.destinationKey,
      p = placeByKey(key),
      atHome = homes
        ? key === homes.character || key === homes.user
        : key === `home:${character}` || key === "home:user";
    if (p || atHome)
      next = {
        ...next,
        locationKey: key,
        locationLabel: atHome ? `${name}'s home` : p!.label,
        locationKind: atHome ? "home" : p!.kind,
        area: atHome ? "outside" : "",
        activity: atHome && /front door|doorstep|porch/i.test(s) ? "at_front_door" : "arriving",
        destinationKey: null,
      };
  } else if (
    atResidence &&
    homeDestination &&
    /\b(?:front door|doorstep|porch)\b/i.test(s) &&
    /\b(?:stand|standing|at|walk|walked|reach|reached)\b/i.test(s)
  ) {
    next = {
      ...next,
      locationKey: homeDestination,
      locationLabel: playerHome ? "Your home" : `${name}'s home`,
      locationKind: "home",
      area: "front door (outside)",
      activity: "at_front_door",
      destinationKey: null,
    };
  }
  // Movement within a public park is an activity transition, not a new venue.
  // Questions, invitations, and hypothetical actions already return above.
  if (next.locationKind === "park") {
    if (/\b(?:sit|sitting|sat|settle|settled)\b.{0,35}\b(?:bench|grass|picnic blanket)\b|\b(?:bench|grass)\b.{0,35}\b(?:sit|sitting|sat)\b/i.test(s)) {
      next.activity = "sitting";
      next.area = /\bbench\b/i.test(s) ? "park bench" : "grass";
    } else if (/\b(?:stand|stood|standing|get up|got up|rise|rose)\b.{0,30}\b(?:bench|grass|walking|path)\b|\b(?:resume|continue|start|began|begin)\b.{0,20}\b(?:walk|walking|stroll|strolling)\b/i.test(s)) {
      next.activity = "walking";
      next.area = "";
    }
  }
  if (next.locationKind === "restaurant" || next.locationKind === "cafe") {
    if (
      /\b(?:finished|finish|done with)\b.{0,35}\b(?:dinner|meal|food|eating)\b|\b(?:paid|pay) (?:the |our )?bill\b/i.test(
        s,
      )
    )
      next.activity = "finished_meal";
    else if (/\b(?:order|ordered)\b/i.test(s)) next.activity = "ordering";
    else if (/\b(?:eat|eating|dining|food arrives)\b/i.test(s)) next.activity = "dining";
  }
  if (next.locationKind === "home" && !/\b(?:front door|doorstep|porch)\b/i.test(s)) {
    if (/\b(?:we|i) (?:enter|entered|step inside|stepped inside|go inside|went inside)\b/i.test(s))
      next.area = "inside";
    if (!/outside|front door/.test(next.area)) {
      if (/\b(?:cook|cooking|chop|chopping|prepare|preparing)\b/i.test(s))
        next.activity = "cooking";
      else if (/\b(?:watch|watching|put on)\b.{0,35}\b(?:movie|film)\b/i.test(s))
        next.activity = "watching_movie";
      else if (/\b(?:play|playing)\b.{0,25}\b(?:game|cards)\b/i.test(s))
        next.activity = "playing_game";
      else if (/\b(?:clean|cleaning|tidy|chores)\b/i.test(s)) next.activity = "household_chore";
      else if (/\b(?:relax|relaxing|settle|settled)\b/i.test(s)) next.activity = "relaxing";
    }
  }
  if (next.locationKind === "home" && /\b(?:front door|doorstep|porch)\b/i.test(s))
    next.area = "front door (outside)";
  return JSON.stringify(next) === JSON.stringify(current) ? null : next;
}
export function transitionScene(
  current: LiveScene,
  text: string,
  character: string,
  name: string,
  homes?: { user: string | null; character: string | null },
): LiveScene | null {
  let scene = current;
  for (const clause of text.match(/[^.!?\n]+[.!?]?/g) ?? [])
    scene = transitionClause(scene, clause, character, name, homes) ?? scene;
  return JSON.stringify(scene) === JSON.stringify(current) ? null : scene;
}
export function liveSceneInstructions(scene: LiveScene) {
  return `AUTHORITATIVE LIVE SCENE (takes precedence over original calendar metadata, baseline schedule, memories and old scene paragraphs): ${JSON.stringify(scene)}. The calendar venue is where this outing began, NOT where you are now. Stay at this confirmed location and activity. Do not return to a previous location without an actual recorded travel/arrival transition. Do not infer private-home entry, intimacy, a booking, a new participant or user consent. Vehicle scenes do not imply arrival. A front door means outside. Old places may be remembered, never silently resumed.`;
}
/** Reject clear present-scene relocations, not memories or ordinary outdoor surroundings. */
export function sceneContradiction(scene: LiveScene, text: string) {
  const clauses = text
    .split(/[.!?\n]+/)
    .filter(
      (s) =>
        !/\b(?:remember|earlier|before|back when|we had|we were|wish|if|could|would|will|we['’]ll|might|tomorrow|next week)\b/i.test(
          s,
        ),
    );
  return clauses.some((s) => {
    if (
      scene.locationKind !== "park" &&
      /\b(?:we (?:walk|are walking|stroll)|(?:she|he|riley|tess|maya|claire|jordan|sienna) (?:walks|strolls)|you (?:walk|stroll)|(?:the|our) (?:park )?path (?:winds|stretches))\b.{0,65}\b(?:park|trail|path|juniper commons)\b|\b(?:back at|still at|here at|around us at) (?:the )?(?:park|juniper commons)\b/i.test(
        s,
      )
    )
      return true;
    const actual = venueFromText(s);
    return actual.some(
      (p) =>
        p.key !== scene.locationKey &&
        /\b(?:we['’]re at|we are at|still at|here at|back at|sitting (?:at|in)|seated (?:at|in))\b/i.test(
          s,
        ),
    );
  });
}
