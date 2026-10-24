import {describe,it,expect} from "vitest";
import {icelandTripIdea} from "@/lib/travel-experiences";
import {deliverTravelPhoto} from "@/lib/travel-photos.server";
describe("trip photo consent and spontaneity",()=>{
 it("never fabricates a picture when a companion decides not to send one",async()=>{
  const t=icelandTripIdea();
  const result=await deliverTravelPhoto(null,"user",t,"stop","turn","tess",{send:false,scene:"",caption:"",kind:"selfie"});
  expect(result).toBeNull();
 });
 it("cannot generate a character portrait without an accepted travel companion",async()=>{
  const t=icelandTripIdea();
  const result=await deliverTravelPhoto(null,"user",t,"stop","turn","tess",{send:true,scene:"Snowy waterfront",caption:"Look at this!",kind:"selfie"});
  expect(result).toBeNull();
 });
});
