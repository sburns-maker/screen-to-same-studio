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
  FREQUENCY_RULES,
  allowedGeneratedTypes,
  curatedFallback,
  describeStyle,
  eligiblePhotos,
  tooSimilarToRecent,
  varyStyle,
  type PhotoFrequency,
  type PhotoStyle,
} from "./tess-photos";
import {
  activeLifeEvent,
  decideInitiation,
  decideLatency,
  scheduleFor,
  weatherFlavor,
  type LifeEvent,
} from "./tess-life";

const FIRST_MESSAGE =
  "Okay, important question. Did your team actually know any of those answers Friday or were you all confidently guessing?";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Sb = SupabaseClient<Database>;

function pickState(row: Record<string, unknown>): TessState {
  const s = {} as TessState;
  for (const k of STATE_KEYS) s[k] = Number(row[k] ?? SEED_STATE[k]);
  return s;
}

async function loadConversation(supabase: Sb, userId: string) {
  const { data: conv } = await supabase.from("conversations").select("*").eq("user_id", userId).maybeSingle();
  return conv;
}

async function seedConversation(supabase: Sb, userId: string) {
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("tess_state").insert({ conversation_id: conv.id, user_id: userId });
  await supabase.from("messages").insert({ conversation_id: conv.id, user_id: userId, sender: "tess", body: FIRST_MESSAGE });
  return conv;
}

export const ensureConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const conv = (await loadConversation(supabase, userId)) ?? (await seedConversation(supabase, userId));
    return { id: conv.id as string };
  });

async function createGeneratedPhoto(
  supabase: Sb,
  userId: string,
  type: string,
  scene: string,
  expression: string | null,
  style: PhotoStyle | null,
) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("image provider not configured");
  const { generateTessImage, includesTess, lovableGatewayProvider, sceneHasMabel } = await import("./tess-image.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t = type as import("./tess-image.server").TessImageType;
  let tessReference: Blob | null = null;
  if (includesTess(t)) {
    const { data, error } = await supabaseAdmin.storage.from("tess-reference").download("canonical.jpg");
    if (error || !data) throw new Error("canonical reference unavailable");
    tessReference = data;
  }
  // Mabel's canonical reference is optional — a missing file must never break a reply.
  let mabelReference: Blob | null = null;
  if (sceneHasMabel(scene)) {
    const { data } = await supabaseAdmin.storage.from("tess-reference").download("mabel.jpg");
    mabelReference = data ?? null;
  }
  const provider = lovableGatewayProvider(apiKey);
  const img = await generateTessImage({ provider, tessReference, mabelReference, type: t, scene, expression, style });
  const path = `${userId}/${crypto.randomUUID()}.png`;
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
  };
}

async function removeUserPhotos(supabase: Sb, userId: string) {
  const { data } = await supabase.storage.from("tess-photos").list(userId, { limit: 1000 });
  if (data?.length) await supabase.storage.from("tess-photos").remove(data.map((f) => `${userId}/${f.name}`));
}

