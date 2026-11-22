import {describe,expect,it} from "vitest";
import {appendBackstageTurn,openBackstageScene,deriveLiveSceneContinuity,contradictsSceneLocation} from "./world-order-backstage";
describe("World Order live scene continuity",()=>{
 it("begins in the original dressing room",()=>{
  expect(deriveLiveSceneContinuity(openBackstageScene().turns).location).toBe("backstage");
 });
 it("follows the complete Havana escape and keeps consequences in order",()=>{
  let s=openBackstageScene();
  const history=[
   "We get into the car. As we drive from the concert I see smoke over Havana, Cuba.",
   "The driver was shot and wounded. I take over the wheel and drive through Havana.",
   "At the military checkpoint two military units begin firing on each other.",
   "Military medics took our wounded driver away in an ambulance.",
   "We lose sight of Sabrina's security team and the last guard disappears.",
   "Behind a concrete wall I grab a rifle from a fallen soldier.",
   "I raise the rifle. STOP! We're civilians! Armed soldiers appear through the smoke.",
  ];
  for(const action of history){
   s=appendBackstageTurn(s,"player",action);
   s=appendBackstageTurn(s,"Sabrina","I'm still here with you.");
  }
  const state=deriveLiveSceneContinuity(s.turns);
  expect(state.location).toBe("Havana streets / military checkpoint");
  expect(state.establishedFacts.join(" ")).toContain("driver was shot");
  expect(state.establishedFacts.join(" ")).toContain("medics evacuated");
  expect(state.establishedFacts.join(" ")).toContain("last guard's fate is unknown");
  expect(state.establishedFacts.join(" ")).toContain("fighting each other");
 });
 it("does not mistake an airport destination for a completed arrival",()=>{
  const scene=appendBackstageTurn(openBackstageScene(),"player","I head toward the military airport on the streets of Havana. Soldiers at a checkpoint stop us.");
  expect(deriveLiveSceneContinuity(scene.turns).location).toBe("Havana streets / military checkpoint");
 });
 it("detects an explicit arrival at the airfield",()=>{
  const scene=appendBackstageTurn(openBackstageScene(),"player","We reach the military airfield and enter the hangar.");
  expect(deriveLiveSceneContinuity(scene.turns).location).toBe("military airfield");
 });
 it("flags dressing-room reset responses after an established checkpoint battle",()=>{
  const location="Havana streets / military checkpoint";
  expect(contradictsSceneLocation("Sean, look at me. We're backstage. The security guard waits outside the dressing room.",location)).toBe(true);
  expect(contradictsSceneLocation("The officer signals for you to stop while Sabrina ducks behind the wall.",location)).toBe(false);
 });
});