import type { TessActivity } from "./tess-life";
import { physicalPhotoContext } from "./calendar-commitment";
/** Being occupied is not a ban on a quick photo; concrete incompatible tasks are. */
export function photoActivityBlock(schedule: TessActivity): string | null {
  if (schedule.availability === "asleep") return "asleep";
  const physical = physicalPhotoContext(`${schedule.activity}. ${schedule.detail}`);
  const privateContext =
    /\bprivate\b/i.test(physical) &&
    !/\b(?:her|his|my|own) private (?:home|house|apartment)\b/i.test(physical);
  if (
    privateContext ||
    /\b(?:driv(?:e|es|ing)|surgery|emergency|phone (?:down|away)|patients?|operating room)\b/i.test(
      physical,
    )
  )
    return "current activity is incompatible with a photo";
  return null;
}
