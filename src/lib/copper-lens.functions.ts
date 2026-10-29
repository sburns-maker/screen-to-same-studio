import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workplaceShiftLikely } from "./workplaces";
import { characterAvailability, CHARACTERS } from "./characters";

const PLACE = "work:sienna";
const stateSchema = z.object({
  seated: z.boolean().default(false),
  order: z.string().trim().max(100).default(""),
  tabOpen: z.boolean().default(false),
  turns: z.number().int().min(0).max(1000).default(0),
  interruption: z.string().max(200).default(""),
  houseReply: z.string().max(250).default(""),
});
type BarState = z.infer<typeof stateSchema>;
const initial: BarState = { seated: false, order: "", tabOpen: false, turns: 0, interruption: "", houseReply: "" };
type EventRow = { payload: unknown };
function stateFrom(row: EventRow | null | undefined): BarState {
  const data = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return stateSchema.catch(initial).parse(data);
}
async function barDb(userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const presence = await db.from("town_presence").select("place_key,arrives_at").eq("user_id", userId).maybeSingle();
  if (presence.error || presence.data?.place_key !== PLACE || !presence.data.arrives_at || Date.parse(presence.data.arrives_at) > Date.now())
    throw new Error("Arrive at Copper Lens before interacting with the bar.");
  return db;
}
async function latestState(db: Awaited<ReturnType<typeof barDb>>, userId: string) {
  const r = await db.from("world_events").select("payload").eq("user_id", userId).eq("kind", "copper_lens_bar_state").order("created_at", { ascending: false }).limit(1);
  if (r.error) throw new Error("Bar visit state is unavailable.");
  return stateFrom(r.data?.[0] as EventRow | undefined);
}
function bartenderState() {
  const now = new Date();
  const onShift = workplaceShiftLikely("sienna", now);
  const awake = characterAvailability(CHARACTERS.sienna, now).availability !== "asleep";
  return onShift && awake ? "sienna_may_be_working" : "house_bartender";
}
export const copperLensState = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await barDb(context.userId);
    return { ...await latestState(db, context.userId), bartender: bartenderState() };
  });
export const copperLensAction = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    action: z.enum(["seat", "menu", "order", "settle", "conversation", "talk_house", "leave"]),
    requestId: z.string().uuid(),
    drink: z.string().trim().max(100).optional(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const db = await barDb(context.userId);
    const prior = await db.from("world_events").select("payload").eq("user_id", context.userId).eq("kind", "copper_lens_bar_state").contains("payload", { requestId: data.requestId }).limit(1);
    if (prior.error) throw new Error("Could not verify bar action.");
    if (prior.data?.length) return { ...stateFrom(prior.data[0] as EventRow), bartender: bartenderState() };
    const previous = await latestState(db, context.userId);
    const next: BarState = { ...previous, interruption: "" };
    if (data.action === "seat") next.seated = true;
    if (data.action === "menu") next.houseReply = "Tonight’s menu includes an old fashioned and other classic cocktails. What can I get you?";
    if (data.action === "talk_house") next.houseReply = next.order ? "The bartender checks on your drink and asks how you're enjoying it." : "The house bartender looks over and asks what you'd like to order.";
    if (data.action === "order") {
      if (!next.seated) throw new Error("Take a seat before ordering.");
      next.order = data.drink || "an old fashioned";
      next.tabOpen = true;
      next.houseReply = "The on-duty bartender begins preparing your drink. Your fictional tab is open.";
    }
    if (data.action === "settle") { next.tabOpen = false; next.order = ""; next.houseReply = "The bartender closes your fictional tab and thanks you."; }
    if (data.action === "conversation") {
      next.turns = Math.min(1000, next.turns + 1);
      if (next.turns % 3 === 0) next.interruption = "Another customer approaches the bar. The bartender pauses to serve them before returning.";
    }
    if (data.action === "leave") Object.assign(next, initial);
    const event = await db.from("world_events").insert({
      user_id: context.userId, kind: "copper_lens_bar_state",
      summary: "Fictional Copper Lens bar activity",
      payload: { ...next, requestId: data.requestId, action: data.action, place_key: PLACE },
    });
    if (event.error) throw new Error("Could not save bar activity.");
    return { ...next, bartender: bartenderState() };
  });
