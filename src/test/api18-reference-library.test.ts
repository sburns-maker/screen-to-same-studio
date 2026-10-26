import { describe, expect, it } from "vitest";
import { pickReferenceCandidates, referenceLibrarySummary } from "@/lib/api18-reference-library";
const owner = "11111111-1111-4111-8111-111111111111";
const canonical = {asset:"src/assets/tess.jpg",sha256:"a".repeat(64)};
const message=(path:string, crop:string, overrides:Record<string,unknown>={})=>({
  created_at:"2026-10-25T21:00:00Z",visible_at:"2026-10-25T21:00:00Z",
  metadata:{
    generated_path:path,photo_type:"casual_selfie",
    photo_identity:{canonicalSha256:canonical.sha256,validationStatus:"screen_passed"},
    photo_visual:{character:"tess",style:{crop_type:crop}},
    ...overrides,
  },
});
describe("Api18 three-reference candidate selection",()=>{
  it("always leads with the approved canonical portrait and only selects matching delivered photos",()=>{
    const rows=[
      message(`${owner}/a.png`,"waist_up"),
      message(`${owner}/b.png`,"close"),
      message("someone-else/unsafe.png","close"),
      message(`${owner}/different.png`,"close",{photo_visual:{character:"maya"}}),
      message(`${owner}/unapproved.png`,"close",{photo_identity:{canonicalSha256:canonical.sha256,validationStatus:"failed"}}),
    ];
    const refs=pickReferenceCandidates("tess",canonical,rows,owner);
    expect(refs.map(x=>x.role)).toEqual(["canonical","half_body","alternate_angle"]);
    expect(refs[0]?.status).toBe("approved");
    expect(refs[1]?.status).toBe("needs_visual_review");
    expect(refs.some(r=>r.asset.includes("unsafe"))).toBe(false);
    expect(referenceLibrarySummary(refs)).toEqual({total:3,approved:1,pendingReview:2,ready:false});
  });
  it("does not mark missing or unreviewed references ready",()=>{
    const refs=pickReferenceCandidates("tess",canonical,[],owner);
    expect(refs).toHaveLength(1);
    expect(referenceLibrarySummary(refs).ready).toBe(false);
  });
});
