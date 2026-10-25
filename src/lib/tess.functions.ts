import {photoContextForSchedule} from "./calendar-commitment";
import {resolvePhotoScene} from "./photo-scene.server";
import {photoSceneCheck} from "./photo-scene";
import { continuityPhotoStyle, planPhotography, photographyGuidance, photographyDiagnostics, previousDeliveredPhoto, photographyProfile, type PhotographyPlan } from "./photo-personality";
import { photoPacing } from "./photo-pacing";
import { userVideoMetadata, videoTranscriptText } from "./user-video";
import { evidenceContinuity, currentActivity } from "./world-continuity";
import { continuityContext, reserveImageBudget, imageBudgetStatus, reserveWorldAi } from "./world-runtime.server";
import { attachmentPresent, photoOpportunity, PHOTO_TENDENCIES } from "./photo-opportunities";
import { recallMemories, type MemoryRow } from "./memory-recall";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DIFFICULTIES,
  SEED_STATE,
  STATE_KEYS,
  applyDelta,
  clampDelaySeconds,
  deriveStage,
  sanitizeDelta,
  type Difficulty,
  type TessState,
} from "./tess-logic";
import {
  describeStyle,
  eligiblePhotos,
  repeatsPhotoComposition,
  type PhotoFrequency,
  type PhotoStyle,
  photoMomentHint,
} from "./tess-photos";
import {
  activeLifeEvent,
  decideInitiation,
  decideLatency,
  weatherFlavor,
  type LifeEvent,
} from "./tess-life";
import { characterFor, type CharacterDef } from "./characters";
import { eligiblePhotoCategories, boundaryAllows, nextPhotoBoundary, photoDecisionReason, safePhotoScene, type PhotoContext, type PhotoBoundary } from "./photo-policy";
import { storySchedule } from "./storyline-logic";

const FIRST_MESSAGE =
  "Okay, important question. Did your team actually know any of those answers Friday or were you all confidently guessing?";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Sb = SupabaseClient<Database>;

type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];
type ConvRow = Database["public"]["Tables"]["conversations"]["Row"] & { character: CharacterRow | null };

function pickState(row: Record<string, unknown>, fallback: TessState = SEED_STATE): TessState {
  const s = {} as TessState;
  for (const k of STATE_KEYS) s[k] = Number(row[k] ?? fallback[k]);
  return s;
}

async function loadConversation(supabase: Sb, userId: string, conversationId: string): Promise<ConvRow | null> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("*, character:characters(*)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return conv as ConvRow | null;
}

async function loadConversations(supabase: Sb, userId: string): Promise<ConvRow[]> {
  const { data } = await supabase
    .from("conversations")
    .select("*, character:characters(*)")
    .eq("user_id", userId);
  return (data ?? []) as ConvRow[];
}

async function seedConversation(supabase: Sb, userId: string, character: CharacterRow) {
  const def = characterFor(character.key);
  // New contacts inherit existing global simulation and messaging preferences.
  const { data: prefs } = await supabase.from("conversations")
    .select("show_sim_data,real_time_mode,typing_indicator,read_receipts")
    .eq("user_id",userId).order("created_at",{ascending:true}).limit(1).maybeSingle();
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, character_id: character.id, ...(prefs ? {
      show_sim_data:prefs.show_sim_data,real_time_mode:prefs.real_time_mode,
      typing_indicator:prefs.typing_indicator,read_receipts:prefs.read_receipts
    } : {}) })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("tess_state").insert({ conversation_id: conv.id, user_id: userId, ...def.seedState });
  const opener = def.key === "tess" ? FIRST_MESSAGE : def.opener;
  if (opener) {
    await supabase.from("messages").insert({ conversation_id: conv.id, user_id: userId, sender: "tess", body: opener });
  }
  return conv;
}

/** Ensure the user has one conversation per enabled character. Existing threads (and all Tess history) are never touched. */
export const ensureConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: chars } = await supabase.from("characters").select("*").eq("enabled", true).order("sort_order");
    const existing = await loadConversations(supabase, userId);
    const have = new Set(existing.map((c) => c.character_id));
    for (const ch of chars ?? []) {
      if (!have.has(ch.id)) await seedConversation(supabase, userId, ch);
    }
    const convs = await loadConversations(supabase, userId);
    return { ids: convs.map((c) => c.id as string) };
  });

