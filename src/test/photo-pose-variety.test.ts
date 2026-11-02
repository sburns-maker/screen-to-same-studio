import { describe, it, expect } from "vitest";
import { selectPhotoComposition, headPose, armPose, repeatsPoseSignature } from "@/lib/photo-composition";
import { referencePoseGuidance } from "@/lib/photo-reference-prompt";
import type { PhotoStyle } from "@/lib/tess-photos";

const tiltSelfie: PhotoStyle = {
  pose_type: "sitting on the couch, head tilted to the side, arm extended holding the phone",
  camera_angle: "slightly_above",
  crop_type: "chest_up",
  selfie_type: "selfie",
  expression: "playful smile",
  clothing_category: "grey lounge set",
  setting: "apartment living room",
};

describe("pose variety", () => {
  it("detects head tilt and extended arm", () => {
    expect(headPose(tiltSelfie)).toBe("tilted");
    expect(armPose(tiltSelfie)).toBe("extended_selfie");
  });

  it("varies a second head-tilt selfie even when framing differs", () => {
    const next = { ...tiltSelfie, camera_angle: "eye_level", crop_type: "waist_up" };
    const r = selectPhotoComposition(next, [tiltSelfie], "Kendra on her couch");
    expect(r.decision).toBe("varied_repeated_pose");
    expect(headPose(r.style)).not.toBe("tilted");
    expect(r.style.selfie_type).toBe("selfie");
  });

  it("diversifies repeated selfies over time across 6 photos", () => {
    const history: PhotoStyle[] = [];
    for (let i = 0; i < 6; i++) {
      const r = selectPhotoComposition({ ...tiltSelfie }, history, "at home");
      history.unshift(r.style);
    }
    const tilts = history.filter((s) => headPose(s) === "tilted").length;
    expect(tilts).toBeLessThanOrEqual(1);
    expect(new Set(history.map((s) => s.pose_type)).size).toBeGreaterThanOrEqual(4);
  });

  it("keeps outfit, setting, expression and hairstyle continuity", () => {
    const r = selectPhotoComposition({ ...tiltSelfie, hairstyle: "messy bun" }, [tiltSelfie], "at home");
    expect(r.style.clothing_category).toBe("grey lounge set");
    expect(r.style.setting).toBe("apartment living room");
    expect(r.style.expression).toBe("playful smile");
    expect(r.style.hairstyle).toBe("messy bun");
  });

  it("never turns a candid/friend photo into a selfie", () => {
    const candid: PhotoStyle = { pose_type: "sitting among boxes, head tilted", camera_angle: "eye_level", crop_type: "full_body", selfie_type: "friend_photo" };
    const r = selectPhotoComposition(candid, [candid], "decluttering with Nina");
    expect(r.style.selfie_type).toBe("friend_photo");
    expect(r.style.pose_type).not.toMatch(/phone arm|phone held/);
  });

  it("honors an explicit request for the same pose", () => {
    const r = selectPhotoComposition(tiltSelfie, [tiltSelfie], "same pose as before");
    expect(r.decision).toBe("preserved");
    expect(r.style.pose_type).toBe(tiltSelfie.pose_type);
  });

  it("does not flag a distinct pose as repeated", () => {
    const other: PhotoStyle = { pose_type: "standing, looking away out the window, holding a mug", selfie_type: "propped_phone" };
    expect(repeatsPoseSignature(other, [tiltSelfie])).toBe(false);
  });

  it("reference guidance keeps identity from the reference only", () => {
    expect(referencePoseGuidance({})).toMatch(/stable identity/);
    expect(referencePoseGuidance({})).toMatch(/not a pose template/);
  });
});
