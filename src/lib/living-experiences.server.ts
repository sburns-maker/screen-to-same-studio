import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { characterFor, CHARACTERS } from "./characters";
import {
  STATE_KEYS,
  deriveStage,
  sanitizeDelta,
  type TessState,
  type Difficulty,
} from "./tess-logic";
import { recallMemories } from "./memory-recall";
import { continuityContext, reserveWorldAi } from "./world-runtime.server";
import { knowledgeForCharacter } from "./social.server";
import { knowledgePromptLines } from "./social-logic";
import { storylineContext } from "./storyline.server";
import {
  automaticSceneSafe,
  experienceClock,
  experienceInstructions,
  type ExperienceRow,
  type ExperienceOperation,
  type ExperiencePlan,
} from "./living-experiences";
import { calendarScheduleAllows, calendarContext } from "./interactive-world.server";
import { photoActionId } from "./photo-delivery.server";
type Client = SupabaseClient<Database>;
export async function experienceReady(db: Client) {
  if (process.env["LIVING_EXPERIENCES_ENABLED"] !== "true") return false;
  const r = await db.rpc("experience_status");
  return !r.error && r.data === 26;
}
export async function experienceSeed(db: Client, user: string, now = new Date()) {
  if (!(await experienceReady(db))) return false;
  const r = await db.rpc("experience_seed", { p_user: user, p_now: now.toISOString() });
  if (r.error) throw new Error("Experience setup unavailable");
  return true;
}
export async function livingSnapshot(db: Client, user: string, now = new Date()) {
  if (!(await experienceSeed(db, user, now)))
    return { available: false, plans: [] as ExperiencePlan[], scenes: [] as ExperienceRow[] };
  const [p, e] = await Promise.all([
    db
      .from("social_plans")
      .select(
        "id,user_id,title,starts_at,ends_at,place_key,organizer,conversation_id,category,status",
      )
      .eq("user_id", user)
      .in("status", ["accepted", "in_progress", "completed"])
      .order("starts_at", { ascending: false })
      .limit(100),
    db
      .from("living_experiences")
      .select("*")
      .eq("user_id", user)
      .order("start_at", { ascending: false })
      .limit(100),
  ]);
  if (p.error || e.error) throw new Error("Experience history unavailable");
  return { available: true, plans: (p.data ?? []) as ExperiencePlan[], scenes: e.data ?? [] };
}
export async function livingHistory(db: Client, user: string, plan: string) {
  const e = await db
    .from("living_experiences")
    .select("*")
    .eq("user_id", user)
    .eq("plan_id", plan)
    .maybeSingle();
  if (e.error || !e.data) throw new Error("Experience unavailable");
  const m = await db
    .from("living_experience_moments")
    .select("*")
    .eq("user_id", user)
    .eq("experience_id", e.data.id)
    .order("ordinal")
    .limit(200);
  const o = await db
    .from("experience_operations")
    .select("id,kind,body,status,lease_until,attempts")
    .eq("user_id", user)
    .eq("experience_id", e.data.id)
    .in("status", ["running", "failed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (m.error || o.error) throw new Error("Experience history unavailable");
  return {
    scene: e.data,
    moments: m.data ?? [],
    pending: e.data.state === "completed" ? null : (o.data?.[0] ?? null),
  };
}
export async function experienceCommand(
  db: Client,
  user: string,
  plan: string,
  id: string,
  command: string,
  revision: number | null,
  payload: Json = {},
  now = new Date(),
) {
  const r = await db.rpc("experience_command", {
    p_user: user,
    p_plan: plan,
    p_id: id,
    p_command: command,
    p_revision: revision as number,
    p_payload: payload,
    p_now: now.toISOString(),
  });
  if (r.error)
    throw new Error(
      r.error.message.includes("limit")
        ? "Experience usage or retry limit reached. Recorded progress is safe."
        : "Experience changed or is unavailable. Refresh before retrying.",
    );
  return r.data as unknown as {
    experience: ExperienceRow;
    operation: ExperienceOperation | null;
    done?: boolean;
  };
}
export async function generateExperience(
  db: Client,
  user: string,
  plan: string,
  id: string,
  kind: "turn" | "finish" | "automatic",
  body: string,
  revision: number | null,
  explicit = false,
  now = new Date(),
) {
  if (!(await experienceSeed(db, user, now))) throw new Error("Living Experiences are not enabled");
  const p = await db
    .from("social_plans")
    .select("*")
    .eq("user_id", user)
    .eq("id", plan)
    .maybeSingle();
  if (p.error || !p.data || !p.data.conversation_id || !(p.data.organizer in CHARACTERS))
    throw new Error("This plan has no supported character");
  // Check against the scheduled fictional appointment, never against the late phone-open time.
  const old = await livingHistory(db, user, plan);
  if (
    old.scene.state === "scheduled" &&
    !calendarScheduleAllows(
      p.data.organizer,
      p.data.date_local,
      p.data.time_local,
      p.data.place_key,
    )
  ) {
    await experienceCommand(db, user, plan, id, "eligibility_fail", old.scene.revision, {}, now);
    throw new Error(
      "The scheduled activity conflicts with character availability; resolve the plan first",
    );
  }
  if (kind === "turn" && old.moments.reduce((n, m) => n + m.body.length, 0) > 50000)
    throw new Error(
      "This outing has reached its scene limit. Finish here or finish the remaining portion automatically; all recorded choices are preserved.",
    );
  const reserved = await experienceCommand(
    db,
    user,
    plan,
    id,
    kind,
    revision,
    { body, explicit },
    now,
  );
  if (reserved.done) return reserved;
  const job = reserved.operation;
  if (!job) throw new Error("Scene reservation unavailable; refresh before retrying.");
  let phase = "context";
  try {
    if (kind === "automatic" && !(await reserveWorldAi(db, user)))
      throw new Error("Autonomous budget unavailable");
    const { scene, moments } = await livingHistory(db, user, plan);
    const def = characterFor(p.data.organizer),
      conv = p.data.conversation_id;
    const [stateR, conversation, mem, prior, world, story, continuity, calendar, place] =
      await Promise.all([
        db.from("tess_state").select("*").eq("user_id", user).eq("conversation_id", conv).single(),
        db.from("conversations").select("*").eq("user_id", user).eq("id", conv).single(),
        db
          .from("memories")
          .select("summary,memory_type,importance,created_at")
          .eq("user_id", user)
          .eq("conversation_id", conv)
          .order("created_at", { ascending: false })
          .limit(1000),
        db
          .from("messages")
          .select("sender,body,created_at")
          .eq("user_id", user)
          .eq("conversation_id", conv)
          .lte("visible_at", now.toISOString())
          .order("created_at", { ascending: false })
          .limit(30),
        knowledgeForCharacter(db, user, def.key),
        storylineContext(db, user, def.key, new Date(scene.start_at)),
        continuityContext(db, user, conv, new Date(scene.start_at)),
        calendarContext(db, user, conv, def.key, new Date(scene.start_at)),
        db
          .from("world_places")
          .select("label,metadata")
          .eq("user_id", user)
          .eq("key", p.data.place_key!)
          .maybeSingle(),
      ]);
    if (
      stateR.error ||
      conversation.error ||
      mem.error ||
      prior.error ||
      place.error ||
      !place.data
    )
      throw new Error("Character context unavailable");
    const state = Object.fromEntries(
      STATE_KEYS.map((k) => [k, stateR.data[k] ?? def.seedState[k]]),
    ) as TessState;
    const difficulty = (conversation.data.difficulty ?? "realistic") as Difficulty;
    const venue = place.data.label;
    const args = {
      state,
      stage: deriveStage(state),
      difficulty,
      messages: [
        ...(prior.data ?? [])
          .slice(0, 10)
          .reverse()
          .map((m) => ({ ...m, body: m.body.slice(0, 600) })),
        ...moments.slice(-4).map((m) => ({
          sender: m.source === "user" ? "user" : "tess",
          body: m.body.slice(0, 300),
          created_at: scene.start_at,
        })),
      ],
      memories: recallMemories(mem.data ?? [], p.data.title + " " + body, now).map(
        (m) => `${m.memory_type}: ${m.summary.slice(0, 300)}`,
      ),
      tz: "America/New_York",
      photos: [],
      generateTypes: [],
      photoFrequency: "off",
      availabilityDetail: `Attending the confirmed ${p.data.title} at ${venue}; use fictional appointment time, not phone-open time.`,
      worldKnowledge: [
        ...calendar.slice(0, 10).map((x) => x.slice(0, 300)),
        ...continuity.lines.slice(0, 10).map((x) => x.slice(0, 300)),
        ...story.lines.slice(0, 4).map((x) => x.slice(0, 300)),
        ...knowledgePromptLines(world, def.preferredName)
          .slice(0, 10)
          .map((x) => x.slice(0, 300)),
        `Authoritative outing: ${p.data.title}; venue ${venue}; scheduled ${scene.start_at}. Venue metadata: ${JSON.stringify(place.data.metadata).slice(0, 2000)}. Never invent completion of other plans.`,
      ],
      experience: {
        at: experienceClock(scene, moments),
        instruction:
          experienceInstructions(kind, p.data.title, venue, moments) +
          (kind === "finish" && body === "close_now"
            ? "\nCLOSE NOW: summarize only the recorded experience. Do not generate additional remaining activities. The user explicitly chose to end here."
            : ""),
      },
    };
    phase = "generation";
    const { generateTessReply, generateContactReply } = await import("./tess.server");
    const reply =
      def.key === "tess"
        ? await generateTessReply(args)
        : await generateContactReply({ ...args, character: def });
    phase = "validation";
    const text = reply.messages
      .join("\n\n")
      .trim()
      .slice(0, kind === "turn" ? 1500 : 3000);
    if (!text) throw new Error("Character did not produce a scene");
    if (kind !== "turn" && body !== "close_now" && !automaticSceneSafe(text))
      throw new Error("Unsafe off-screen outcome");
    const delta = kind === "turn" && body ? sanitizeDelta(reply.state_delta, difficulty) : {};
    // Completion consumes deltas accumulated ONLY from actual interactive turns, never auto attendance.
    phase = "reconciliation";
    const ops = await db
      .from("experience_operations")
      .select("result")
      .eq("user_id", user)
      .eq("experience_id", scene.id)
      .eq("status", "done");
    if (ops.error) throw new Error("Experience reconciliation unavailable");
    const aggregate = Object.fromEntries(
      STATE_KEYS.map((k) => [
        k,
        Math.max(
          -3,
          Math.min(
            3,
            (ops.data ?? []).reduce((n, o) => n + ((o.result as { delta?: Record<string, number> } | null)?.delta?.[k] ?? 0), 0),
          ),
        ),
      ]),
    );
    phase = "commit";
    return await experienceCommand(
      db,
      user,
      plan,
      id,
      "commit",
      null,
      { token: job.token, body: text, delta: (kind === "turn" ? delta : aggregate) as Json },
      now,
    );
  } catch (error) {
    const knownReasons = [
      "Character context unavailable", "Character AI is not configured", "Character AI is paused",
      "Character AI context limit reached", "Character AI capacity limit reached; try later",
      "Character AI is temporarily unavailable; please try again later",
      "Character AI access unavailable (402)", "Character AI access unavailable (403)",
      "Character did not produce a scene", "Unsafe off-screen outcome",
      "Experience reconciliation unavailable", "Autonomous budget unavailable",
    ];
    const reason = error instanceof Error && knownReasons.includes(error.message)
      ? error.message : "Scene step failed";
    // Never log prompts, transcripts, provider bodies, headers or arbitrary errors.
    console.warn("[living-experience]", { operationId: id, phase, reason });
    await experienceCommand(db, user, plan, id, "fail", null, { token: job.token }, now).catch(
      () => undefined,
    );
    throw new Error(
      "The scene could not be generated. Your recorded progress is safe; retry this action." +
        (reason.startsWith("Character AI") ? ` ${reason}` : ""),
    );
  }
}
export async function runExperienceTick(db: Client, user: string, now = new Date()) {
  if (!(await experienceSeed(db, user, now))) return 0;
  const r = await db.rpc("experience_candidates", { p_user: user, p_now: now.toISOString() });
  if (r.error) throw new Error("Experience worker unavailable");
  for (const e of (r.data ?? []) as ExperienceRow[]) {
    const pending = await db
      .from("experience_operations")
      .select("id,attempts,status,lease_until")
      .eq("user_id", user)
      .eq("experience_id", e.id)
      .in("status", ["running", "failed"])
      .eq("kind", "automatic")
      .order("created_at", { ascending: false })
      .limit(1);
    if (pending.error) throw new Error("Experience recovery unavailable");
    const op = pending.data?.[0];
    if (
      op &&
      (op.attempts >= 3 || (op.status === "running" && Date.parse(op.lease_until) > now.getTime()))
    )
      continue;
    const id = op?.id ?? (await photoActionId(`${user}:${e.id}:experience-auto`));
    await generateExperience(db, user, e.plan_id, id, "automatic", "", null, false, now);
    return 1;
  }
  return 0;
}