/** Inbox rows: each conversation with its character, last visible message and unread count. */
export const inboxOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const convs = await loadConversations(supabase, userId);
    const nowIso = new Date().toISOString();
    const rows = await Promise.all(
      convs.map(async (conv) => {
        const [{ data: last }, { count }] = await Promise.all([
          supabase
            .from("messages")
            .select("id, sender, body, created_at, metadata")
            .eq("conversation_id", conv.id)
            .lte("visible_at", nowIso)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .eq("sender", "tess")
            .lte("visible_at", nowIso)
            .gt("created_at", conv.last_read_at ?? "1970-01-01"),
        ]);
        const def = characterFor(conv.character?.key);
        const md = (last?.metadata ?? null) as { photo?: string; generated_path?: string } | null;
        const preview = last
          ? last.body?.trim() || (userVideoMetadata(last.metadata) ? "Sent a video" : md?.photo || md?.generated_path ? "Sent a photo" : "")
          : "";
        return {
          id: conv.id as string,
          characterKey: def.key,
          name: def.preferredName,
          fullName: def.fullName,
          preview: last ? `${last.sender === "user" ? "You: " : ""}${preview}` : "",
          lastAt: (last?.created_at ?? conv.created_at) as string,
          unread: count ?? 0,
        };
      }),
    );
    rows.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return rows;
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("conversations")
      .update({ last_read_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export async function createGeneratedPhoto(
  supabase: Sb,
  userId: string,
  type: string,
  scene: string,
  expression: string | null,
  style: PhotoStyle | null,
  def?: CharacterDef,
  actionId?: string,
  text?: import("./photo-text").PhotoText | null,
  photography?: PhotographyPlan,
) {
  // The provider prefers a direct OPENAI_API_KEY and falls back to the Lovable gateway key.
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["LOVABLE_API_KEY"];
  if (!safePhotoScene([scene, expression, text?.exact, text?.surface, ...Object.values(style ?? {})].filter(Boolean).join(" "))) throw new Error("photo scene outside supported boundaries");
  if (!apiKey) throw new Error("image provider not configured");
  const { generateTessImage, includesTess, lovableGatewayProvider, sceneHasMabel } = await import("./tess-image.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t = type as import("./tess-image.server").TessImageType;
  const characterKey = def?.key ?? "tess";
  // Mabel's canonical reference is optional — a missing file must never break a reply.
  let mabelReference: Blob | null = null;
  if (characterKey === "tess" && sceneHasMabel(scene)) {
    const { data } = await supabaseAdmin.storage.from("tess-reference").download("mabel.jpg");
    mabelReference = data ?? null;
  }
  const provider = lovableGatewayProvider(apiKey);
  const identity = def
    ? { key: def.key, name: def.fullName, age: def.age, pronouns: def.pronouns, appearance: def.appearance }
    : undefined;
  const canonical = includesTess(t) ? await (await import("./profile-media.server")).currentCanonical(supabaseAdmin, userId, characterKey) : undefined;
  const img = await generateTessImage({ provider, canonical, photography, mabelReference, type: t, scene, expression, style, identity, text });
  const path = `${userId}/${actionId ?? crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from("tess-photos").upload(path, img.bytes, { contentType: img.mime });
  if (error) throw new Error(error.message);
  return {
    path,
    type,
    scene,
    selfie: t.endsWith("selfie"),
    tess: includesTess(t),
    provider: img.provider,
    model: img.model,
    style,
    identityReferenceUsed: img.identityReferenceUsed,
    textQuality: img.textQuality,
    diagnostics: img.diagnostics,
  };
}

async function removeUserPhotos(supabase: Sb, userId: string) {
  const { data } = await supabase.storage.from("tess-photos").list(userId, { limit: 1000 });
  if (data?.length) await supabase.storage.from("tess-photos").remove(data.map((f) => `${userId}/${f.name}`));
}

type PhotoMsg = { id?: string; sender: string; body: string; created_at: string; metadata: unknown };

/** User-sent photos: describe once with vision (cached in metadata), then show as text in the transcript. */
async function describeUserPhotos<T extends PhotoMsg>(supabase: Sb, convId: string, list: T[]): Promise<T[]> {
  const out: T[] = [];
  let described = 0;
  for (const m of list) {
    const md = (m.metadata ?? {}) as { user_photo?: string; photo_desc?: string };
    if (m.sender === "user" && userVideoMetadata(m.metadata)) {
      out.push({ ...m, body: videoTranscriptText(m.body, m.metadata) });
      continue;
    }
    if (m.sender !== "user" || !md.user_photo) { out.push(m); continue; }
    let desc = md.photo_desc;
    if (!desc && described < 2) {
      described++;
      try {
        const { data: blob } = await supabase.storage.from("tess-photos").download(md.user_photo);
        if (blob) {
          const { describeImage } = await import("./tess.server");
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          desc = (await describeImage(`data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`)) ?? undefined;
          if (desc) {
            await supabase.from("messages").update({ metadata: { ...md, photo_desc: desc } })
              .eq("conversation_id", convId).eq("created_at", m.created_at).eq("sender", "user");
          }
        }
      } catch (e) {
        console.warn("User photo description unavailable");
      }
    }
    const tag = `[He sent a photo: ${desc || "couldn't make it out clearly"}]`;
    out.push({ ...m, body: m.body ? `${m.body} ${tag}` : tag });
  }
  return out;
}

// Coalesce simultaneous foreground/background attempts within this server instance.
// Failed provider calls are never retried here and make no simulation writes.
const activeTurns = new Map<string, Promise<Awaited<ReturnType<typeof runTurnUnlocked>>>>();
export function runTurn(...args: Parameters<typeof runTurnUnlocked>) {
  const key = `${args[1]}:${args[2]}${args[4]?.developerPhoto === "preview" ? ":preview" : ""}`;
  const active = activeTurns.get(key);
  if (active) return active;
  const turn = runTurnUnlocked(...args).then(async result=>{
    if(args[4]?.developerPhoto!=="preview"&&result.count>0&&process.env["SUPABASE_SERVICE_ROLE_KEY"]){
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      await resolvePhotoScene(supabaseAdmin,args[1],args[2],{activity:"ordinary activity",availability:"free",detail:""},new Date(),true).catch(()=>console.warn("[character-scene] projection deferred; delivered evidence retained"));
    }
    return result;
  }).finally(() => activeTurns.delete(key));
  activeTurns.set(key, turn);
  return turn;
}

async function runTurnUnlocked(
  supabase: Sb,
  userId: string,
  conversationId: string,
  tz: string,
  initiation?: { gapHours: number; reason?: string | null; photoKey?: string; intentionId?: string; budgetReserved?: boolean; developerPhoto?: "preview" | "deliver"; expectedSceneVersion?: string | undefined },
  voice?: {callId:string;turnId:string;sourceId:string|null},
) {
  const { generateTessReply, generateContactReply } = await import("./tess.server");
  const conv = await loadConversation(supabase, userId, conversationId);
  if (!conv) throw new Error("No conversation");
  if (!voice && process.env["ENABLE_VOICE_CALLS"] === "true") {
    const live = await supabase.from("phone_calls").select("id").eq("user_id",userId).eq("conversation_id",conv.id).in("state",["calling","ringing","connecting","connected"]).gt("expires_at",new Date().toISOString()).limit(1);
    if (live.data?.length) throw new Error("Finish this contact's call before sending another message");
  }
  const def = characterFor(conv.character?.key);
  if (voice) await (await import("./phone-calls.server")).guardVoiceTurn(supabase,userId,conv.id,voice);
  const isTess = def.key === "tess";
  const nowIso = new Date().toISOString();
  // Recover the durable outbox before any new paid generation.
  const configuredPhotoAdmin = process.env["SUPABASE_SERVICE_ROLE_KEY"]
    ? (await import("@/integrations/supabase/client.server")).supabaseAdmin : null;
  const deliveryProbe = configuredPhotoAdmin ? await configuredPhotoAdmin.rpc("deliver_photo_turn", { p_job_id: null as unknown as string }) : null;
  const missingDeliveryFunction = deliveryProbe?.error && ["PGRST202", "42883"].includes(deliveryProbe.error.code);
  if (deliveryProbe?.error && !missingDeliveryFunction) throw new Error("Character delivery service is unavailable; please retry later");
  // A source merge cannot install a database function. Keep legacy text replies
  // working during setup, but never charge for photos without durable delivery.
  const photoAdmin = deliveryProbe && !deliveryProbe.error ? configuredPhotoAdmin : null;
  const calendarAdmin = configuredPhotoAdmin;
  if (initiation?.developerPhoto !== "preview" && calendarAdmin && await (await import("./calendar-coordinator.server")).calendarContractReady(calendarAdmin)) {
    await (await import("./interactive-world.server")).syncCalendar(calendarAdmin, userId, new Date());
  }
  const worldReady = !!(deliveryProbe?.data as { worldVersion?: number } | null)?.worldVersion;
  if (photoAdmin && !voice && initiation?.developerPhoto !== "preview") {
    const { recoverPhotoDelivery } = await import("./photo-delivery.server");
    const recovered = await recoverPhotoDelivery(photoAdmin, conv.id, userId);
    if (recovered) return recovered;
  }

  const [{ data: stateRow }, { data: msgs }, { data: mems }, { data: recentGen }] = await Promise.all([
    supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
    supabase
      .from("messages")
      .select("id, sender, body, created_at, metadata")
      .eq("conversation_id", conv.id)
      .lte("visible_at", nowIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(40),
    supabase
      .from("memories")
      .select("summary, memory_type, importance, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(2000),
    def.photosEnabled
      ? supabase
          .from("generated_images")
          .select("scene, pose_type, camera_angle, crop_type, hairstyle, expression, clothing_category, setting, selfie_type")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
  ]);
  const actionAnchor = initiation
    ? (initiation.photoKey ?? `${conv.id}:${def.key}:${Math.floor(Date.now() / (PHOTO_TENDENCIES[def.key].hours * 3_600_000))}`)
    : `reply:${(msgs ?? []).find((m) => m.sender === "user")?.id ?? "initial"}`;
  const actionKey = `${userId}:${conv.id}:${actionAnchor}`;
  if (photoAdmin && initiation?.developerPhoto !== "preview") {
    const { existingPhotoAction } = await import("./photo-delivery.server");
    if (await existingPhotoAction(photoAdmin, actionKey)) return { count: 0, lastVisibleAt: null, replayed: true };
  }
  const recentStyles = (recentGen ?? []) as PhotoStyle[];

  const state = pickState(stateRow ?? {}, def.seedState);
  const photoContext: PhotoContext = {
    age: def.age, enabled: def.photosEnabled, romanticCapable: def.romanticCapable,
    supported: def.photoTypes, matureEnabled: conv.mature_photography,
    boundary: (["none", "selfies", "all_photos", "mature"].includes(conv.photo_boundary) ? conv.photo_boundary : "all_photos") as PhotoBoundary,
  };
  const difficulty = (conv.difficulty as Difficulty) ?? "realistic";
  const recent = initiation?.developerPhoto === "preview" ? (msgs ?? []) : await describeUserPhotos(supabase, conv.id, msgs ?? []);

  // Fictional-world context: schedule, rotating life event, regional weather (all contacts live near ZIP 16602).
  const now = new Date();
  const { getWeatherContext } = await import("./tess-weather.server");
  const weather = await getWeatherContext(def.zip);

  const messageList = [...recent].reverse().map((m) => ({
    ...m,
    body: (() => {
      const md = m.metadata as { photo?: string; generated_path?: string; game_chat?: string } | null;
      if (md?.photo) return `[sent a photo: ${md.photo}] ${m.body}`;
      if (md?.generated_path) return `[sent a photo she just took] ${m.body}`;
      if (md?.game_chat && ["trivia", "four", "words", "pool"].includes(md.game_chat)) return `[sent while playing ${md.game_chat === "four" ? "Four in a Row" : md.game_chat === "words" ? "Word Hunt" : md.game_chat === "pool" ? "8 Ball" : "Trivia"} together] ${m.body}`;
      return m.body;
    })(),
  }));
  const recentText = [initiation?.reason ?? "", ...recent.slice(0, 6).map((m) => m.body ?? "")].join(" ");
  const memoryList = recallMemories((mems ?? []) as MemoryRow[], recentText, new Date())
    .map((m) => `${m.memory_type}: ${m.summary}`);

  // Living-world knowledge: ONLY this character's own rows — knowledge
  // isolation is enforced by the query. Their prompt never sees what other
  // characters witnessed or what the user said to anyone else.
  const { knowledgeForCharacter } = await import("./social.server");
  const { storylineContext } = await import("./storyline.server");
  const story = await storylineContext(supabase, userId, def.key, now);
  const { knowledgePromptLines } = await import("./social-logic");
  const continuity = worldReady && photoAdmin ? await continuityContext(photoAdmin, userId, conv.id, now) : { lines: [] };
  const calendarLines = photoAdmin
    ? await (await import("./interactive-world.server"))
        .calendarContext(photoAdmin, userId, conv.id, def.key, now)
        .catch(() => {
          console.warn("[calendar] sync deferred; existing character conversation preserved");
          return [] as string[];
        })
    : [];
  const worldKnowledge = [...calendarLines, ...continuity.lines, ...story.lines, ...knowledgePromptLines(
    await knowledgeForCharacter(supabase, userId, def.key).catch(() => []),
    def.preferredName,
  )];
  const {profileDisplayContext}=await import("./visual-profiles.server");
  const ownProfile=await profileDisplayContext(supabase,userId,def.key);
  if(ownProfile)worldKnowledge.unshift(ownProfile);

  const { sharedPlanContext } = await import("./shared-world.server");
  const shared = await sharedPlanContext(supabase, userId, def.key, now);
  if (shared) worldKnowledge.unshift(`ACTIVE SHARED PLAN: ${shared.summary} Photos may show only you, objects or the environment; group portraits are not supported.`);
  const { altoonaContext } = await import("./altoona-places");
  worldKnowledge.push(...altoonaContext(def.key,now));
  const { townPopulationContext } = await import("./blair-town-npcs");
  worldKnowledge.push(...townPopulationContext(def.key,now));
  const { scheduledPopulationContext } = await import("./npc-schedules");
  worldKnowledge.push(...scheduledPopulationContext(def.key,now));
  const baseSchedule = shared ?? storySchedule(currentActivity(def, now, difficulty === "chaos" ? 2 : 1), story.event);
  const sceneContext=await resolvePhotoScene(photoAdmin??supabase,userId,conv.id,baseSchedule,now,!!photoAdmin&&initiation?.developerPhoto!=="preview");
  const schedule=sceneContext.schedule;
  worldKnowledge.unshift(`CURRENT PHYSICAL CONTEXT (${sceneContext.source}): ${schedule.detail}. This takes priority over older storylines, old photographs and the original calendar venue. Do not invent travel to make a photograph fit an old topic.`);
  const realTime = !!conv.real_time_mode;
  // Never charge for an image or mutate relationship state before the sleep boundary.
  if (schedule.availability === "asleep" && (realTime || initiation)) {
    return { count: 0, lastVisibleAt: null, reason: "asleep" };
  }
  if (initiation && !initiation.developerPhoto) {
    if (conv.muted) return { count: 0, lastVisibleAt: null, reason: "background initiation disabled for this conversation" };
    if (schedule.availability === "busy") return { count: 0, lastVisibleAt: null, reason: "busy" };
    const { data: quiet, error } = await supabase.from("user_profile").select("value").eq("user_id", userId).eq("key", "quiet_hours").maybeSingle();
    if (error) throw new Error("Quiet-hour preferences unavailable");
    const { parseQuietHours, inQuietHours } = await import("./world.server");
    const hours = parseQuietHours(quiet?.value);
    if (inQuietHours(now, hours.start, hours.end)) return { count: 0, lastVisibleAt: null, reason: "quiet hours" };
  }
  const freq = (conv.photo_frequency ?? "normal") as PhotoFrequency;
  const ownMsgs = recent.filter((m) => m.sender === "tess");
  const photoIdx = ownMsgs.findIndex((m) => attachmentPresent(m.metadata));
  const ownSinceLastPhoto = photoIdx < 0 ? ownMsgs.length + 99 : photoIdx;
  // Query the last attachment independently: 40-message context is not a time limit.
  const { data: lastPhoto, error: lastPhotoError } = await supabase.from("messages").select("created_at")
    .eq("conversation_id", conv.id).eq("sender", "tess")
    .or("metadata->>photo.not.is.null,metadata->>generated_path.not.is.null,metadata->>generated_image_id.not.is.null")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastPhotoError) throw new Error("Photo frequency history unavailable");
  const pacing = photoPacing({character:def.key,frequency:freq,now,lastPhotoAt:lastPhoto?.created_at??null,ownSinceLastPhoto,
    userText:initiation?"":recent.find(m=>m.sender==="user")?.body??"",context:initiation?.reason??schedule.detail,developerOverride:!!initiation?.developerPhoto});
  // Report pacing for diagnostics only. A grounded spontaneous moment does not
  // wait for an arbitrary message-count or minute-based cooldown.
  const cooldown = false;
  const photoCompatible = schedule.availability !== "asleep" && schedule.availability !== "busy"
    && !/\b(?:driv(?:e|es|ing)|surgery|emergency|patients?|phone (?:down|away))\b/i.test(schedule.detail);
  let generateTypes = cooldown || !photoCompatible ? [] : eligiblePhotoCategories(state, photoContext);
  const sentPhotos = new Set(recent.map((m) => (m.metadata as { photo?: string } | null)?.photo).filter(Boolean));
  let photos = isTess && !cooldown && photoCompatible
    ? eligiblePhotos(state, { irritation: state.irritation >= 20 }).filter((p) => !sentPhotos.has(p.id) && boundaryAllows(photoContext.boundary, p.selfie ? "casual_selfie" : "object")) : [];
  const imageBudget = worldReady && photoAdmin ? await imageBudgetStatus(photoAdmin, userId, conv.id, now) : null;
  if (imageBudget && !imageBudget.allowed) generateTypes = [];
  if (!photoAdmin) { generateTypes = []; photos = []; }
  const lifeEvent = story.event ?? (isTess ? activeLifeEvent(now, weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined) : null);
  const photography = planPhotography({character:def.key,key:actionKey,now,schedule,
    userText:initiation?'':recent.find(m=>m.sender==='user')?.body??'',
    weather:weather?.condition??null,previous:previousDeliveredPhoto(recent,def.key,now)});
  const opportunity = photoOpportunity({
    character: def.key, conversationId: conv.id, now, schedule, state, frequency: freq,
    eligibleTypes: generateTypes, lastPhotoAt: lastPhoto?.created_at ?? null,
    ownSinceLastPhoto, gapHours: initiation?.gapHours ?? 0,
    context: initiation?.reason || photoContextForSchedule(schedule,lifeEvent?.summary),
    preview: !!initiation?.developerPhoto, activeConversation: !initiation, developerOverride: !!initiation?.developerPhoto, userText:initiation?"":recent.find(m=>m.sender==="user")?.body??"",
  });
  if (!opportunity.eligible && opportunity.reason.startsWith("no permitted photo categories")) {
    opportunity.reason = imageBudget && !imageBudget.allowed ? "Image daily/monthly attempt limit reached. No image will be generated." : !photoAdmin ? "Photo delivery is not configured or the migration is missing. No image will be generated."
      : cooldown ? pacing.reason
      : "No photo type is currently allowed by her photo boundaries and relationship eligibility.";
  }
  const photoPreflight=photoSceneCheck(photography,initiation?.reason??recent.find(m=>m.sender==='user')?.body??'',sceneContext.source);
  if(initiation?.developerPhoto&&!photoPreflight.allowed){opportunity.eligible=false;opportunity.selected=false;opportunity.reason=`Requested photo location ${photoPreflight.inferredRequestedScene} conflicts with current ${photoPreflight.canonicalLocation}; rule ${photoPreflight.failedRule}`;}
  if(initiation?.developerPhoto==='deliver'&&initiation.expectedSceneVersion&&initiation.expectedSceneVersion!==sceneContext.version)return {count:0,lastVisibleAt:null,reason:'Current scene changed since preview. Preview again before generating.',photoValidation:{...photoPreflight,failedRule:'photo.preview_scene_version_matches',stage:'before_generation'},previewSceneVersion:sceneContext.version};
  if (initiation?.developerPhoto) photos = []; // Controlled tests exercise generation, never a stock-image stand-in.
  if (initiation?.developerPhoto === "preview") {
    const { currentCanonical } = await import("./profile-media.server");
    const reference = await currentCanonical(photoAdmin ?? supabase, userId, def.key).then(r => ({ asset:r.asset,sha256:r.sha256,width:r.width,height:r.height,status:"structurally_usable" })).catch(() => null);
    const migration = photoAdmin ? await photoAdmin.rpc("deliver_photo_turn", { p_job_id: null as unknown as string }) : null;
    return { count: 0, lastVisibleAt: null, opportunity, schedule, photoValidation:{...photoPreflight,stage:"requested_context",generatedSceneChecked:false,identityChecked:false},previewSceneVersion:sceneContext.version, generatedTypes: generateTypes, imageBudget, canonicalReference: reference, photography: photographyDiagnostics(photography,null), pacing, visualScreenConfigured: !!process.env["OPENAI_API_KEY"], referenceConditioningConfigured: !!process.env["OPENAI_API_KEY"],
      providerConfigured: !!(process.env["OPENAI_API_KEY"] || process.env["LOVABLE_API_KEY"]),
      textProviderConfigured: !!process.env["OPENAI_API_KEY"], deliveryConfigured: !!photoAdmin,
      deliveryMigrationReady: !!migration && !migration.error };
  }
  if (initiation?.developerPhoto && !opportunity.eligible) return { count: 0, lastVisibleAt: null, reason: opportunity.reason, photoValidation:{...photoPreflight,stage:"requested_context"} };
  if (initiation && !opportunity.eligible) { generateTypes = []; photos = []; }
  const photoHint = [opportunity.selected ? opportunity.hint : photoMomentHint({ ownSinceLastPhoto, freq, initiation: !!initiation, hasTypes: photos.length + generateTypes.length > 0 }), ...(photos.length + generateTypes.length > 0 ? [photographyGuidance(photography)] : [])].filter(Boolean).join('\n');
  if (initiation && !initiation.developerPhoto && !initiation.budgetReserved && worldReady && !await reserveWorldAi(photoAdmin!, userId)) return { count: 0, lastVisibleAt: null, reason: "daily autonomous AI limit reached" };
  if (voice) {
    photos=[];generateTypes=[];
    worldKnowledge.unshift(`CHANNEL: Live in-app telephone conversation, not texting. Keep one natural spoken reply under 500 characters; no emojis, photographs or text-only actions. ${ (await import("./phone-calls")).CALL_VOICES[def.key].style } Do not award progress for answering. Use existing memories and boundaries. Only if you actually choose to end this call, end your spoken reply with <end_call>; an ordinary completed reply does NOT end the call.`);
  }
  let reply: import("./tess.server").TessReply;
  if (isTess) {
    reply = await generateTessReply({
      state, stage: deriveStage(state), difficulty, messages: messageList, photos, generateTypes,
      photoFrequency: freq, recentPhotoStyles: recentStyles.map(describeStyle), memories: memoryList,
      tz, initiation, weather, weatherFlavor: weather ? weatherFlavor(weather) : null, lifeEvent,
      initiationReason: initiation?.reason ?? null, photoBoundary: photoContext.boundary,
      photoHint, worldKnowledge, availabilityDetail: schedule.detail,
    });
  } else {
    reply = await generateContactReply({
      character: def, state, stage: deriveStage(state), difficulty, messages: messageList,
      memories: memoryList, tz, initiation, initiationReason: initiation?.reason ?? null,
      availabilityDetail: schedule.detail, weather, generateTypes, recentPhotoStyles: recentStyles.map(describeStyle),
      photoBoundary: photoContext.boundary, photoHint, worldKnowledge,
    });
    if (!def.photosEnabled || (reply.photo && reply.photo.action !== "generate")) reply.photo = null;
  }
  if (initiation?.developerPhoto && !reply.photo) return { count: 0, lastVisibleAt: null, reason: "character declined the opportunity" };

  if (voice) { reply.photo=null;reply.photo_boundary_decision="unchanged";await (await import("./phone-calls.server")).guardVoiceTurn(supabase,userId,conv.id,voice); }
  const scheduleActions = await (await import("./calendar-coordinator.server")).prepareScheduleActions(
    calendarAdmin ?? supabase, userId, conv.id, reply, now,
    { userSourceId: recent.find(m => m.sender === "user")?.id ?? "", userText: recent.find(m => m.sender === "user")?.body ?? "" },
  );
  const proposedPhoto = !!reply.photo;
  const boundary = nextPhotoBoundary(photoContext.boundary, reply.photo_boundary_decision, !!reply.photo);
  if (reply.photo_boundary_decision === "reopen") reply.photo = null;
  let photoRejectionReason: string | null = null;
  if (reply.photo) {
    const fixed = photos.find((p) => p.id === reply.photo?.asset_id);
    const category = reply.photo.action === "fixed" ? (fixed?.selfie ? "casual_selfie" : "object") : reply.photo.type;
    const eligible = reply.photo.action === "fixed" && fixed ? [category] : generateTypes;
    photoRejectionReason = !category
      ? "photo proposal has no valid category or fixed asset"
      : photoDecisionReason({ type: category as import("./photo-policy").PhotoCategory,
        willing: reply.photo.willing, contextual: reply.photo.contextual, framing: reply.photo.framing,
        eligible: eligible.filter((t) => t !== null), state,
        context: { ...photoContext, boundary },
      });
    if (photoRejectionReason) reply.photo = null;
  }
  if (proposedPhoto && !reply.photo) return { count: 0, lastVisibleAt: null,
    reason: photoRejectionReason ?? "character chose to reopen photo boundaries without sharing" };
  const delta = sanitizeDelta(reply.state_delta, difficulty);
  if (voice && !voice.sourceId) for (const key of STATE_KEYS) delta[key] = 0;
  if (!def.romanticCapable) {
    delta.romantic_attraction = 0;
    delta.physical_attraction = 0;
    delta.romantic_intent = 0;
  }
  const next = applyDelta(state, delta);
  if (!def.romanticCapable) {
    next.romantic_attraction = 0;
    next.physical_attraction = 0;
    next.romantic_intent = 0;
  }
  const stage = deriveStage(next);
  {
    const { normalizeEventTags } = await import("./event-tags");
    reply.event_tags = normalizeEventTags(reply.event_tags ?? [], reply.tone ?? "", def.romanticCapable);
  }

  let photoAction: string | null = null;
  if (reply.photo || photoAdmin) {
    if (!photoAdmin) return { count: 0, lastVisibleAt: null, reason: "server photo delivery is not configured" };
    const { reservePhotoAction } = await import("./photo-delivery.server");
    photoAction = await reservePhotoAction(photoAdmin, { key: actionKey, conversationId: conv.id, userId });
    if (!photoAction) return { count: 0, lastVisibleAt: null, replayed: true };
  }

  // --- Photo: Tess curated first, then optional generation; other contacts generate only. Failures stay invisible.
  let photo: string | null = null;
  let generated: Awaited<ReturnType<typeof createGeneratedPhoto>> | null = null;
  let generationFailure: string | null = null;
  let imageRequested = false;
  const p = reply.photo;
  if (isTess && p?.action === "fixed" && p.asset_id && photos.some((x) => x.id === p.asset_id)) {
    photo = p.asset_id;
  } else if (p?.action === "generate" && p.type && p.scene && generateTypes.includes(p.type)) {
    {
      try {
        if (!photoSceneCheck(photography,p.scene,sceneContext.source).allowed) throw new Error('photo scene contradicts current location');
        const rawStyle: PhotoStyle = {
          pose_type: p.pose_type,
          camera_angle: p.camera_angle,
          crop_type: p.crop_type,
          hairstyle: p.hairstyle,
          expression: p.expression,
          clothing_category: p.clothing_category,
          setting: p.setting,
          selfie_type: p.selfie_type,
        };
        // Context first, variety second: only nudge an exact repeat of a recent photo.
        const { fictionalGroupScene } = await import("./tess-image.server");
        const isGroupScene = fictionalGroupScene(p.scene);
        const matchingScene = (recentGen ?? []).some((old) => old.scene.trim().toLowerCase() === p.scene!.trim().toLowerCase());
        // A first group portrait is meaningfully different from an earlier solo selfie even
        // when the character's outfit, crop and lighting happen to match.
        const comparableRecentStyles = (recentGen ?? []).filter((old) =>
          fictionalGroupScene(old.scene) === isGroupScene) as PhotoStyle[];
        if (matchingScene || repeatsPhotoComposition(rawStyle, comparableRecentStyles)) {
          throw new Error("repeated photo composition");
        }
        const style = continuityPhotoStyle(photography,rawStyle,p.scene);
        if (worldReady && !await reserveImageBudget(photoAdmin!, photoAction!, conv.id, userId)) throw new Error("Image attempt budget exhausted");
        imageRequested = true;
        generated = await createGeneratedPhoto(supabase, userId, p.type, p.scene, style.expression ?? p.expression, style, def, photoAction!, p.text_spec, photography);
        if (worldReady) {
          const { error } = await photoAdmin!.from("media_attempts").update({ status: "generated", storage_path: generated.path }).eq("action_id", photoAction!);
          if (error) console.warn("[character-photo] usage status pending; reserved attempt remains counted");
        }
      } catch (e) {
        const { PhotoGenerationFailure } = await import("./tess-image.server");
        // Do not expose raw provider errors, prompts or secrets in client-facing diagnostics.
        const safeLocalReasons = ["repeated photo composition", "photo scene contradicts current location", "Image attempt budget exhausted",
          "photo scene outside supported boundaries", "image provider not configured"];
        generationFailure = e instanceof PhotoGenerationFailure
          ? e.diagnostics.failureReason ?? "generation_or_quality_check_failed"
          : e instanceof Error && safeLocalReasons.includes(e.message)
            ? e.message
            : "unexpected_photo_generation_failure";
        if (photoAdmin) {
          await photoAdmin.from("world_events").insert({ user_id: userId, conversation_id: conv.id,
            character_key: def.key, kind: "photo_generation_failure",
            summary: `Photo withheld: ${generationFailure}`,
            payload: { reason: generationFailure, imageRequested, photoValidation:{...photoSceneCheck(photography,p.scene??"",sceneContext.source),stage:"generated_scene"}, photography: photographyDiagnostics(photography, null),
              ...(e instanceof PhotoGenerationFailure ? { ...e.diagnostics } : {}),
              actionId: photoAction, source: initiation?.developerPhoto ? "developer" : initiation ? "autonomous" : "conversation",
              delivery: "not_delivered" } });
        }
        if (worldReady && photoAction) await photoAdmin!.from("media_attempts").update({ status: "failed" }).eq("action_id", photoAction).eq("status", "reserved");
        console.warn("[character-photo] generation withheld:", generationFailure);
      }
    }
  }
  if (photoAction && reply.photo && !photo && !generated) {
    const { failPhotoAction } = await import("./photo-delivery.server");
    await failPhotoAction(photoAdmin!, photoAction);
    return { count: 0, lastVisibleAt: null, reason: initiation?.developerPhoto ? `photo unavailable: ${generationFailure ?? "no deliverable image"}; action will not be recharged on retry` : "photo unavailable; action will not be recharged on retry", ...(initiation?.developerPhoto?{photoValidation:{...photoSceneCheck(photography,p?.scene??"",sceneContext.source),stage:"generated_scene",imageRequested}}:{}) };
  }
  const generatedId = generated ? crypto.randomUUID() : null;
  const bubbles = reply.messages.map((b) => b.trim()).filter(Boolean).slice(0, 3);
  if ((photo || generated) && !bubbles.length) bubbles.push("");
  const voiceEnd = !!voice && bubbles.join(" ").trim().endsWith("<end_call>");
  if (voice) bubbles.splice(0,bubbles.length,bubbles.join(" ").replace(/<end_call>/g,"").trim().slice(0,1000));

  // Latency: practice mode keeps the 3s–4min delay; Real-Time Mode follows the contact's schedule.
  const lastUserMsg = recent.find((m) => m.sender === "user");
  const activelyChatting = !!lastUserMsg && Date.now() - new Date(lastUserMsg.created_at).getTime() < 5 * 60_000;
  const latency = voice ? {seconds:0,reason:"telephone"} : initiation
    ? { seconds: 3 as number | null, reason: "initiation — no reply delay" }
    : decideLatency({
        realTimeMode: realTime,
        schedule,
        lifeEvent,
        state,
        activelyChatting,
        baseSeconds: reply.send_delay_seconds,
      });
  if (latency.seconds === null) {
    // Real-Time Mode sleep boundary: they'll see it in the morning. No fake reply.
    return { count: 0, lastVisibleAt: null, sleep: true, latencyReason: latency.reason };
  }
  // Calendar actions commit with a visible reply; ordinary pacing remains unchanged.
  // Practice delays stay 3s–4min; real-time delays may run longer (work, events).
  const delaySec = voice || scheduleActions.length ? 0 : realTime ? Math.min(3600, Math.max(3, latency.seconds)) : clampDelaySeconds(latency.seconds);
  let at = Date.now() + delaySec * 1000;
  const notificationGroup = photoAction ?? crypto.randomUUID();
  const rows = bubbles.map((body, i) => {
    if (i > 0) at += 1500 + Math.min(body.length * 60, 6000);
    return {
      id: crypto.randomUUID(),
      conversation_id: conv.id,
      user_id: userId,
      sender: "tess",
      body,
      visible_at: new Date(at).toISOString(),
      created_at: new Date(at).toISOString(),
      metadata: {
        tone: reply.tone,
        tags: reply.event_tags,
        initiated: !!initiation,
        notification_group: notificationGroup,
        push_primary: !voice && i === 0,
        ...(voice ? {channel:"voice",call_id:voice.callId,call_turn:voice.turnId,voice_end:voiceEnd} : {}),
        ...(i === 0 ? { photo_decision: { profile:def.key, scenario:photography.scenario,
          decision:photo || generated ? 'chosen' : 'not_selected',
          reason:photo || generated ? 'character_selected_eligible_photo' : photoRejectionReason ?? (opportunity.eligible ? 'character_did_not_select_photo' : opportunity.reason) } } : {}),
        latency: latency.reason,
        ...(photo && i === 0 ? { photo } : {}),
        ...(generated && i === 0 ? { generated_path: generated.path, generated_image_id: generatedId!, photo_type: generated.type, text_quality: generated.textQuality.status, photo_identity: generated.diagnostics,
          photo_visual: { version:1, character:def.key, location:photography.location, style:{...generated.style}, objects:photography.continuity.objects }, photo_source: initiation?.developerPhoto ? "developer" : initiation ? "autonomous" : "conversation" } : {}),
      },
    };
  });
  const { data: existingMem } = await supabase
    .from("memories")
    .select("summary")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Set((existingMem ?? []).map((m: { summary: string }) => norm(m.summary)));
  const memRows = (reply.memory_candidates ?? [])
    .filter((m) => m.summary?.trim())
    .filter((m) => {
      const k = norm(m.summary);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3)
    .map((m) => ({
      conversation_id: conv.id,
      user_id: userId,
      memory_type: m.memory_type || "fact",
      summary: m.summary.slice(0, 300),
      importance: Math.min(5, Math.max(1, Math.round(m.importance || 3))),
    }));
  if (photoAction && photoAdmin) {
    const { preparePhotoDelivery } = await import("./photo-delivery.server");
    const generatedRow = generated ? {
      id: generatedId, created_at: new Date().toISOString(), conversation_id: conv.id,
      message_id: rows[0]!.id, user_id: userId, photo_type: generated.type, scene: generated.scene,
      includes_tess: generated.tess, is_selfie: generated.selfie, relationship_stage: stage, state_snapshot: next,
      provider: generated.provider, model: generated.model, storage_path: generated.path,
      pose_type: generated.style?.pose_type ?? null, camera_angle: generated.style?.camera_angle ?? null,
      crop_type: generated.style?.crop_type ?? null, hairstyle: generated.style?.hairstyle ?? null,
      expression: generated.style?.expression ?? null, clothing_category: generated.style?.clothing_category ?? null,
      setting: generated.style?.setting ?? null, selfie_type: generated.style?.selfie_type ?? null,
      identity_reference_used: generated.identityReferenceUsed,
    } : null;
    const extractedContinuity = worldReady ? evidenceContinuity(reply.continuity, recent.find((m) => m.sender === "user")?.body ?? "", bubbles.join("\n"), now) : null;
    return preparePhotoDelivery(photoAdmin, photoAction, userId, conv.id, {
      expectedStateUpdatedAt: stateRow?.updated_at ?? null,
      lastUserId: recent.find((m) => m.sender === "user")?.id ?? null,
      initiation: !!initiation, pendingBefore: nowIso, rows, generated: generatedRow,
      state: { ...next, last_delta: { ...delta, tags: reply.event_tags }, last_tone: reply.tone },
      stage, boundary, memories: memRows, scheduleActions,
      relationshipHistory: { before: state, after: next, delta: Object.fromEntries(STATE_KEYS.map(k=>[k,next[k]-state[k]])), previousStage:deriveStage(state), stage, tone: reply.tone??null, tags: reply.event_tags??[],
        evaluatedAt: nowIso,
        sourceKind: (photo || generated) ? "photo_delivery" : initiation ? "autonomous_message" : voice ? "voice" : "conversation",
        contextSummary: (recent.find(m=>m.sender==="user")?.body ?? initiation?.reason ?? "Autonomous character interaction").slice(0,300),
        perspective: reply.character_perspective?.trim().slice(0,700) || null },
      continuity: extractedContinuity,
      intentionId: extractedContinuity?.fulfilled?.id === initiation?.intentionId ? initiation?.intentionId : null,
    } as unknown as import("@/integrations/supabase/types").Json, voice ? {callId:voice.callId,turnId:voice.turnId} : undefined);
  }
  if (scheduleActions.length) throw new Error("Calendar actions require the atomic delivery service");
  // Text-only turns retain the existing persistence path. Never delete a paid pending photo.
  if (!initiation) {
    const { error } = await supabase.from("messages").delete().eq("conversation_id", conv.id).eq("sender", "tess").gt("visible_at", nowIso)
      .is("metadata->>generated_path", null).is("metadata->>photo", null);
    if (error) throw new Error("Could not replace pending text replies");
  }
  const { error: stateError } = await supabase.from("tess_state").update({ ...next, last_delta: { ...delta, tags: reply.event_tags }, last_tone: reply.tone, updated_at: nowIso }).eq("conversation_id", conv.id);
  if (stateError) throw new Error("Could not save relationship state");
  const { error: convError } = await supabase.from("conversations").update({ relationship_stage: stage, photo_boundary: boundary, updated_at: nowIso }).eq("id", conv.id);
  if (convError) throw new Error("Could not save conversation");
  if (rows.length) {
    const { error } = await supabase.from("messages").insert(rows);
    if (error) throw new Error("Could not save reply");
  }
  if (memRows.length) {
    const { error } = await supabase.from("memories").insert(memRows);
    if (error) throw new Error("Could not save memories");
  }

  // Append-only audited evaluation. Do not make normal replies depend on a debug migration.
  // Existing photographs are delivered through a separate transactional path and
  // must be instrumented separately rather than pretending they were evaluated here.
  const evaluationMessageId = rows[0]?.id ?? recent.find(m=>m.sender==="user")?.id;
  if(evaluationMessageId){
    try{
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const numericChange=Object.fromEntries(STATE_KEYS.map(k=>[k,next[k]-state[k]]));
      const {error:historyError}=await supabaseAdmin.from("relationship_evaluations" as "memories").upsert({
        user_id:userId,conversation_id:conv.id,message_id:evaluationMessageId,
        evaluated_at:nowIso,source_kind:initiation?"autonomous_message":voice?"voice":"conversation",
        context_summary:(recent.find(m=>m.sender==="user")?.body??initiation?.reason??"Autonomous character interaction").slice(0,300),
        state_before:state,state_after:next,delta:numericChange,
        stage_before:deriveStage(state),stage_after:stage,
        observed_tone:reply.tone??null,event_tags:reply.event_tags??[],
        character_perspective:reply.character_perspective?.trim().slice(0,700) || null
      } as never,{onConflict:"conversation_id,message_id"});
      if(historyError)console.warn("[relationship-history] Evaluation could not be recorded:",historyError.message);
    }catch(error){console.warn("[relationship-history] Recording deferred:",error);}
  }
  return { count: rows.length, lastVisibleAt: rows.at(-1)?.visible_at ?? null, notificationGroup };
}

export const tessRespond = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid(), tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => runTurn(context.supabase, context.userId, data.conversationId, data.tz));

export const tessMaybeInitiate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const convs = await loadConversations(supabase, userId);
    const now = new Date();
    const { getWeatherContext } = await import("./tess-weather.server");
    const weather = await getWeatherContext();
    const flavor = weather ? weatherFlavor(weather) : null;
    const results: { conversationId: string; count: number }[] = [];

    for (const conv of convs) {
      const def = characterFor(conv.character?.key);
      const isTess = def.key === "tess";
      const [{ data: last }, { data: stateRow }, { data: life }, { data: recentMsgs }] = await Promise.all([
        supabase
          .from("messages")
          .select("created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
        supabase.from("tess_life").select("*").eq("conversation_id", conv.id).maybeSingle(),
        supabase
          .from("messages")
          .select("sender, body, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (!last) continue;
      const gapHours = (Date.now() - new Date(last.created_at).getTime()) / 3_600_000;

      const state = pickState(stateRow ?? {}, def.seedState);
      const { storylineContext } = await import("./storyline.server");
      const story = await storylineContext(supabase, userId, def.key, now);
      const lifeEvent = story.event ?? (isTess
        ? activeLifeEvent(
            now,
            weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined,
          )
        : null);
      const { sharedPlanContext } = await import("./shared-world.server");
      const schedule = await sharedPlanContext(supabase, userId, def.key, now) ?? storySchedule(currentActivity(def, now, conv.difficulty === "chaos" ? 2 : 1), story.event);

      // Who's been carrying the conversation lately?
      const list = (recentMsgs ?? []).filter((m) => m.sender === "user" || m.sender === "tess");
      const userCount = list.filter((m) => m.sender === "user").length;
      const contactCount = list.filter((m) => m.sender === "tess").length;
      const userCarrying = userCount > contactCount * 1.6 && userCount >= 5;

      // A plausible reason makes initiation natural: weather hook, life event,
      // or a callback-worthy memory. Weather alone never triggers — it only
      // supplies the reason once the engine already considers them eligible.
      const hasPlausibleReason = !!(flavor || lifeEvent || state.relationship_momentum > 35 || state.curiosity > 55);

      const decision = decideInitiation({
        state,
        stage: deriveStage(state),
        gapHours,
        lastInitiatedAt: life?.last_initiated_at ? new Date(life.last_initiated_at) : null,
        userCarrying,
        recentQuality: Math.min(100, state.relationship_momentum + state.playfulness / 2),
        schedule,
        lifeEvent,
        hasPlausibleReason,
        now,
        minGapHours: def.initiation.minGapHours,
        scoreMultiplier: def.initiation.scoreMultiplier,
      });
      // Record the check so the debug screen can explain eligibility.
      await supabase.from("tess_life").upsert({
        conversation_id: conv.id,
        user_id: userId,
        current_event: lifeEvent ? { ...lifeEvent } : {},
        last_initiation: {
          at: now.toISOString(),
          eligible: decision.eligible,
          initiated: decision.initiate,
          score: decision.score,
          chance: decision.chance,
          reasons: decision.reasons,
        },
        updated_at: now.toISOString(),
      });
      const { evaluateSpontaneousPhoto } = await import("./spontaneous-photo.server");
      const photoChance = await evaluateSpontaneousPhoto(supabase, { def, conversation: conv, state, schedule, now,
        gapHours, lastInitiatedAt: life?.last_initiated_at ?? null, context: lifeEvent?.summary ?? schedule.detail });
      if (!decision.initiate && !photoChance.selected) {
        results.push({ conversationId: conv.id, count: 0 });
        continue;
      }

      const reason = photoChance.selected ? photoChance.hint : lifeEvent?.summary ?? flavor ?? null;
      const result = await runTurn(supabase, userId, conv.id, data.tz, { gapHours, reason, ...(photoChance.selected ? { photoKey: photoChance.key } : {}) });
      if (result.count > 0) {
        await supabase
          .from("tess_life")
          .update({ last_initiated_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("conversation_id", conv.id);
      }
      results.push({ conversationId: conv.id, count: result.count });
    }
    return { results, count: results.reduce((n, r) => n + r.count, 0) };
  });

export const runDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid(), tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateDebrief } = await import("./tess.server");
    const conv = await loadConversation(supabase, userId, data.conversationId);
    if (!conv) throw new Error("No conversation");
    const def = characterFor(conv.character?.key);
    const [{ data: msgs }, { data: stateRow }] = await Promise.all([
      supabase
        .from("messages")
        .select("sender, body, created_at")
        .eq("conversation_id", conv.id)
        .lte("visible_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
    ]);
    const list = (msgs ?? []).reverse();
    if (list.filter((m: { sender: string }) => m.sender === "user").length < 2) {
      throw new Error("Send a few more messages before asking for a debrief.");
    }
    const state = pickState(stateRow ?? {}, def.seedState);
    const analysis = await generateDebrief({
      messages: list,
      tz: data.tz,
      stage: deriveStage(state),
      state,
      characterName: def.preferredName,
      baselineNotes: def.baselineNotes,
      romanticCapable: def.romanticCapable,
    });
    const { data: row, error } = await supabase
      .from("debriefs")
      .insert({ conversation_id: conv.id, user_id: userId, analysis: { ...analysis, stage: deriveStage(state), state } })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const resetRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conv = await loadConversation(supabase, userId, data.conversationId);
    if (!conv) throw new Error("No conversation");
    const def = characterFor(conv.character?.key);
    if (def.key === "tess") await removeUserPhotos(supabase, userId);
    await supabase.from("conversations").delete().eq("id", conv.id);
    const { data: ch } = await supabase.from("characters").select("*").eq("key", def.key).single();
    if (ch) await seedConversation(supabase, userId, ch);
    return { ok: true };
  });

export const deleteAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await removeUserPhotos(context.supabase, context.userId);
    await context.supabase.from("conversations").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid().optional(),
        difficulty: z.enum(DIFFICULTIES).optional(),
        typing_indicator: z.boolean().optional(),
        read_receipts: z.boolean().optional(),
        show_sim_data: z.boolean().optional(),
        photo_frequency: z.enum(["rare", "normal", "frequent"]).optional(),
        real_time_mode: z.boolean().optional(),
        muted: z.boolean().optional(),
        mature_photography: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Database["public"]["Tables"]["conversations"]["Update"] = {};
    if (data.difficulty !== undefined) patch.difficulty = data.difficulty;
    if (data.typing_indicator !== undefined) patch.typing_indicator = data.typing_indicator;
    if (data.read_receipts !== undefined) patch.read_receipts = data.read_receipts;
    if (data.show_sim_data !== undefined) patch.show_sim_data = data.show_sim_data;
    if (data.photo_frequency !== undefined) patch.photo_frequency = data.photo_frequency;
    if (data.real_time_mode !== undefined) patch.real_time_mode = data.real_time_mode;
    if (data.muted !== undefined) patch.muted = data.muted;
    if (data.mature_photography !== undefined) {
      if (!data.conversationId) throw new Error("Choose a conversation for mature photography.");
      const conv = await loadConversation(context.supabase, context.userId, data.conversationId);
      if (!conv) throw new Error("No conversation");
      const def = characterFor(conv.character?.key);
      if (data.mature_photography && (def.age < 18 || !def.romanticCapable)) throw new Error("Mature photography is unavailable for this contact.");
      patch.mature_photography = data.mature_photography;
    }
    // photo_frequency is Tess-specific; everything else applies to the given
    // conversation, or all of the user's conversations when none is given.
    if (data.photo_frequency !== undefined && !data.conversationId) {
      const { data: tessChar } = await context.supabase.from("characters").select("id").eq("key", "tess").single();
      if (!tessChar) throw new Error("Contact unavailable");
      await context.supabase
        .from("conversations")
        .update(patch)
        .eq("user_id", context.userId)
        .eq("character_id", tessChar.id);
    } else if (data.conversationId) {
      await context.supabase.from("conversations").update(patch).eq("id", data.conversationId).eq("user_id", context.userId);
    } else {
      await context.supabase.from("conversations").update(patch).eq("user_id", context.userId);
    }
    return { ok: true };
  });

/** Allowlisted developer opportunity: preview is read-only; delivery uses the normal character turn. */
export const developerPhotoOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid(), requestId: z.string().uuid(),
    expectedSceneVersion:z.string().max(1500).optional(), mode: z.enum(["preview", "deliver"]), context: z.string().trim().min(1).max(1500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer photo actions are disabled");
    const conv = await loadConversation(context.supabase, context.userId, data.conversationId);
    if (!conv) throw new Error("No conversation");
    const { data: last } = await context.supabase.from("messages").select("created_at")
      .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const gapHours = last ? (Date.now() - Date.parse(last.created_at)) / 3_600_000 : 999;
    return runTurn(context.supabase, context.userId, conv.id, "America/New_York", {
      gapHours, expectedSceneVersion:data.expectedSceneVersion, reason: data.context, photoKey: `developer:${data.requestId}`, developerPhoto: data.mode,
    });
  });

/** Developer-only, explicit reset of a fictional contact's saved no-selfie boundary. */
export const developerResetPhotoBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversationId: z.string().uuid(),
    confirmation: z.literal("RESET PHOTO BOUNDARY"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { developerPhotosAllowed } = await import("./spontaneous-photo.server");
    if (!developerPhotosAllowed(context.userId)) throw new Error("Developer photo actions are disabled");
    const conv = await loadConversation(context.supabase, context.userId, data.conversationId);
    if (!conv) throw new Error("No conversation");
    const previous = conv.photo_boundary as PhotoBoundary;
    if (previous === "none") return { ok: true, previous, current: "none" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: auditError } = await supabaseAdmin.from("world_events").insert({
      user_id: context.userId, conversation_id: conv.id, character_key: conv.character?.key ?? "unknown",
      kind: "developer_photo_boundary_reset",
      summary: `Developer requested photo boundary reset from ${previous} to none`,
      payload: { previous, next: "none", source: "developer_debug", explicitConfirmation: true },
    });
    if (auditError) throw new Error("Photo boundary reset audit could not be recorded");
    const { data: changed, error } = await context.supabase.from("conversations")
      .update({ photo_boundary: "none" }).eq("id", conv.id).eq("user_id", context.userId)
      .eq("photo_boundary", previous).select("id").maybeSingle();
    if (error || !changed) throw new Error("Photo boundary was changed concurrently or could not be updated");
    return { ok: true, previous, current: "none" };
  });

/** Everything the hidden debug screen needs, computed server-side. */
export const debugSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conv = await loadConversation(supabase, userId, data.conversationId);
    if (!conv) throw new Error("No conversation");
    const def = characterFor(conv.character?.key);
    const isTess = def.key === "tess";
    const now = new Date();
    const nowIso = now.toISOString();
    const [{ data: stateRow }, { data: life }, { data: last }, { data: recentMsgs }, { data: mems }] = await Promise.all([
      supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
      supabase.from("tess_life").select("*").eq("conversation_id", conv.id).maybeSingle(),
      supabase
        .from("messages")
        .select("created_at, metadata")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("sender, metadata, created_at, body")
        .eq("conversation_id", conv.id)
        .lte("visible_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("memories")
        .select("memory_type, summary, importance, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    const state = pickState(stateRow ?? {}, def.seedState);
    const { getWeatherContext } = await import("./tess-weather.server");
    const weather = await getWeatherContext(def.zip);
    const lifeEvent = isTess
      ? activeLifeEvent(
          now,
          weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined,
        )
      : null;
    const { sharedPlanContext } = await import("./shared-world.server");
    const baseSchedule = await sharedPlanContext(supabase, userId, def.key, now) ?? currentActivity(def, now, conv.difficulty === "chaos" ? 2 : 1);
    const sceneContext=await resolvePhotoScene(supabase,userId,conv.id,baseSchedule,now);
    const schedule=sceneContext.schedule;
    const gapHours = last ? (Date.now() - new Date(last.created_at).getTime()) / 3_600_000 : 0;
    const list = recentMsgs ?? [];
    const userCount = list.filter((m) => m.sender === "user").length;
    const tessCount = list.filter((m) => m.sender === "tess").length;
    const flavor = weather ? weatherFlavor(weather) : null;
    const initiation = decideInitiation({
      state,
      stage: deriveStage(state),
      gapHours,
      lastInitiatedAt: life?.last_initiated_at ? new Date(life.last_initiated_at) : null,
      userCarrying: userCount > tessCount * 1.6 && userCount >= 5,
      recentQuality: Math.min(100, state.relationship_momentum + state.playfulness / 2),
      schedule,
      lifeEvent,
      hasPlausibleReason: !!(flavor || lifeEvent || state.relationship_momentum > 35 || state.curiosity > 55),
      now,
      minGapHours: def.initiation.minGapHours,
      scoreMultiplier: def.initiation.scoreMultiplier,
    });
    const freq = ((conv as { photo_frequency?: string }).photo_frequency ?? "normal") as PhotoFrequency;
    const hasPhoto = (m: { metadata: unknown }) => {
      const md = m.metadata as { photo?: string; generated_image_id?: string } | null;
      return !!(md?.photo || md?.generated_image_id);
    };
    const debugOwn=list.filter(m=>m.sender==="tess");
    const debugIndex=debugOwn.findIndex(hasPhoto);
    const lastAttachment=await supabase.from("messages").select("created_at").eq("user_id",userId).eq("conversation_id",conv.id).eq("sender","tess").or("metadata->>photo.not.is.null,metadata->>generated_path.not.is.null,metadata->>generated_image_id.not.is.null").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(lastAttachment.error)throw new Error("Photo pacing history unavailable");
    const debugPacing=photoPacing({character:def.key,frequency:freq,now,lastPhotoAt:lastAttachment.data?.created_at??null,ownSinceLastPhoto:debugIndex<0?99:debugIndex,userText:list.find(m=>m.sender==="user")?.body??"",context:schedule.detail});
    const recentlySentPhoto=!debugPacing.allowed;
    const curatedCount = !isTess || recentlySentPhoto ? 0 : eligiblePhotos(state, { irritation: state.irritation >= 20 }).length;
    const genTypes = recentlySentPhoto ? [] : eligiblePhotoCategories(state, {
      age: def.age, enabled: def.photosEnabled, romanticCapable: def.romanticCapable,
      supported: def.photoTypes, matureEnabled: conv.mature_photography,
      boundary: conv.photo_boundary as PhotoBoundary,
    });
    const lastLatency = (last?.metadata as { latency?: string } | null)?.latency ?? null;
    const [{ data: checkpoint }, { data: records }, { data: events }, { data: attempts }] = await Promise.all([
      supabase.from("character_world_state").select("*").eq("conversation_id", conv.id).eq("user_id", userId).maybeSingle(),
      supabase.from("world_records").select("kind,key,summary,status,due_at,retry_at,expires_at,attempts").eq("conversation_id", conv.id).eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
      supabase.from("world_events").select("kind,summary,occurs_at,payload").eq("conversation_id", conv.id).eq("user_id", userId).order("occurs_at", { ascending: false }).limit(20),
      supabase.from("media_attempts").select("status,created_at").eq("conversation_id", conv.id).eq("user_id", userId).gte("created_at", new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString()),
    ]);
    const developerTools = (await import("./spontaneous-photo.server")).developerPhotosAllowed(userId);
    let workerHealth: { lastTick: { status: string; started_at: string; finished_at: string | null } | null; recentActions: { id: string; status: string; started_at: string; finished_at: string | null }[] } | null = null;
    if (developerTools && process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: lastTick }, { data: actions }] = await Promise.all([
        supabaseAdmin.from("job_runs").select("status,started_at,finished_at").eq("job", "world-tick").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from("job_runs").select("id,status,started_at,finished_at").eq("job", `photo-turn:${conv.id}`).eq("detail->>userId", userId).order("started_at", { ascending: false }).limit(8),
      ]);
      workerHealth = { lastTick, recentActions: actions ?? [] };
    }
    let photoIdentity = null;
    if (developerTools) {
      const { currentCanonical } = await import("./profile-media.server");
      const canonical = await currentCanonical(supabase, userId, def.key).then(r=>({asset:r.asset,sha256:r.sha256,width:r.width,height:r.height,status:"structurally_usable"})).catch(()=>null);
      const { data: recentPhotos } = await supabase.from("messages").select("id,metadata,visible_at").eq("conversation_id",conv.id).eq("user_id",userId).lte("visible_at",nowIso).is("metadata->>photo",null).order("created_at",{ascending:false}).limit(30);
      const lastPhoto = recentPhotos?.find(m => !!(m.metadata as {generated_path?:string}|null)?.generated_path);
      const metadata = lastPhoto?.metadata as {generated_path?:string;photo_identity?:import("@/integrations/supabase/types").Json;photo_source?:string}|undefined;
      let comparisonUrl: string | null = null;
      if (metadata?.generated_path?.startsWith(`${userId}/`) && metadata.generated_path.split("/").length === 2 && !metadata.generated_path.includes("..")) {
        const result = await supabase.storage.from("tess-photos").createSignedUrl(metadata.generated_path,120);
        comparisonUrl = result.data?.signedUrl ?? null;
      }
      const profileUrl = canonical?.asset.startsWith(`${userId}/profile/${def.key}/`) && !canonical.asset.includes('..') ? (await supabase.storage.from('tess-photos').createSignedUrl(canonical.asset,120)).data?.signedUrl ?? def.avatar : def.avatar;
      photoIdentity = {canonical, profileUrl, latest:metadata?.photo_identity ?? null, source:metadata?.photo_source ?? null, delivery:lastPhoto?"delivered":"none", comparisonUrl};
    }
    return {
      photoIdentity,
      photography: developerTools ? {canonicalScene:{location:photoSceneCheck(planPhotography({character:def.key,key:`debug:${conv.id}`,now,schedule}),"",sceneContext.source).canonicalLocation,source:sceneContext.source,version:sceneContext.version,observedAt:sceneContext.observation?.observedAt??null},profile:photographyProfile(def.key), current:photographyDiagnostics(planPhotography({character:def.key,key:`debug:${conv.id}`,now,schedule,userText:list.find(m=>m.sender==='user')?.body??'',weather:weather?.condition??null,previous:previousDeliveredPhoto(list,def.key,now)}),null),latest:(list.find(m=>(m.metadata as {photo_identity?:{photography?:unknown}}|null)?.photo_identity?.photography)?.metadata as {photo_identity?:unknown}|undefined)?.photo_identity??null,latestDecision:(list.find(m=>(m.metadata as {photo_decision?:unknown}|null)?.photo_decision)?.metadata as {photo_decision?:unknown}|undefined)?.photo_decision??null,pacingReason:debugPacing.reason,eligibleTypes:genTypes,lastFailure:events?.find(e=>e.kind==='photo_generation_failure')??null} : null,
      world: { checkpoint, records: records ?? [], events: events ?? [], imageAttemptsThisMonth: attempts?.length ?? 0, imageAttempts: attempts ?? [],
        workerHealth, imageBudget: await imageBudgetStatus(supabase, userId, conv.id, now).catch(() => null), schedulePreview: (await import("./world-runtime.server")).previewWorld(def, now), checkpointPresent: !!checkpoint },
      photoDeveloperTools: developerTools,
      photoBoundary: conv.photo_boundary,
      character: { key: def.key, name: def.preferredName, fullName: def.fullName, photosEnabled: def.photosEnabled },
      state,
      lastDelta: JSON.parse(JSON.stringify(stateRow?.last_delta ?? {})) as Record<string, number | string | string[]>,
      lastTone: stateRow?.last_tone ?? null,
      stage: deriveStage(state),
      difficulty: conv.difficulty,
      realTimeMode: !!(conv as { real_time_mode?: boolean }).real_time_mode,
      schedule,
      lifeEvent,
      weather,
      weatherFlavor: flavor,
      gapHours: Math.round(gapHours * 10) / 10,
      initiation: {
        eligible: initiation.eligible,
        reasons: initiation.reasons,
        score: initiation.score,
        chance: initiation.chance,
        nextWindowHours: initiation.nextWindowHours,
        lastCheck: life?.last_initiation
          ? (JSON.parse(JSON.stringify(life.last_initiation)) as Record<string, string | number | boolean | string[] | null>)
          : null,
        lastInitiatedAt: life?.last_initiated_at ?? null,
      },
      photo: {
        pacing:debugPacing,
        eligible: !recentlySentPhoto && (curatedCount > 0 || genTypes.length > 0),
        reason: recentlySentPhoto
            ? debugPacing.reason
            : state.irritation >= 40
              ? `irritation ${state.irritation} — no photos while annoyed`
              : state.irritation >= 20
                ? `irritation ${state.irritation} — selfies suppressed, context photos only`
                : `${curatedCount} curated + generated types [${genTypes.join(", ") || "none"}] available`,
        curatedCount,
        generatedTypes: genTypes,
        boundary: conv.photo_boundary,
        matureEnabled: conv.mature_photography,
      },
      latencyReason: lastLatency,
      recentMemories: mems ?? [],
    };
  });
