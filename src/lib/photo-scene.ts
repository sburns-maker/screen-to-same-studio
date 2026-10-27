import type { TessActivity } from "./tess-life";
import { physicalPhotoContext } from "./calendar-commitment";
import {
  photoLocation,
  photoSceneCompatible,
  type PhotographyPlan,
  type PhotoLocation,
} from "./photo-personality";
export type ConversationScene = {
  location: PhotoLocation;
  activity: string;
  sourceId: string;
  observedAt: string;
  expiresAt: string;
};
/** Ephemeral physical observations, not permanent biography. Only the character's own delivered statements qualify. */
export function statedScene(body: string): { location: PhotoLocation; activity: string } | null {
  for (const clause of body.split(/[.!?;\n]+/).reverse()) {
    const s = clause.trim();
    const home =
      /^(?:(?:okay|well|finally)[, ]*)?(?:i['’]m|i am|i(?:['’]ve| have) (?:just )?(?:got|arrived)|i (?:just )?(?:got|arrived)) (?:finally |now |back |at )?home\b/i.test(
        s,
      );
    if (home)
      return {
        location: "home",
        activity: /relax|unwind|couch|sofa/i.test(s) ? "relaxing at home" : "at home",
      };
    if (
      !/^(?:i['’]m|i am|i['’]ve|i have|groceries (?:are |all )?(?:away|put away))\b/i.test(s) ||
      /\b(?:not|if|wish|once|when|will|might|heading|going to|thinking|dreaming|remember|imagine)\b/i.test(
        s,
      )
    )
      continue;
    const location = photoLocation(s);
    if (location)
      return {
        location,
        activity:
          location === "home" && /relax|unwind|couch|sofa/i.test(s)
            ? "relaxing at home"
            : location === "vehicle" && /driving|drive/i.test(s)
              ? "driving"
              : `at ${location.replaceAll("_", " ")}`,
      };
  }
  return null;
}
export function photoSceneCheck(plan: PhotographyPlan, requested: string, source: string) {
  const inferred = photoLocation(requested),
    allowed = photoSceneCompatible(plan, requested);
  return {
    allowed,
    canonicalLocation: plan.location,
    canonicalSource: source,
    inferredRequestedScene: inferred,
    failedRule: allowed ? null : "photo.location_matches_current_scene",
    assessment: inferred ? "location_checked" : "location_unspecified_in_request",
  };
}
export function conversationSchedule(
  base: TessActivity,
  scene: ConversationScene | null,
): TessActivity {
  if (!scene) return base;
  return {
    ...base,
    activity: scene.activity,
    detail: `Current confirmed physical scene: at ${scene.location.replaceAll("_", " ")}; ${scene.activity}. Established by this character's delivered message. ${base.availability === "asleep" ? "Sleep schedule still applies." : base.availability === "busy" ? "Current availability remains busy." : ""}`,
  };
}
export function sceneVersion(scene: ConversationScene | null, schedule: TessActivity) {
  return scene
    ? `conversation:${scene.location}:${scene.activity}`
    : `activity:${photoLocation(physicalPhotoContext(schedule.detail)) ?? "unknown"}:${schedule.activity.slice(0, 100)}`;
}

/** Repair an AI-suggested photo setting to the confirmed physical context, not vice versa.
 * Deliberately drops incompatible scenery; never invents travel or private access. */
export function correctedPhotoScene(plan: PhotographyPlan, proposed: string): string {
  if (photoSceneCompatible(plan, proposed) || !plan.location) return proposed;
  const locations: Record<NonNullable<PhotoLocation>, string> = {
    home: "A casual photo at the character's current home, in an ordinary shared living space",
    work: "A casual photo during the character's current work shift, in a permitted staff break area or public-facing non-sensitive space, without customers, patients, records or screens",
    clinic: "A casual photo in a permitted non-clinical veterinary clinic staff area, without patients, records or private screens",
    venue: "A casual photo in a permitted public-facing event-venue area, without private visitor information",
    library: "A casual photo in a public library visitor area, with no identifiable patrons or records",
    grocery: "A casual photo while shopping in a grocery store, without identifiable shoppers",
    vehicle: "A safely parked vehicle photo, with no driving or road movement",
    social: "A casual photo at the current public social venue, without identifiable bystanders",
    coffee_shop: "A casual photo at the current coffee shop, without identifiable bystanders",
    garden: "A casual photo in the garden",
    outdoors: "A casual photo outdoors at the current walking location",
  };
  return locations[plan.location] + ". Preserve the character's established appearance and appropriate clothing; no invented change of location.";
}
