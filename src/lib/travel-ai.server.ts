import { z } from "zod";
import { CHARACTERS,type CharacterKey } from "./characters";
import { runStructured } from "./text-ai.server";
import { tripScenePrompt,type TripPlan } from "./travel-experiences";
const inviteSchema=z.object({decision:z.enum(["accept","decline","discuss"]),reply:z.string().max(360)});
const sceneSchema=z.object({narration:z.string().max(1200),dialogue:z.string().max(700),newDetail:z.string().max(240).nullable(),photo:z.object({send:z.boolean(),scene:z.string().max(360),caption:z.string().max(180),kind:z.enum(["selfie","scenery","moment"])}).nullable()});
export async function characterTripDecision(character:string,trip:TripPlan,relationship:Record<string,unknown>={},followUp?:string){
 const def=CHARACTERS[character as CharacterKey];
 if(!def)throw new Error("Unknown character");
 if(trip.status==="completed"||trip.status==="cancelled")throw new Error("Trip closed");
 return runStructured(inviteSchema,`You portray ${def.fullName}. Canon: ${def.bible}. ${def.textingStyle}. The user is suggesting a fictional ${trip.purpose} trip. Respond as an independent person, not a compliant assistant. ${followUp?"This is a follow-up to a previously tentative invitation, not a new invitation. The user provided additional details. Decide whether to accept, decline, or continue discussing; do not assume yes.": "The invitation is not already accepted."} A long international trip early in a relationship is a major commitment. Consider realistic logistics, boundaries, dates, your own life, and relationship strength. Decline or discuss if uncertain. No real bookings or payments. Format a concise reply and decision.`,JSON.stringify({trip,relationship,followUp}),"reply");
}
export async function generateTravelScene(trip:TripPlan,day:number,stopId:string,playerAction:string,moments:string[],character?:string){
 const chosen=character?CHARACTERS[character as CharacterKey]:undefined;
 if(character && (!chosen||!trip.companions.some(c=>c.characterKey===character&&c.response==="accepted")))throw new Error("Companion has not accepted this trip");
 const stop=trip.itinerary.find(s=>s.id===stopId && s.day===day && !s.completed);
 if(!stop||trip.status!=="in_progress")throw new Error("Choose an active unfinished travel stop");
 return runStructured(sceneSchema,`Fictional interactive travel scene. The player controls only their own actions, never invent choices, intimacy, agreement or dialogue for the player. ${tripScenePrompt(trip,day)}. The current scene is ${stop.label} at ${stop.location}. Keep narration brief and distinct, introduce a realistic sensory detail or small unexpected event, and continue rather than finish the stop. ${chosen?`The companion is ${chosen.fullName}. Canon: ${chosen.bible}. Their dialogue, preferences, boundaries and choices should be consistent with their personality. They can disagree or opt out.`:"The player is traveling solo; do not invent a companion."} A traveler may independently decide to photograph a striking, funny, touching, surprising or ordinary moment and send it. Photos are NOT required each turn: choose send=false if nothing naturally inspires one. For a companion photo choose a safe casual selfie or scene; for solo travel choose scenery only. Return a short grounded visual description and human caption when chosen. This is an in-game scene, not evidence of real travel.`,
 JSON.stringify({playerAction,moments:moments.slice(-8)}),"reply");
}

const travelPostSchema=z.object({send:z.boolean(),caption:z.string().max(200),scene:z.string().max(350),kind:z.enum(["selfie","scenery","moment"])});
export async function travelCharacterMoment(trip:TripPlan,character:string,stopId:string){
 const def=CHARACTERS[character as CharacterKey];
 const stop=trip.itinerary.find(s=>s.id===stopId);
 if(!def||!stop||!trip.companions.some(c=>c.characterKey===character&&c.response==="accepted"))throw new Error("Character is not accompanying this trip");
 return runStructured(travelPostSchema,`You are ${def.fullName} while traveling with a friend. Character canon: ${def.bible}. Decide independently whether something in this specific stop would make you take and send a spontaneous photo. It's normal to take none. Favor candid, varied real-world moments (funny sign, unexpected meal, messy hair, scenery, weather, street detail, selfie) rather than constant posed shots. If not inspired, return send=false. If inspired, caption must sound like a casual human text, no meta commentary. This is a fictional story. Safe fully clothed imagery, no real clients or other identifiable strangers.`,
 JSON.stringify({destination:trip.destination,purpose:trip.purpose,stop:stop.label,place:stop.location}),"autonomous");
}
