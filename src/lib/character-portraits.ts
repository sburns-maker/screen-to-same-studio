import tess from "@/assets/tess.jpg";
import maya from "@/assets/avatars/maya.jpg";
import claire from "@/assets/avatars/claire.jpg";
import jordan from "@/assets/avatars/jordan.jpg";
import ben from "@/assets/avatars/ben.jpg";
import riley from "@/assets/avatars/riley-canon.png";
import sienna from "@/assets/avatars/sienna.png.asset.json";
import kendra from "@/assets/avatars/kendra.jpg.asset.json";
/** Existing UI assets are authoritative. Never replace these with generated outputs. */
export const PROFILE_PORTRAITS = {
  tess: { avatar: tess, asset: "src/assets/tess.jpg" },
  maya: { avatar: maya, asset: "src/assets/avatars/maya.jpg" },
  claire: { avatar: claire, asset: "src/assets/avatars/claire.jpg" },
  jordan: { avatar: jordan, asset: "src/assets/avatars/jordan.jpg" },
  ben: { avatar: ben, asset: "src/assets/avatars/ben.jpg" },
  riley: { avatar: riley, asset: "src/assets/avatars/riley-canon.png" },
  sienna: { avatar: sienna.url, asset: "src/assets/avatars/sienna-canon.png" },
  kendra: { avatar: kendra.url, asset: "src/assets/avatars/kendra-canon.jpg" },
} as const;
