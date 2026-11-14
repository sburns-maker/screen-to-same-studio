import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const session=z.object({
 id:z.string().uuid(),ventureId:z.string().uuid(),
 service:z.enum(["portrait","family","branding","rental"]),
 virtualDate:z.string(),priceCents:z.number(),depositCents:z.number(),
 costCents:z.number(),status:z.enum(["scheduled","completed","cancelled"]),
 bookedAt:z.string(),completedAt:z.string().nullable(),
});
export type StudioSession=z.infer<typeof session>;
const action=z.discriminatedUnion("action",[
 z.object({action:z.literal("schedule"),requestId:z.string().uuid(),ventureId:z.string().uuid(),
   service:z.enum(["portrait","family","branding","rental"]),
   virtualDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}),
 z.object({action:z.literal("complete"),requestId:z.string().uuid(),ventureId:z.string().uuid(),sessionId:z.string().uuid()}),
 z.object({action:z.literal("cancel"),requestId:z.string().uuid(),ventureId:z.string().uuid(),sessionId:z.string().uuid()}),
]);
export type StudioSessionAction=z.infer<typeof action>;

export const loadStudioSessions=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.handler(async ({context})=>{
 const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
 const result=await db.rpc("finance_studio_sessions_snapshot" as never,{p_user:context.userId} as never);
 if(result.error)throw new Error("Studio bookings unavailable. Lovable must apply migration 0089.");
 return z.array(session).parse(result.data);
});

export const updateStudioSession=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((raw:unknown)=>action.parse(raw))
.handler(async ({context,data})=>{
 const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
 const payload=data.action==="schedule"?
  {service:data.service,virtualDate:data.virtualDate}:{sessionId:data.sessionId};
 const result=await db.rpc("finance_studio_session_action" as never,{
   p_user:context.userId,p_request:data.requestId,
   p_venture:data.ventureId,p_command:data.action,p_payload:payload,
 } as never);
 if(result.error){
  const allowed=[
   "Operating studio required","Unknown photography service",
   "Invalid virtual session date","Session date must be within the next 90 virtual days",
   "Studio booking capacity reached for that day","Unknown scheduled session",
   "Cannot complete a future session","Past bookings require completion or dispute review",
   "Studio ownership changed",
  ];
  throw new Error(allowed.includes(result.error.message)?result.error.message:
    "Could not update the fictional studio booking.");
 }
 return z.array(session).parse(result.data);
});
