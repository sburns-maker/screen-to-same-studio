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

/** How many delivered photos the head/arm signature check looks back over. */
export const POSE_HISTORY_WINDOW = 8;

export type HeadPose = "tilted" | "profile" | "over_shoulder" | "looking_away" | "level";
export type ArmPose = "extended_selfie" | "mirror" | "propped" | "other_person" | "hands_busy";

/** Coarse head orientation read from the planned pose text. Unstated = level/straight. */
export function headPose(style: PhotoStyle): HeadPose {
  // A chosen variant is appended after ";" and is authoritative over the model's base text.
  const pose = (style.pose_type ?? "").toLowerCase();
  const t = `${pose.includes(";") ? pose.slice(pose.lastIndexOf(";") + 1) : pose} ${style.camera_angle ?? ""}`
    .replace(/\b(?:no|not|without)(?: a| any)?(?: head)? tilt(?:ed)?/g, "");
  if (/over (?:her|his|the|their)? ?shoulder/.test(t)) return "over_shoulder";
  if (/profile|side view|side angle|three-quarter turn of the head/.test(t)) return "profile";
  if (/\btilt|cocked|tipped (?:to|sideways)/.test(t)) return "tilted";
  if (/looking (?:away|down|off|out)|glanc|gaze (?:away|down)|eyes (?:down|away)/.test(t))
    return "looking_away";
  return "level";
}

/** Coarse arm/capture silhouette — the "extended-arm selfie" shape is what repeats. */
export function armPose(style: PhotoStyle): ArmPose {
  const mode = compositionValue(style.selfie_type);
  const pose = (style.pose_type ?? "").toLowerCase();
  if (mode.includes("mirror")) return "mirror";
  if (mode.includes("propped")) return "propped";
  if (mode.includes("friend")) return "other_person";
  if (/arm.?s length|extended arm|arm (?:out|extended|outstretched)|holding (?:the )?phone (?:out|up)/.test(pose))
    return "extended_selfie";
  if (/holding (?!(?:the )?phone)|hand (?:on|in|resting)|hands? (?:busy|full)|carrying|leaning on|elbow|chin (?:in|on)/.test(pose))
    return "hands_busy";
  return mode === "selfie" || !mode ? "extended_selfie" : "hands_busy";
}

/** True when the same head orientation + arm silhouette appeared in the recent window.
 * A level head alone is not a repeat (it is the neutral default); a repeated tilt is. */
export function repeatsPoseSignature(style: PhotoStyle, recent: PhotoStyle[]): boolean {
  const head = headPose(style), arm = armPose(style);
  const window = recent.slice(0, POSE_HISTORY_WINDOW);
  if (head === "level")
    return window.slice(0, 2).some((o) => headPose(o) === "level" && armPose(o) === arm && arm === "extended_selfie");
  return window.some((o) => headPose(o) === head && armPose(o) === arm);
}

/** Concrete head/shoulder/arm directions that stay inside the chosen capture method.
 * Selfie variants keep a self-held phone; non-selfie variants never become selfies. */
const SELFIE_VARIANTS: { head: HeadPose; text: string }[] = [
  { head: "level", text: "head level and square to the lens, chin slightly down, shoulders turned a little away, phone arm out of frame" },
  { head: "looking_away", text: "glancing off to the side mid-moment, head upright, one shoulder closer to the camera, free hand busy with what she is doing" },
  { head: "level", text: "camera held low near chest height, head upright, relaxed shoulders, direct eye contact" },
  { head: "profile", text: "three-quarter turn of the head toward the window or room, upright neck, phone held close rather than at full arm's length" },
  { head: "looking_away", text: "looking down at something in her hands, head upright, phone slightly above, shoulders relaxed" },
];
const OTHER_VARIANTS: { head: HeadPose; text: string }[] = [
  { head: "level", text: "body angled three-quarters to the camera, head upright, hands occupied with the current activity" },
  { head: "looking_away", text: "caught mid-activity looking away from the camera, natural shoulder line, no posed head tilt" },
  { head: "over_shoulder", text: "turned away with a brief look back over the shoulder, upright head" },
  { head: "profile", text: "side profile while doing the current activity, head upright" },
];

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
  decision: "preserved" | "filled_missing_capture" | "avoided_recent_capture" | "varied_repeated_pose";
} {
  const explicit =
    /\b(?:same (?:pose|angle|photo)|mirror|side (?:angle|profile)|full[- ]body|close[- ]up|from above|from below|propped|self.timer|tilt)\b/i.test(
      `${scene} ${request}`,
    );
  if (explicit) return { style: { ...proposed }, decision: "preserved" };
  const complete = !!(proposed.camera_angle && proposed.crop_type && proposed.selfie_type);
  // Framing repeat ignores pose text (checked separately), so appended pose variants can't mask it.
  const noPose = (x: PhotoStyle) => ({ ...x, pose_type: null });
  const frameRepeat = !complete || repeatsCapture(noPose(proposed), recent.slice(0, 3).map(noPose));
  const poseRepeat = repeatsPoseSignature(proposed, recent);
  if (!frameRepeat && !poseRepeat) return { style: { ...proposed }, decision: "preserved" };

  let style: PhotoStyle = { ...proposed };
  if (frameRepeat) {
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
    const best = frames
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
      .sort((a, b) => a.score - b.score || a.index - b.index)[0]!.frame;
    style = { ...style, ...best, selfie_type: mode };
  }
  if (poseRepeat || repeatsPoseSignature(style, recent)) {
    const selfie = armPose(style) === "extended_selfie" || compositionValue(style.selfie_type) === "selfie";
    const variants = selfie ? SELFIE_VARIANTS : OTHER_VARIANTS;
    const window = recent.slice(0, POSE_HISTORY_WINDOW);
    const used = (h: HeadPose) => window.reduce((n, o, i) => n + (headPose(o) === h ? POSE_HISTORY_WINDOW - i : 0), 0);
    const pick = variants
      .map((v, index) => ({ v, index, score: used(v.head) + (window.some((o) => (o.pose_type ?? "").includes(v.text)) ? 100 : 0) }))
      .sort((a, b) => a.score - b.score || a.index - b.index)[0]!.v;
    const base = (style.pose_type ?? "").replace(/,?\s*(?:with )?(?:a |her |his )?(?:head )?(?:slight |gentle )?(?:head )?tilt(?:ed|ing)?(?: to the (?:side|left|right))?(?: head)?/gi, "").trim();
    const body = selfie ? base.replace(/,?\s*(?:with )?(?:her |his |one )?arm (?:extended|outstretched|out)(?: holding (?:the )?phone)?|,?\s*at arm.s length/gi, "").trim() : base;
    style = { ...style, pose_type: body ? `${body}; ${pick.text}` : pick.text };
    return { style, decision: frameRepeat && complete ? "avoided_recent_capture" : "varied_repeated_pose" };
  }
  return { style, decision: complete ? "avoided_recent_capture" : "filled_missing_capture" };
}
