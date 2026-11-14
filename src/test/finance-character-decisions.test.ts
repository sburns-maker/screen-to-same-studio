import { describe,expect,it } from "vitest";
import { financeDecisionSchema, FINANCE_DECISION_RULES } from "../lib/finance-character-decisions";

describe("character-specific finance decision contract",()=>{
 it("requires nullable explicit actions in strict structured output",()=>{
   const none={action:null,assetKey:null,offerId:null,quote:null};
   expect(financeDecisionSchema.safeParse(none).success).toBe(true);
   expect(financeDecisionSchema.safeParse({
     action:"ack_agreement",assetKey:"work:pleasant-valley-vet",
     offerId:null,quote:"I have reviewed the agreement and I accept the boundaries.",
   }).success).toBe(true);
   expect(financeDecisionSchema.safeParse({
     action:"accept_offer",assetKey:"work:pleasant-valley-vet",
     offerId:"1234",quote:"Yes, I want the partnership.",
   }).success).toBe(false);
 });
 it("requires separate choices and warns against imagined or marital consent",()=>{
   expect(FINANCE_DECISION_RULES).toContain("A yes to marriage");
   expect(FINANCE_DECISION_RULES).toContain("NOT accepting equity");
   expect(FINANCE_DECISION_RULES).toContain("exact contiguous");
   expect(FINANCE_DECISION_RULES).toContain("Do not keep bringing up settled policy concerns");
 });
});
