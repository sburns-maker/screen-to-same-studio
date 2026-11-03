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
  "reviewing_roommate_plan",
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
    // Leaving a restaurant need not involve a second named destination. Keep the
    // grounded venue for orientation but move the physical scene OUTSIDE; the
    // next character turn must not send them back to the table or server.
    const walkedOut = /\b(?:i|we|she|he)\s+(?:walk|walked|step|stepped|head|headed|go|went|exit|exited|leave|left)\b.{0,65}\b(?:out(?:side)?(?:\s+of)?|through (?:the )?door)\b/i.test(s) ||
      /\b(?:i|we|she|he)\s+(?:exit|exited|leave|left)\b.{0,35}\b(?:restaurant|cafe|café|diner|bar)\b/i.test(s);
    if (walkedOut && !/\b(?:walk|step|go)\s+(?:back\s+)?(?:in(?:side|to)?|into)\b/i.test(s)) {
      next.area = "outside";
      next.activity = "walking";
    } else if (next.area !== "outside") {
      if (
        /\b(?:finished|finish|done with)\b.{0,35}\b(?:dinner|meal|food|eating)\b|\b(?:paid|pay) (?:the |our )?bill\b/i.test(s)
      )
        next.activity = "finished_meal";
      else if (/\b(?:order|ordered)\b/i.test(s)) next.activity = "ordering";
      else if (/\b(?:eat|eating|dining|food arrives)\b/i.test(s)) next.activity = "dining";
    }
  }
  if (next.locationKind === "home") {
    const entered = homeEntry(s);
    const exited = isIndoorArea(next.area) && homeExit(s);
    if (entered && !exited) next.area = roomFrom(s) ?? (isIndoorArea(next.area) && next.area ? next.area : "inside");
    else if (exited) next.area = "front door (outside)";
    else if (isIndoorArea(next.area)) {
      // Already indoors: moving between rooms never sends anyone back outside.
      const room = roomFrom(s);
      if (room && /\b(?:i|we|she|he)\b/i.test(s)) next.area = room;
    } else if (/\b(?:front door|doorstep|porch)\b/i.test(s)) next.area = "front door (outside)";
    if (isIndoorArea(next.area)) {
      if (/\b(?:cook|cooking|chop|chopping|prepare|preparing)\b/i.test(s))
        next.activity = "cooking";
      else if (/\b(?:watch|watching|put(?:s|ting)? on|start(?:s|ed)?|play(?:s|ed)?)\b.{0,35}\b(?:movie|film)\b|\b(?:movie|film|opening credits)\b.{0,25}\b(?:starts|started|begins|began|rolls?|roll(?:ed|ing))\b/i.test(s))
        next.activity = "watching_movie";
      else if (/\b(?:play|playing)\b.{0,25}\b(?:game|cards)\b/i.test(s))
        next.activity = "playing_game";
      else if (/\b(?:review|reviewing|go over|going over|compare|comparing|sit down|sitting down)\b.{0,85}\b(?:roommate|rent|utilities|living arrangement|shared expenses|household budget)\b|\b(?:roommate agreement|roommate plan|budget spreadsheet)\b/i.test(s)) next.activity = "reviewing_roommate_plan";
      else if (/\b(?:clean|cleaning|tidy|chores)\b/i.test(s)) next.activity = "household_chore";
      else if (next.activity !== "watching_movie" && /\b(?:relax|relaxing|settle|settled|sit|sat|sitting)\b/i.test(s)) next.activity = "relaxing";
      else if (next.activity === "arriving" || next.activity === "at_front_door") next.activity = "relaxing";
    } else if (next.area === "front door (outside)") next.activity = "at_front_door";
  }
  return JSON.stringify(next) === JSON.stringify(current) ? null : next;
}
export function isIndoorArea(area: string | null | undefined) {
  return !/outside|front door|porch|doorstep|driveway/i.test(area ?? "");
}
function roomFrom(s: string) {
  if (/\b(?:couch|sofa)\b/i.test(s) && /\b(?:i|we|she|he)\b/i.test(s) && /\b(?:sit|sat|sitting|settle|settled|follow|followed|curl|curled|get comfortable|got comfortable|lean|leaned|onto|on the)\b/i.test(s)) return "living room (couch)";
  if (/\b(?:living room|lounge room|den)\b/i.test(s)) return "living room";
  if (/\bkitchen\b/i.test(s) && /\b(?:in|into|to)\s+(?:the|her|his|my)\s+kitchen\b/i.test(s)) return "kitchen";
  return null;
}
/** Completed entry into the home. Arriving at, or standing by, the door is not entry. */
function homeEntry(s: string) {
  return /\b(?:we|i)\s+(?:(?:enter|entered|step|stepped|go|went|walk|walked|come|came|head|headed|make it|made it)\s+(?:(?:back\s+)?in(?:side)?\b|into\b|through\s+(?:the\s+)?(?:front\s+)?door\b(?:.{0,30}\b(?:in|inside|into)\b)?)|(?:follow|followed)\s+(?:(?:you|her|him|them|[a-z]+)\s+)?(?:in\b|inside\b|into\b|to\s+the\s+(?:couch|sofa|living room|kitchen))|(?:sit|sat)\s+down\s+in\s+the\s+living room)/i.test(s) ||
    /\b(?:pull|pulled|lead|led|leads)\s+(?:you|her|him|me)\s+(?:in|inside|into)\b/i.test(s) ||
    /\bwe\s+(?:settle|settled|sit|sat|get comfortable|got comfortable)\b.{0,30}\b(?:couch|sofa|living room)\b/i.test(s);
}
function homeExit(s: string) {
  return /\b(?:we|i)\s+(?:walk|walked|step|stepped|go|went|head|headed)\s+(?:back\s+)?out(?:side)?\b|\b(?:i|we)\s+(?:leave|left)\s+(?:her|his|the|your)\s+(?:house|home|apartment|place)\b/i.test(s);
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
/**
 * Deterministically replays explicit completed player actions from the outing's
 * starting venue. Character narration never counts as evidence.
 */
export function replayScene(
  initial: LiveScene,
  moments: { id: string; source: string; body: string }[],
  character: string,
  name: string,
  homes?: { user: string | null; character: string | null },
) {
  let scene = initial,
    evidence: string | null = null;
  for (const m of moments) {
    if (m.source !== "user") continue;
    const next = transitionScene(scene, m.body, character, name, homes);
    if (next) {
      scene = next;
      evidence = m.id;
    }
  }
  return { scene, evidence };
}
/** True when stored state is stale versus replayed evidence (location, area or activity). */
export function sceneNeedsReconcile(stored: LiveScene, replayed: LiveScene) {
  return (
    stored.locationKey !== replayed.locationKey ||
    stored.area !== replayed.area ||
    stored.activity !== replayed.activity
  );
}
export function liveSceneInstructions(scene: LiveScene) {
  return `AUTHORITATIVE LIVE SCENE (takes precedence over original calendar metadata, baseline schedule, memories and old scene paragraphs): ${JSON.stringify(scene)}. The calendar venue is where this outing began, NOT where you are now. Stay at this confirmed location and activity. If area is outside at a restaurant or cafe, you have ALREADY left the dining room: no server, seated table, dessert or interior mini-game remains unless you actually re-enter. Do not return to a previous location without an actual recorded travel/arrival transition. Do not infer private-home entry, intimacy, a booking, a new participant or user consent. Vehicle scenes do not imply arrival. A front door means outside, but an explicitly recorded entry means INSIDE: do not narrate the doorstep, driveway or arrival again unless someone actually leaves. Old places may be remembered, never silently resumed.`;
}
/** Reject clear present-scene relocations, not memories or ordinary outdoor surroundings. */
export function sceneContradiction(scene: LiveScene, text: string) {
  // Once indoors, inviting the player inside again is a regression even when the
  // clause also contains a conditional ("...and see if you can follow the plot").
  if (scene.locationKind === "home" && isIndoorArea(scene.area) &&
    text.split(/[.!?\n]+/).some((s) => !/\b(?:walk|step|go|head|return)(?:ed|s)?\s+(?:back\s+)?out(?:side)?\b/i.test(s) &&
      /\b(?:let['’]s|let us)\s+(?:get|go|head)\s+inside\b|\b(?:come on in|ready to go in)\b/i.test(s)))
    return true;
  const clauses = text
    .split(/[.!?\n]+/)
    .filter(
      (s) =>
        !/\b(?:remember|earlier|before|back when|we had|we were|wish|if|could|would|will|we['’]ll|might|tomorrow|next week)\b/i.test(
          s,
        ),
    );
  return clauses.some((s) => {
    // An explicitly completed home entry is not still at the exterior threshold.
    // Reject the old doorway narration rather than repeatedly regressing the date.
    const indoors = scene.locationKind === "home" && isIndoorArea(scene.area);
    const leaving = /\b(?:walk|step|go|head|return)(?:ed|s)?\s+(?:back\s+)?(?:out(?:side)?|to\s+(?:the\s+)?(?:front\s+door|porch|doorstep))\b/i.test(s);
    if (indoors && !leaving && /\b(?:let['’]s|let us)\s+(?:get|go|head)\s+inside\b|\b(?:come on in|ready to go in|before we (?:even )?get inside)\b/i.test(s))
      return true;
    if (indoors && !leaving &&
      /\b(?:front\s+door|front\s+step|doorstep|porch)\b/i.test(s) &&
      /\b(?:i|we|she|he)\s+(?:pause|paused|stand|stood|wait|waited|grin|grinned|smile|smiled|look|looked|lean|leaned|lead|led|reach|reached)\b|\b(?:at|by|on|outside)\s+(?:the\s+)?(?:front\s+(?:door|step)|doorstep|porch)\b/i.test(s))
      return true;
    // An already-performed restaurant exit cannot be contradicted by suddenly
    // ordering more dessert or returning to the dining room without re-entry.
    if ((scene.locationKind === "restaurant" || scene.locationKind === "cafe") && scene.area === "outside" &&
      !/\b(?:walk|step|go|head|return)(?:ed|s)?\s+(?:back\s+)?(?:in(?:side|to)?|into)\b/i.test(s) &&
      /\b(?:server|waiter|waitress)\b.{0,65}\b(?:sets|brings|serves|asks|takes|arrives)\b|\b(?:glance|look)\s+around\s+(?:the\s+)?(?:room|dining room|valley table)\b|\b(?:seated|sitting)\s+at\s+(?:our|the)\s+table\b/i.test(s))
      return true;
    if (
      scene.locationKind !== "park" &&
      /\b(?:we (?:walk|are walking|stroll)|(?:she|he|riley|tess|maya|claire|jordan|sienna|kendra) (?:walks|strolls)|you (?:walk|stroll)|(?:the|our) (?:park )?path (?:winds|stretches))\b.{0,65}\b(?:park|trail|path|juniper commons)\b|\b(?:back at|still at|here at|around us at) (?:the )?(?:park|juniper commons)\b/i.test(
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
