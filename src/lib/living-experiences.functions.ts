import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid();
export const experienceSnapshot = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .handler(async ({ context }) => {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [plans, scenes] = await Promise.all([
   db.from("social_plans").select("id,title,starts_at,place_key,status,conversation_id,category").eq("user_id",context.userId).in("status",["accepted","in_progress","active"]).order("starts_at",{ascending:true}).limit(50),
   db.from("living_experiences" as never).select("*").eq("user_id",context.userId).limit(50),
  ]);
  if (plans.error || scenes.error) throw new Error("Experience setup requires reviewed migration 0025");
  return { plans: plans.data ?? [], scenes: scenes.data ?? [] };
 });
export const experienceAction = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((v:unknown)=>z.object({
   planId:uuid, action:z.enum(["claim","pause","resume"]),
   revision:z.number().int().min(0).nullable().default(null),
 }).parse(v))
 .handler(async ({context,data})=>{
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const r=await db.rpc("living_experience_action" as never,{
   p_user:context.userId,p_plan:data.planId,p_action:data.action,
   p_now:new Date().toISOString(),p_expected_revision:data.revision,
   p_outcome:null,
  } as never);
  if(r.error)throw new Error(r.error.message);
  return r.data;
 });

export const experienceMoments = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((v:unknown)=>z.object({planId:uuid}).parse(v))
 .handler(async({context,data})=>{
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const scene=await db.from("living_experiences" as never).select("id,state").eq("user_id",context.userId).eq("plan_id",data.planId).maybeSingle();
  if(scene.error||!scene.data)throw new Error("Experience not available");
  const sceneId=(scene.data as {id:string}).id;
  const moments=await db.from("living_experience_moments" as never).select("id,ordinal,kind,body,source,confirmed").eq("user_id",context.userId).eq("experience_id",sceneId).order("ordinal",{ascending:true}).limit(100);
  if(moments.error)throw new Error("Experience history unavailable");
  return {state:(scene.data as {state:string}).state,moments:moments.data??[]};
 });
export const recordExperienceMoment = createServerFn({ method:"POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((v:unknown)=>z.object({planId:uuid,id:uuid,text:z.string().trim().min(1).max(1500)}).parse(v))
 .handler(async({context,data})=>{
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const r=await db.rpc("living_experience_moment" as never,{
   p_user:context.userId,p_plan:data.planId,p_id:data.id,p_body:data.text,p_now:new Date().toISOString(),
  } as never);
  if(r.error)throw new Error(r.error.message);
  return r.data;
 });