async function runTurn(
  supabase: Sb,
  userId: string,
  tz: string,
  initiation?: { gapHours: number; reason?: string | null },
) {
  const { generateTessReply } = await import("./tess.server");
  const conv = await loadConversation(supabase, userId);
  if (!conv) throw new Error("No conversation");
  const nowIso = new Date().toISOString();

  // Tess hadn't actually "sent" pending replies yet — let her reconsider with the new context.
  if (!initiation) {
    await supabase.from("messages").delete().eq("conversation_id", conv.id).eq("sender", "tess").gt("visible_at", nowIso);
  }

  const [{ data: stateRow }, { data: msgs }, { data: mems }, { data: recentGen }] = await Promise.all([
    supabase.from("tess_state").select("*").eq("conversation_id", conv.id).single(),
    supabase
      .from("messages")
      .select("sender, body, created_at, metadata")
      .eq("conversation_id", conv.id)
      .lte("visible_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("memories")
      .select("summary, memory_type")
      .eq("conversation_id", conv.id)
      .order("importance", { ascending: false })
      .limit(15),
    supabase
      .from("generated_images")
      .select("pose_type, camera_angle, crop_type, hairstyle, expression, clothing_category, setting, selfie_type")
      .eq("conversation_id", conv.id)
      .eq("includes_tess", true)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const recentStyles = (recentGen ?? []) as PhotoStyle[];

  const state = pickState(stateRow ?? {});
  const difficulty = (conv.difficulty as Difficulty) ?? "realistic";
  const recent = msgs ?? [];
  const sentPhotos = new Set(
    recent.map((m) => (m.metadata as { photo?: string } | null)?.photo).filter(Boolean) as string[],
  );
  const freq = ((conv as { photo_frequency?: string }).photo_frequency ?? "normal") as PhotoFrequency;
  const rules = FREQUENCY_RULES[freq] ?? FREQUENCY_RULES.normal;
  const hasPhoto = (m: { metadata: unknown }) => {
    const md = m.metadata as { photo?: string; generated_image_id?: string } | null;
    return !!(md?.photo || md?.generated_image_id);
  };
  // Cooldown counts Tess's own messages since her last photo (no fixed "every N" pattern: model + chance decide).
  const tessRecent = recent.filter((m) => m.sender === "tess").slice(0, rules.cooldown);
  const recentlySentPhoto = tessRecent.some(hasPhoto);
  const photos = recentlySentPhoto
    ? []
    : eligiblePhotos(state, { irritation: state.irritation >= 20 }).filter((p) => !sentPhotos.has(p.id));
  const generateTypes = recentlySentPhoto ? [] : allowedGeneratedTypes(state);

  // Fictional-world context: schedule, rotating life event, regional weather.
  const now = new Date();
  const { getWeatherContext } = await import("./tess-weather.server");
  const weather = await getWeatherContext();
  const lifeEvent: LifeEvent | null = activeLifeEvent(
    now,
    weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined,
  );
  const flavor = weather ? weatherFlavor(weather) : null;

  const reply = await generateTessReply({
    state,
    stage: deriveStage(state),
    difficulty,
    messages: [...recent].reverse().map((m) => ({
      ...m,
      body: (() => {
        const md = m.metadata as { photo?: string; generated_path?: string } | null;
        if (md?.photo) return `[sent a photo: ${md.photo}] ${m.body}`;
        if (md?.generated_path) return `[sent a photo she just took] ${m.body}`;
        return m.body;
      })(),
    })),
    photos,
    generateTypes,
    photoFrequency: freq,
    recentPhotoStyles: recentStyles.map(describeStyle),
    memories: (mems ?? []).map((m: { memory_type: string; summary: string }) => `${m.memory_type}: ${m.summary}`),
    tz,
    initiation,
    weather,
    weatherFlavor: flavor,
    lifeEvent,
    initiationReason: initiation?.reason ?? null,
  });

  const delta = sanitizeDelta(reply.state_delta, difficulty);
  const next = applyDelta(state, delta);
  const stage = deriveStage(next);

  await supabase
    .from("tess_state")
    .update({ ...next, last_delta: { ...delta, tags: reply.event_tags }, last_tone: reply.tone, updated_at: nowIso })
    .eq("conversation_id", conv.id);
  await supabase.from("conversations").update({ relationship_stage: stage, updated_at: nowIso }).eq("id", conv.id);

  // --- Photo: curated first, then optional generation, else none. Failures stay invisible.
  let photo: string | null = null;
  let generated: Awaited<ReturnType<typeof createGeneratedPhoto>> | null = null;
  const p = reply.photo;
  if (p?.action === "fixed" && p.asset_id && photos.some((x) => x.id === p.asset_id)) {
    photo = p.asset_id;
  } else if (p?.action === "generate" && p.type && p.scene && generateTypes.includes(p.type) && Math.random() < rules.generateChance) {
    try {
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
      const style = varyStyle(rawStyle, recentStyles);
      generated = await createGeneratedPhoto(supabase, userId, p.type, p.scene, style.expression ?? p.expression, style);
    } catch (e) {
      console.error("tess photo generation failed", e);
      photo = curatedFallback(p.scene, photos);
    }
  }
  const bubbles = reply.messages.map((b) => b.trim()).filter(Boolean).slice(0, 3);
  if ((photo || generated) && !bubbles.length) bubbles.push("");

  // Latency: practice mode keeps the 3s–4min delay; Real-Time Mode follows her schedule.
  const realTime = !!(conv as { real_time_mode?: boolean }).real_time_mode;
  const lastUserMsg = recent.find((m) => m.sender === "user");
  const activelyChatting = !!lastUserMsg && Date.now() - new Date(lastUserMsg.created_at).getTime() < 5 * 60_000;
  const latency = initiation
    ? { seconds: 3 as number | null, reason: "initiation — no reply delay" }
    : decideLatency(
        {
          realTimeMode: realTime,
          schedule: scheduleFor(now, difficulty === "chaos" ? 2 : 1),
          lifeEvent,
          state,
          activelyChatting,
          baseSeconds: reply.send_delay_seconds,
        },
      );
  if (latency.seconds === null) {
    // Real-Time Mode sleep boundary: she'll see it in the morning. No fake reply.
    return { count: 0, lastVisibleAt: null, sleep: true, latencyReason: latency.reason };
  }
  // Practice delays stay 3s–4min; real-time delays may run longer (work, events).
  const delaySec = realTime ? Math.min(3600, Math.max(3, latency.seconds)) : clampDelaySeconds(latency.seconds);
  let at = Date.now() + delaySec * 1000;
  const rows = bubbles.map((body, i) => {
    if (i > 0) at += 1500 + Math.min(body.length * 60, 6000);
    return {
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
        latency: latency.reason,
        ...(photo && i === 0 ? { photo } : {}),
        ...(generated && i === 0 ? { generated_path: generated.path } : {}),
      },
    };
  });
  if (rows.length) {
    const { data: inserted } = await supabase.from("messages").insert(rows).select("id");
    if (generated && inserted?.[0]) {
      const { data: img } = await supabase
        .from("generated_images")
        .insert({
          conversation_id: conv.id,
          message_id: inserted[0].id,
          user_id: userId,
          photo_type: generated.type,
          scene: generated.scene,
          includes_tess: generated.tess,
          is_selfie: generated.selfie,
          relationship_stage: stage,
          state_snapshot: next,
          provider: generated.provider,
          model: generated.model,
          storage_path: generated.path,
          pose_type: generated.style?.pose_type ?? null,
          camera_angle: generated.style?.camera_angle ?? null,
          crop_type: generated.style?.crop_type ?? null,
          hairstyle: generated.style?.hairstyle ?? null,
          expression: generated.style?.expression ?? null,
          clothing_category: generated.style?.clothing_category ?? null,
          setting: generated.style?.setting ?? null,
          selfie_type: generated.style?.selfie_type ?? null,
          identity_reference_used: generated.identityReferenceUsed,
        })
        .select("id")
        .single();
      if (img) {
        await supabase
          .from("messages")
          .update({ metadata: { ...rows[0]!.metadata, generated_image_id: img.id } })
          .eq("id", inserted[0].id);
      }
    }
  }

  const memRows = reply.memory_candidates
    .filter((m) => m.summary?.trim())
    .slice(0, 3)
    .map((m) => ({
      conversation_id: conv.id,
      user_id: userId,
      memory_type: m.memory_type || "fact",
      summary: m.summary.slice(0, 300),
      importance: Math.min(5, Math.max(1, Math.round(m.importance || 3))),
    }));
  if (memRows.length) await supabase.from("memories").insert(memRows);

  return { count: rows.length, lastVisibleAt: rows.length ? rows[rows.length - 1]!.visible_at : null };
}

export const tessRespond = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => runTurn(context.supabase, context.userId, data.tz));

export const tessMaybeInitiate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conv = await loadConversation(supabase, userId);
    if (!conv) return { count: 0 };
    const now = new Date();
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
    if (!last) return { count: 0 };
    const gapHours = (Date.now() - new Date(last.created_at).getTime()) / 3_600_000;

    const state = pickState(stateRow ?? {});
    const { getWeatherContext } = await import("./tess-weather.server");
    const weather = await getWeatherContext();
    const lifeEvent = activeLifeEvent(
      now,
      weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined,
    );
    const schedule = scheduleFor(now, conv.difficulty === "chaos" ? 2 : 1);

    // Who's been carrying the conversation lately?
    const list = (recentMsgs ?? []).filter((m) => m.sender === "user" || m.sender === "tess");
    const userCount = list.filter((m) => m.sender === "user").length;
    const tessCount = list.filter((m) => m.sender === "tess").length;
    const userCarrying = userCount > tessCount * 1.6 && userCount >= 5;

    // A plausible reason makes initiation natural: weather hook, life event,
    // or a callback-worthy memory. Weather alone never triggers — it only
    // supplies the reason once the engine already considers her eligible.
    const flavor = weather ? weatherFlavor(weather) : null;
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
    if (!decision.initiate) return { count: 0 };

    const reason = lifeEvent?.summary ?? flavor ?? null;
    const result = await runTurn(supabase, userId, data.tz, { gapHours, reason });
    if (result.count > 0) {
      await supabase
        .from("tess_life")
        .update({ last_initiated_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("conversation_id", conv.id);
    }
    return result;
  });

export const runDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tz: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateDebrief } = await import("./tess.server");
    const conv = await loadConversation(supabase, userId);
    if (!conv) throw new Error("No conversation");
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
    const state = pickState(stateRow ?? {});
    const analysis = await generateDebrief({ messages: list, tz: data.tz, stage: deriveStage(state), state });
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
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await removeUserPhotos(supabase, userId);
    await supabase.from("conversations").delete().eq("user_id", userId);
    await seedConversation(supabase, userId);
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
        difficulty: z.enum(DIFFICULTIES).optional(),
        typing_indicator: z.boolean().optional(),
        read_receipts: z.boolean().optional(),
        show_sim_data: z.boolean().optional(),
        photo_frequency: z.enum(["rare", "normal", "frequent"]).optional(),
        real_time_mode: z.boolean().optional(),
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
    await context.supabase.from("conversations").update(patch).eq("user_id", context.userId);
    return { ok: true };
  });

