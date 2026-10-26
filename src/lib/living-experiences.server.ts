import {
  experienceFailure,
  experienceFailureMessage,
  readExperienceFailure,
  type ExperiencePhase,
} from "./experience-failure";
import { experienceActionError } from "./experience-errors";
import { synchronizeScene } from "./experience-scene.server";
import { liveSceneInstructions, sceneContradiction } from "./experience-scene";
import { followupCanStart } from "./calendar-view";
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
      .select("*")
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
  return {
    available: true,
    plans: ((p.data ?? []) as ExperiencePlan[]).map((plan) => ({
      ...plan,
      followupReady: followupCanStart(
        plan,
        (p.data ?? []).find((parent) => parent.id === plan.parent_plan_id),
        e.data?.find((ex) => ex.plan_id === plan.parent_plan_id),
        now,
      ),
    })),
    scenes: (e.data ?? []) as unknown as ExperienceRow[],
  };
}
export async function livingHistory(db: Client, user: string, plan: string) {
  const e = await db
    .from("living_experiences")
    .select("*")
    .eq("user_id", user)
    .eq("plan_id", plan)
    .maybeSingle();
  if (e.error || !e.data) throw new Error("Experience unavailable");
  const moments: import("./living-experiences").ExperienceMoment[] = [];
  for (let offset = 0; offset < 5000; offset += 250) {
    const page = await db
      .from("living_experience_moments")
      .select("*")
      .eq("user_id", user)
      .eq("experience_id", e.data.id)
      .order("ordinal")
      .range(offset, offset + 249);
    if (page.error) throw new Error("Experience history unavailable");
    moments.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 250) break;
    if (offset === 4750)
      throw new Error(
        "Experience history exceeds the safe scene limit; recorded data is preserved",
      );
  }
  const o = await db
    .from("experience_operations")
    .select("id,kind,body,status,lease_until,attempts,result")
    .eq("user_id", user)
    .eq("experience_id", e.data.id)
    .in("status", ["running", "failed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (o.error) throw new Error("Experience history unavailable");
  const pending = o.data?.[0];
  const failure =
    pending?.status === "failed"
      ? readExperienceFailure((pending.result as { failure?: unknown } | null)?.failure)
      : null;
  return {
    scene: e.data as ExperienceRow,
    moments,
    pending:
      e.data.state === "completed" || !pending
        ? null
        : {
            id: pending.id,
            kind: pending.kind,
            body: pending.body,
            status: pending.status,
            lease_until: pending.lease_until,
            attempts: pending.attempts,
            failure,
          },
  };
}
/**
 * Only the owner's explicit Start/End Experience commands may advance a
 * manually saved plan. Restrictive status predicates preserve later manual edits.
 */
export async function syncExperienceCalendarStatus(
  db: Client, user: string, planId: string, status: "in_progress" | "completed",
) {
  const from = status === "in_progress" ? ["accepted"] : ["in_progress", "accepted"];
  const result = await db.from("social_plans")
    .update({ status })
    .eq("user_id", user)
    .eq("id", planId)
    .in("status", from)
    .select("id");
  if (result.error) throw new Error("Experience saved, but calendar status could not be synchronized");
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
  if (r.error) throw new Error(experienceActionError(r.error.message));
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
    !(await (await import("./calendar-coordinator.server")).calendarContractReady(db)) &&
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
  let phase: ExperiencePhase = "scheduling_sync";
  try {
    if (kind === "automatic" && !(await reserveWorldAi(db, user)))
      throw new Error("Autonomous budget unavailable");
    await (
      await import("./calendar-coordinator.server")
    ).syncExperienceScheduling(db, user, plan, now);
    phase = "context";
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
        calendarContext(db, user, conv, def.key, new Date(experienceClock(scene, moments))),
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
    const residentialVenue=(await (await import("./housing.server")).housingSnapshot(db,user)).homes.find(h=>h.key===p.data!.place_key);
    if(residentialVenue)place.data.label=residentialVenue.label;
    const state = Object.fromEntries(
      STATE_KEYS.map((k) => [k, stateR.data[k] ?? def.seedState[k]]),
    ) as TessState;
    const difficulty = (conversation.data.difficulty ?? "realistic") as Difficulty;
    phase = "scene_sync";
    const live = await synchronizeScene(
      db,
      user,
      plan,
      scene,
      moments,
      def.key,
      def.preferredName,
      p.data.place_key!,
      place.data.label,
    );
    const venue = live.current.locationLabel;
    const liveInstructions = liveSceneInstructions(live.current);
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
      availabilityDetail: `${liveInstructions} Use fictional appointment time, not phone-open time.`,
      worldKnowledge: [
        await (await import("./housing.server")).housingContext(db,user,def.key,now),
        ...calendar
          .filter(
            (x) =>
              !x.startsWith(`YOUR CONVERSATION PLAN ${plan}:`) &&
              !x.startsWith(`YOUR PROTECTED EXPERIENCE ${plan}:`),
          )
          .slice(0, 10)
          .map((x) => x.slice(0, 300)),
        ...continuity.lines.slice(0, 10).map((x) => x.slice(0, 300)),
        ...story.lines.slice(0, 4).map((x) => x.slice(0, 300)),
        ...knowledgePromptLines(world, def.preferredName)
          .slice(0, 10)
          .map((x) => x.slice(0, 300)),
        liveInstructions,
        `Calendar provenance ONLY: ${p.data.title} originally began at ${place.data.label}, scheduled ${scene.start_at}. This is not the current physical scene. Never infer completion of another plan from scene movement.`,
      ],
      experience: {
        at: experienceClock(scene, moments),
        instruction:
          experienceInstructions(kind, "the ongoing outing", venue, moments) +
          "\n" +
          liveInstructions +
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
    phase = "schedule_actions";
    const lastUser = moments.filter((m) => m.source === "user").at(-1);
    const scheduleActions =
      kind === "turn"
        ? await (
            await import("./calendar-coordinator.server")
          ).prepareScheduleActions(db, user, conv, reply, now, {
            parentPlanId: plan,
            userSourceId: lastUser?.id ?? "",
            userText: lastUser?.body ?? "",
            sourceKind: "experience",
            clock: new Date(experienceClock(scene, moments)),
          })
        : [];
    phase = "validation";
    const text = reply.messages
      .join("\n\n")
      .trim()
      .slice(0, kind === "turn" ? 1500 : 3000);
    if (!text) throw new Error("Character did not produce a scene");
    if (kind === "turn" && sceneContradiction(live.current, text))
      throw new Error("Scene continuity check failed");
    if (kind !== "turn" && body !== "close_now" && !automaticSceneSafe(text))
      throw new Error("Unsafe off-screen outcome");
    const delta = kind === "turn" && body ? sanitizeDelta(reply.state_delta, difficulty) : {};
    // Completion consumes deltas accumulated ONLY from actual interactive turns, never auto attendance.
    // The reconciliation cap is per completed experience, not per turn: a multi-hour
    // date must not discard every meaningful interaction after the first few turns.
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
          -12,
          Math.min(
            12,
            (ops.data ?? []).reduce(
              (n, o) =>
                n + ((o.result as { delta?: Record<string, number> } | null)?.delta?.[k] ?? 0),
              0,
            ),
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
      {
        token: job.token,
        body: text,
        scheduleActions,
        housingActions: kind === "turn" ? reply.housing_actions ?? [] : [],
        delta: (kind === "turn" ? delta : aggregate) as Json,
      },
      now,
    );
  } catch (error) {
    const failure = experienceFailure(error, phase);
    console.warn("[living-experience]", { operationId: id, ...failure });
    await experienceCommand(db, user, plan, id, "fail", null, { token: job.token }, now).catch(
      () => undefined,
    );
    // Best-effort diagnostics, never ownership or completion. The token/status
    // fence prevents a late failure writer from changing a retried or done job.
    await db
      .from("experience_operations")
      .update({ result: { failure } })
      .eq("user_id", user)
      .eq("experience_id", job.experience_id)
      .eq("id", id)
      .eq("token", job.token)
      .eq("status", "failed")
      .then(
        () => undefined,
        () => undefined,
      );
    throw new Error(`${experienceFailureMessage(failure)} Failure reference: ${id}.`);
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
