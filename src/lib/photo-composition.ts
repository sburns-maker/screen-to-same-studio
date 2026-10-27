import type { PhotoStyle } from "./tess-photos";

/** Compare capture decisions, not clothing: a uniform is not a repeated photograph. */
export function compositionValue(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/arm.s length|front camera/g, "selfie")
    .replace(/gentle|soft|small|subtle/g, "")
    .replace(/grin/g, "smile")
    .replace(/eye[- ]level/g, "eye level")
    .replace(/seated/g, "sitting")
    .replace(/chest[- ]up/g, "chest up")
    .replace(/waist[- ]up/g, "waist up")
    .replace(/\s+/g, " ")
    .trim();
}

export function repeatsCapture(style: PhotoStyle, recent: PhotoStyle[]): boolean {
  const keys = ["pose_type", "camera_angle", "crop_type", "selfie_type"] as const;
  return recent.some((old) => {
    const comparable = keys.filter((k) => style[k] && old[k]);
    return (
      comparable.length >= 3 &&
      comparable.every((k) => compositionValue(style[k]) === compositionValue(old[k]))
    );
  });
}

/** Missing/repeated capture metadata gets a plausible framing, never a new outfit,
 * location, emotion, activity or imaginary photographer. No random draws or paid retries.
 */
export function selectPhotoComposition(
  proposed: PhotoStyle,
  recent: PhotoStyle[],
  scene: string,
  request = "",
): {
  style: PhotoStyle;
  decision: "preserved" | "filled_missing_capture" | "avoided_recent_capture";
} {
  const explicit =
    /\b(?:same (?:pose|angle|photo)|mirror|side (?:angle|profile)|full[- ]body|close[- ]up|from above|from below|propped|self.timer)\b/i.test(
      `${scene} ${request}`,
    );
  const complete = !!(proposed.camera_angle && proposed.crop_type && proposed.selfie_type);
  if (explicit || (complete && !repeatsCapture(proposed, recent.slice(0, 3))))
    return { style: { ...proposed }, decision: "preserved" };
  // A named capture method selected by the character stays intact. Missing mode
  // defaults to a self-held phone, but framing is selected against delivered history.
  const mode = proposed.selfie_type ?? "selfie";
  const frames = [
    { camera_angle: "eye_level", crop_type: "off_center" },
    { camera_angle: "slightly_above", crop_type: "chest_up" },
    { camera_angle: "eye_level", crop_type: "waist_up" },
    { camera_angle: "slightly_below", crop_type: "chest_up" },
    { camera_angle: "slightly_above", crop_type: "off_center" },
    { camera_angle: "eye_level", crop_type: "close" },
  ];
  const ranked = frames
    .map((frame, index) => ({
      frame,
      index,
      score: recent.reduce(
        (n, old, i) =>
          n +
          (compositionValue(old.camera_angle) === compositionValue(frame.camera_angle) &&
          compositionValue(old.crop_type) === compositionValue(frame.crop_type)
            ? 20 - i
            : 0),
        0,
      ),
    }))
    .sort((a, b) => a.score - b.score || a.index - b.index);
  const best = ranked[0]!.frame;
  return {
    style: { ...proposed, ...best, selfie_type: mode },
    decision: complete ? "avoided_recent_capture" : "filled_missing_capture",
  };
}
