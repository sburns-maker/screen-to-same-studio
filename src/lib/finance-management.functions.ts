import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const management = z.object({
  expenses: z.array(z.object({ key:z.string().uuid(), label:z.string(), monthlyCents:z.number(), active:z.boolean() })),
  improvements: z.array(z.object({ assetKey:z.string(), level:z.number() })),
  disclosures: z.array(z.object({ characterKey:z.string(), subjectKey:z.string(), disclosedAt:z.string() })),
});
export type FinanceManagement = z.infer<typeof management>;

const command = z.discriminatedUnion("command",[
  z.object({command:z.literal("expense_add"),payload:z.object({label:z.string().trim().min(2).max(80),monthlyCents:z.number().int().min(1).max(100000000000)})}),
  z.object({command:z.literal("expense_remove"),payload:z.object({expenseKey:z.string().uuid()})}),
  z.object({command:z.literal("hire"),payload:z.object({assetKey:z.string().min(1).max(90),name:z.string().trim().min(2).max(60),monthlyCents:z.number().int().min(10000).max(500000000)})}),
  z.object({command:z.literal("fire"),payload:z.object({assetKey:z.string().min(1).max(90),workerKey:z.string().startsWith("hire:").max(90)})}),
  z.object({command:z.literal("upgrade"),payload:z.object({assetKey:z.string().min(1).max(90)})}),
  z.object({command:z.literal("reveal"),payload:z.object({assetKey:z.string().min(1).max(90),characterKey:z.enum(["tess","maya","claire","jordan","ben","sienna","kendra","riley","carly","brooke","jade","nina"])})}),
  z.object({command:z.literal("reveal_identity"),payload:z.object({characterKey:z.enum(["tess","maya","claire","jordan","ben","sienna","kendra","riley","carly","brooke","jade","nina"])})}),
]);
export type FinanceCommand = z.infer<typeof command>;

export const loadFinanceManagement = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const result=await db.rpc("finance_management_snapshot" as never,{p_user:context.userId} as never);
    if(result.error)throw new Error("Business controls unavailable. Apply migration 0081.");
    return management.parse(result.data);
  });

export const updateFinanceManagement = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((value:unknown)=>z.object({requestId:z.string().uuid(),action:command}).parse(value))
  .handler(async ({data,context})=>{
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const result=await db.rpc("finance_manage" as never,{
      p_user:context.userId,p_request:data.requestId,p_command:data.action.command,
      p_payload:data.action.payload,
    } as never);
    if(result.error){
      const allow=["Invalid expense label","Invalid expense amount","Unknown active expense",
        "Owned asset required","Invalid employee name","Salary out of range",
        "Only hired staff can be released","Unknown hired worker",
        "Maximum improvement level reached","Insufficient player funds for upgrade",
        "Unknown character"];
      throw new Error(allow.includes(result.error.message)?result.error.message:"Management action could not be saved.");
    }
    return management.parse(result.data);
  });
