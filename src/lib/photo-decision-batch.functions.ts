import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { characterFor, characterAvailability } from "./characters";
import { STATE_KEYS, type TessState } from "./tess-logic";
import { eligiblePhotoCategories, type PhotoBoundary } from "./photo-policy";
import { summarizePhotoDecisionBatch, type PhotoChoiceOutcome } from "./spontaneous-photo-flow";
import { runStructured } from "./text-ai.server";

/** A diagnostic decision is not a photo action. Separate initiating, medium and category. */
export const photoIntentDecisionSchema = z.object({
  initiate: z.boolean(),
  medium: z.enum(["none","text","photo","photo_with_caption"]),
  reason: z.enum(["no_natural_impulse","busy_or_tired","privacy","outfit_or_scene_mismatch","relationship_boundary","personal_preference","ordinary_moment","playful_connection","sharing_a_memory","other"]),
  explanation: z.string().max(180),
  category: z.enum(["object","tess_candid","casual_selfie","personal_selfie","intimate_selfie","mature_romantic","suggestive"]).nullable(),
  captionIdea: z.string().max(160).nullable(),
});
export function interpretPhotoIntent(decision: z.infer<typeof photoIntentDecisionSchema>, allowed: readonly string[]) {
  if (!decision.initiate) return {action:"silence" as const, validation:null};
  if (decision.medium === "none") return {action:"unexplained_silence" as const, validation:"initiation_yes_medium_none"};
  if (decision.medium === "text") return {action:"text_only" as const, validation:null};
  if (!decision.category || !allowed.includes(decision.category))
    return {action:"invalid_photo_action" as const, validation:"category_not_eligible"};
  return {action:"photo" as const,validation:null};
}
const requestSchema = z.object({
  conversationId: z.string().uuid(),
  repetitions: z.number().int().min(1).max(4).default(2),
});
type Category = "ordinary_object" | "personal_selfie" | "romantic_portrait";
const categories: { id: Category; types: readonly string[]; description: string }[] = [
  { id: "ordinary_object", types: ["object"], description: "An everyday object, meal, pet or view genuinely present in your actual current surroundings" },
  { id: "personal_selfie", types: ["casual_selfie", "personal_selfie", "intimate_selfie"], description: "An ordinary selfie using your actual current outfit and location, without inventing a change of clothes" },
  { id: "romantic_portrait", types: ["mature_romantic", "suggestive"], description: "A tasteful non-explicit romantic portrait only if your established outfit, private location, adult relationship and comfort make it appropriate" },
];

/**
 * Explicit developer-only experiment. Calls the text LLM but NEVER image generation,
 * writes no messages, schedules no notification and changes no relationship state.
 * Up to 12 paid text evaluations per user action. Respect real category eligibility.
 */
