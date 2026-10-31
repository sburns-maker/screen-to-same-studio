import { z } from "zod";
export const weddingPlanActionSchema = z.object({
  action:z.enum(["accept","decline"]).nullable(),
  planId:z.string().uuid().nullable(),
  quote:z.string().min(1).max(300).nullable(),
}).nullable();
export type WeddingPlanAction = z.infer<typeof weddingPlanActionSchema>;
export const WEDDING_PLAN_ACTION_RULES = `WEDDING PLANNING: wedding_plan_action defaults to null. This is NOT a marriage commitment or ceremony. Only if an authoritative pending wedding plan with an exact ID is included in your private world context may you independently choose accept or decline, using that exact planId, and include a contiguous quote of your own visible message that unmistakably expresses YOUR decision. You may defer or ask practical questions with wedding_plan_action=null. Never infer acceptance from flirtation, a hypothetical, a high relationship score, or the player's wishes. Never put the player's words in your mouth. Accepting a wedding date does not mean the wedding has happened.`;
export function validateWeddingAction(action:WeddingPlanAction,body:string,pendingIds:readonly string[]) {
 return !!action && !!action.action && !!action.planId && !!action.quote &&
   pendingIds.includes(action.planId) && body.includes(action.quote);
}