/** Everything the hidden debug screen needs, computed server-side. */
export const debugSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const conv = await loadConversation(supabase, userId);
    if (!conv) throw new Error("No conversation");
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
        .select("sender, metadata")
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
    const state = pickState(stateRow ?? {});
    const { getWeatherContext } = await import("./tess-weather.server");
    const weather = await getWeatherContext();
    const lifeEvent = activeLifeEvent(
      now,
      weather ? { snowing: weather.snowing, rain: weather.rain, alert: !!weather.weather_alert } : undefined,
    );
    const schedule = scheduleFor(now, conv.difficulty === "chaos" ? 2 : 1);
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
    });
    const freq = ((conv as { photo_frequency?: string }).photo_frequency ?? "normal") as PhotoFrequency;
    const rules = FREQUENCY_RULES[freq] ?? FREQUENCY_RULES.normal;
    const hasPhoto = (m: { metadata: unknown }) => {
      const md = m.metadata as { photo?: string; generated_image_id?: string } | null;
      return !!(md?.photo || md?.generated_image_id);
    };
    const recentlySentPhoto = list
      .filter((m) => m.sender === "tess")
      .slice(0, rules.cooldown)
      .some(hasPhoto);
    const curatedCount = recentlySentPhoto ? 0 : eligiblePhotos(state, { irritation: state.irritation >= 20 }).length;
    const genTypes = recentlySentPhoto ? [] : allowedGeneratedTypes(state);
    const lastLatency = (last?.metadata as { latency?: string } | null)?.latency ?? null;
    return {
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
        lastCheck: (life?.last_initiation ?? null) as Record<string, unknown> | null,
        lastInitiatedAt: life?.last_initiated_at ?? null,
      },
      photo: {
        eligible: !recentlySentPhoto && (curatedCount > 0 || genTypes.length > 0),
        reason: recentlySentPhoto
          ? `cooldown — she sent a photo within her last ${rules.cooldown} messages`
          : state.irritation >= 40
            ? `irritation ${state.irritation} — no photos while annoyed`
            : state.irritation >= 20
              ? `irritation ${state.irritation} — selfies suppressed, context photos only`
              : `${curatedCount} curated + generated types [${genTypes.join(", ") || "none"}] available`,
        curatedCount,
        generatedTypes: genTypes,
      },
      latencyReason: lastLatency,
      recentMemories: mems ?? [],
    };
  });