export const evaluatePhotoDecisionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => requestSchema.parse(value))
  .handler(async ({ context, data }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer photo diagnostics disabled");
    const db = context.supabase;
    const { data: conv, error: convErr } = await db.from("conversations")
      .select("id,difficulty,photo_boundary,mature_photography,character:characters(key)")
      .eq("user_id", context.userId).eq("id", data.conversationId).single();
    if (convErr || !conv) throw new Error("Owned conversation required");
    const characterKey = conv.character?.key;
    if (!characterKey) throw new Error("Character unavailable");
    const def = characterFor(characterKey);
    if (!def.photosEnabled || def.age < 18) throw new Error("Photo diagnostics require an enabled adult contact");

    const [{ data: stateRow, error: stateErr }, { data: dialogue, error: msgErr }, { data: memories, error: memoryErr }] = await Promise.all([
      db.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
      db.from("messages").select("sender,body,created_at").eq("user_id",context.userId)
        .eq("conversation_id",conv.id).lte("visible_at",new Date().toISOString())
        .order("created_at",{ascending:false}).limit(20),
      db.from("memories").select("summary").eq("conversation_id",conv.id)
        .order("created_at",{ascending:false}).limit(30),
    ]);
    if (stateErr || msgErr || memoryErr) throw new Error("Saved photo decision context unavailable");
    const state = { ...def.seedState } as TessState;
    const row = stateRow as Record<string, unknown> | null;
    for (const key of STATE_KEYS) {
      const raw = row?.[key];
      if (typeof raw === "number" && Number.isFinite(raw)) state[key] = raw;
    }
    const boundary = (["none","selfies","all_photos","mature"].includes(conv.photo_boundary ?? "")
      ? conv.photo_boundary : "all_photos") as PhotoBoundary;
    const allowed = eligiblePhotoCategories(state, {
      age:def.age, enabled:def.photosEnabled, romanticCapable:def.romanticCapable,
      supported:def.photoTypes, matureEnabled:!!conv.mature_photography, boundary,
    });
    const now = new Date();
    const activity = characterAvailability(def,now);
    const transcript = (dialogue ?? []).slice().reverse().map(m => ({
      sender:m.sender, body:m.body, created_at:m.created_at,
    }));
    const memoryLines = (memories ?? []).map(m=>m.summary);

    const scenarios = [];
    for (const category of categories) {
      const available = category.types.filter(t=>allowed.includes(t as typeof allowed[number]));
      if (!available.length) {
        scenarios.push({category:category.id,eligible:false,availableTypes:[],reasons:["ineligible_under_saved_relationship_and_photo_boundaries"],total:0,counts:null});
        continue;
      }
      const results: Array<{action:string;photoType:string|null;reason:string|null;rawPhotoAction?:string|null;willing?:boolean|null;contextual?:boolean|null}> = [];
      for(let i=0;i<data.repetitions;i++) {
        try {
          const instructions = [
            `You are making a private, developer-only communication decision for ${def.preferredName}, an adult fictional person. Follow the personality and current circumstances below. This is not a request from the player and nothing will be delivered. Do not invent an outfit, object or new scene. No outcome is expected; choose authentically.`,
            `Character personality: ${def.bible.slice(0,2800)}`,
            `Texting style: ${def.textingStyle.slice(0,900)}`,
            "Decision order: (1) decide whether to initiate contact in this actual moment; (2) if yes, choose text, photo, or photo with caption; (3) for a photo choose only one available category. State a brief, concrete decision explanation in your own words, including for silence. A photo is as ordinary as a text when it fits the moment. Privacy and relationship boundaries remain authoritative.",
            `Eligible photo categories in THIS test: ${available.join(", ")}. A photo outside this list cannot be selected.`,
          ].join("\n");
          const context = [
            `Moment: ${now.toISOString()}. Character schedule: ${activity.detail}. Scenario: ${category.description}.`,
            `Current relationship state: comfort ${state.comfort}, trust ${state.trust}, romantic intent ${state.romantic_intent}, emotional intimacy ${state.emotional_intimacy}.`,
            `Recent conversation:\n${transcript.slice(-12).map(m=>`${m.sender}: ${m.body.slice(0,300)}`).join("\n") || "(none)"}`,
            `Recent memories:\n${memoryLines.slice(0,6).map(m=>m.slice(0,160)).join("\n") || "(none)"}`,
            `Independent sample ${i+1} of ${data.repetitions} for ${category.id}. Decide sincerely; not every moment needs an outgoing message.`,
          ].join("\n\n");
          const decision = await runStructured(photoIntentDecisionSchema,instructions,context,"autonomous");
          const interpreted = interpretPhotoIntent(decision,available);
          results.push({
            action:interpreted.action,photoType:decision.category,
            rawPhotoAction:decision.medium,willing:decision.initiate,
            contextual:interpreted.validation===null,
            reason:interpreted.validation ?? `${decision.reason}: ${decision.explanation}`,
          });
        } catch(error) {
          results.push({action:"decision_error",photoType:null,reason:error instanceof Error ? error.message.slice(0,180):"model_request_failed"});
        }
      }
      const counted = results.filter(r=>r.action!=="decision_error" && r.action!=="invalid_photo_action" && r.action!=="unexplained_silence").map(r=>r.action as PhotoChoiceOutcome);
      scenarios.push({
        category:category.id,eligible:true,availableTypes:available,total:results.length,
        counts:{...summarizePhotoDecisionBatch(counted).counts,decision_error:results.filter(r=>r.action==="decision_error").length,invalid_photo_action:results.filter(r=>r.action==="invalid_photo_action").length,unexplained_silence:results.filter(r=>r.action==="unexplained_silence").length},
        reasons:results.map(r=>r.reason).filter(Boolean), choices:results,
      });
    }
    return { character:def.key,at:now.toISOString(),mode:"text_model_only_no_generation_no_delivery",
      repetitionsPerCategory:data.repetitions,scenarios,
      limitations:"A no-photo model response has no authoritative internal reason unless the model explicitly provided one. These trials do not test image providers, identities or delivery." };
  });
