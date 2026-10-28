import {calendarResidences} from "@/lib/calendar-residences.server";
import {saveManualCalendar} from "@/lib/manual-calendar.server";
import {resolveDate} from "@/lib/calendar-logic";
// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { housingSnapshotSchema } from "@/lib/housing";
import type { Json } from "@/integrations/supabase/types";
import { readFileSync } from "node:fs";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
const model = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: model.reply,
  generateContactReply: model.reply,
}));
vi.mock("@/lib/tess.functions", () => ({ runTurn: vi.fn() }));
import { registerInteractivePlaces } from "@/lib/interactive-world.server";
import { prepareScheduleActions } from "@/lib/calendar-coordinator.server";
import { syncResidentialUserMessage } from "@/lib/residential-calendar.server";
import {
  experienceSeed,
  experienceCommand,
  generateExperience,
  livingHistory,
} from "@/lib/living-experiences.server";
import {
  housingContext,
  processHousingActions,
  housingSnapshot,
  runHousingTick,
} from "@/lib/housing.server";
import { schedulingAgenda } from "@/lib/scheduling-agenda.server";
let db: Awaited<ReturnType<typeof worldDatabase>>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  conv = "20000000-0000-4000-a000-000000000001";
const now = new Date("2026-10-26T17:00Z"),
  id = () => crypto.randomUUID(),
  client = () => postgresSupabase(db).admin;
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await client().rpc(name as never, args as never);
  if (r.error) throw new Error(r.error.message);
  return r.data as Json;
}
const command = (actor: string, command: string, payload: Record<string, unknown>, action = id()) =>
  rpc("housing_command", {
    p_user: user,
    p_id: action,
    p_actor: actor,
    p_command: command,
    p_payload: payload,
    p_now: now.toISOString(),
  });
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(
    "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$",
  );
  for (const f of [
    "0024_verify_phone_calls",
    "0025_living_experiences",
    "0026_complete_living_experiences",
    "0033_riley_living_experience_guards",
    "0034_experience_retry_recovery",
    "0035_remove_experience_daily_cap",
    "0036_mutual_calendar_confirmation",
    "0037_all_character_calendar_proposers",
    "0038_canonical_scheduling",
    "0039_experience_live_scene",
    "0040_transactional_plan_edits",
    "0041_unregistered_venue_message_recovery",
    "0042_calendar_scene_privileges",
    "0043_verify_migration_catchup",
    "0044_manual_calendar_control",
    "0045_residences_households",
  ])
    await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
  await db.exec(readFileSync("docs/sql/20261024_riley_night_shift.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`TRUNCATE housing_people,housing_receipts,housing_goals,housing_events,housing_action_outbox CASCADE;TRUNCATE world_places CASCADE;TRUNCATE conversations CASCADE;
 INSERT INTO conversations(id,user_id,character_id) SELECT '${conv}','${user}',id FROM characters WHERE key='tess';
 INSERT INTO tess_state(user_id,conversation_id) VALUES('${user}','${conv}');`);
  await rpc("housing_seed", { p_user: user });
  await command("user", "adult_confirmation", { confirmed: true });
  vi.stubEnv("LIVING_EXPERIENCES_ENABLED", "true");
  model.reply.mockReset().mockResolvedValue({
    messages: ["Tess sets the recipe on the counter. “Ready to cook?”"],
    state_delta: { trust: 1 },
    photo: null,
    housing_actions: null,
  });
  await db.exec("UPDATE experience_settings SET enabled=true,installed_at='2026-10-24T00:00Z'");
});
describe("private homes and durable households", () => {
  it("seeds stable homes without rewriting Tess's canon or duplicating on retry", async () => {
    const before = await db.query("SELECT * FROM housing_residences ORDER BY id");
    await rpc("housing_seed", { p_user: user });
    expect((await db.query("SELECT * FROM housing_residences ORDER BY id")).rows).toEqual(
      before.rows,
    );
    expect(
      (
        await db.query(
          "SELECT housing_type,arrangement FROM housing_residences WHERE place_key='home:tess'",
        )
      ).rows[0],
    ).toEqual({ housing_type: "townhouse", arrangement: "renting" });
  });
  it("redacts addresses and hides unrelated residences on the server", async () => {
    await command("user", "set_home", { address: "Example address (fictional)", showExact: false });
    const snap = housingSnapshotSchema.parse(
      await rpc("housing_snapshot", { p_user: user, p_viewer: "user" }),
    );
    expect(snap.homes.some((h) => h.key === "home:tess")).toBe(true);
    expect(snap.homes.some((h) => h.key === "home:claire")).toBe(false);
    const tess = await rpc("housing_snapshot", { p_user: user, p_viewer: "tess" });
    expect(JSON.stringify(tess)).not.toContain("Example address");
    expect(
      (
        await db.query<{ metadata: string }>(
          "SELECT metadata::text FROM world_places WHERE key='home:user'",
        )
      ).rows[0]!.metadata,
    ).not.toContain("Example address");
  });
  it("never changes the player's household without explicit player agreement", async () => {
    // Permanent disclosure keeps the known-home prerequisite independent of the
    // database wall clock; a one-day visit issued at fixture time may have expired.
    await command("user", "disclose", { place: "home:user", viewer: "tess", permission: "address" });
    const p = await command("tess", "propose_move", {
      place: "home:user",
      movers: ["tess", "user"],
      purpose: "roommates",
      startsAt: now.toISOString(),
    });
    await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] });
    expect(await rpc("housing_primary", { p_user: user, p_person: "tess" })).toBe("home:tess");
    await command("user", "respond", {
      proposalId: (p as { proposalId: string }).proposalId,
      version: 0,
      accept: true,
    });
    expect(
      await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] }),
    ).toBe(1);
    expect(await rpc("housing_primary", { p_user: user, p_person: "tess" })).toBe("home:user");
    expect(
      await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] }),
    ).toBe(0);
  });
  it("preserves former homes after a solo move and never rewrites an unrelated plan", async () => {
    const proposal = await command("user", "new_home", {
      label: "My new apartment",
      housingType: "apartment",
      community: "Tyrone",
      movers: ["user"],
      startsAt: now.toISOString(),
    });
    expect((proposal as { status: string }).status).toBe("accepted");
    await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] });
    expect(await rpc("housing_primary", { p_user: user, p_person: "user" })).toContain(
      "residence:",
    );
    expect(
      (await db.query("SELECT count(*)::int n FROM housing_residences WHERE place_key='home:user'"))
        .rows[0],
    ).toEqual({ n: 1 });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM housing_memberships WHERE person_key='user' AND ended_at IS NOT NULL",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
});

async function snapshot(who = "user") {
  return housingSnapshotSchema.parse(
    await rpc("housing_snapshot", { p_user: user, p_viewer: who }),
  );
}
async function message(
  body: string,
  sender = "user",
  metadata: Record<string, unknown> = {},
  at = now,
) {
  const mid = id();
  await db.query(
    "INSERT INTO messages(id,user_id,conversation_id,sender,body,metadata,created_at,visible_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$7)",
    [mid, user, conv, sender, body, JSON.stringify(metadata), at.toISOString()],
  );
  return mid;
}
it("onboards new persistent contacts and supporting people once, preserving existing profiles", async () => {
  await db.query(
    'INSERT INTO town_people(user_id,key,profile) VALUES($1,\'new-friend\',\'{"name":"Robin","age":31}\')',
    [user],
  );
  await rpc("housing_seed", { p_user: user });
  await rpc("housing_seed", { p_user: user });
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM housing_memberships WHERE person_key='new-friend'",
      )
    ).rows[0]?.n,
  ).toBe(1);
  expect((await snapshot()).homes.some((h) => h.key === "home:new-friend")).toBe(false);
});
it("does not respawn a removed player home or delete historical residences", async () => {
  await command("user", "remove_home", { confirmation: "REMOVE MY VIRTUAL HOME" });
  await rpc("housing_seed", { p_user: user });
  expect(await rpc("housing_primary", { p_user: user, p_person: "user" })).toBe(null);
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM housing_residences WHERE place_key='home:user'",
      )
    ).rows[0]?.n,
  ).toBe(1);
});
it("requires invitations independently of knowing an address; revocation prevents private travel", async () => {
  await command("tess", "disclose", { place: "home:tess", viewer: "user", permission: "address" });
  expect((await snapshot()).homes.find((h) => h.key === "home:tess")?.canVisit).toBe(false);
  await expect(
    rpc("town_command", {
      p_user: user,
      p_id: id(),
      p_command: "visit",
      p_payload: { place: "home:tess", minutes: 5 },
      p_now: now.toISOString(),
    }),
  ).rejects.toThrow("invitation required");
  await command("tess", "disclose", { place: "home:tess", viewer: "user", permission: "visit" });
  expect(
    await rpc("housing_can_enter", {
      p_user: user,
      p_place: "home:tess",
      p_viewer: "user",
      p_at: now.toISOString(),
    }),
  ).toBe(true);
  await command("tess", "revoke", { place: "home:tess", viewer: "user", permission: "visit" });
  expect(
    await rpc("housing_can_enter", {
      p_user: user,
      p_place: "home:tess",
      p_viewer: "user",
      p_at: now.toISOString(),
    }),
  ).toBe(false);
});
it("declined moves and stale responses never alter anyone's primary residence", async () => {
  const p = (await command("user", "propose_move", {
    place: "home:tess",
    movers: ["user"],
    purpose: "partners",
    startsAt: now.toISOString(),
  })) as { proposalId: string };
  await command("tess", "respond", { proposalId: p.proposalId, version: 0, accept: false });
  await expect(
    command("user", "respond", { proposalId: p.proposalId, version: 0, accept: true }),
  ).rejects.toThrow("current housing proposal");
  expect(await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] })).toBe(
    0,
  );
  expect(await rpc("housing_primary", { p_user: user, p_person: "user" })).toBe("home:user");
});
it("keeps one primary home while temporary accommodation expires", async () => {
  const p = (await command("user", "propose_move", {
    place: "home:tess",
    movers: ["user"],
    kind: "temporary",
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 3600000).toISOString(),
  })) as { proposalId: string };
  await command("tess", "respond", { proposalId: p.proposalId, version: 0, accept: true });
  await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] });
  expect(
    await rpc("housing_current_home", { p_user: user, p_person: "user", p_now: now.toISOString() }),
  ).toBe("home:tess");
  expect(await rpc("housing_primary", { p_user: user, p_person: "user" })).toBe("home:user");
  await rpc("housing_tick", {
    p_user: user,
    p_now: new Date(now.getTime() + 7200000).toISOString(),
    p_blocked: [],
  });
  expect(
    await rpc("housing_current_home", {
      p_user: user,
      p_person: "user",
      p_now: new Date(now.getTime() + 7200000).toISOString(),
    }),
  ).toBe("home:user");
});
it("detects competing moves without overwriting the first move or duplicating outcomes", async () => {
  const payload = { label: "First home", movers: ["user"], startsAt: now.toISOString() },
    action = id();
  const first = (await command("user", "new_home", payload, action)) as { proposalId: string };
  expect(await command("user", "new_home", payload, action)).toMatchObject({ replayed: true });
  const second = (await command("user", "new_home", {
    ...payload,
    label: "Second home",
    startsAt: new Date(now.getTime() + 3 * 3600000).toISOString(),
  })) as { proposalId: string };
  // Avoid artificial event overlap for the second scheduled move; its stale origin must still fail.
  await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] });
  await rpc("housing_tick", {
    p_user: user,
    p_now: new Date(now.getTime() + 4 * 3600000).toISOString(),
    p_blocked: [],
  });
  expect(
    (
      await db.query<{ status: string }>("SELECT status FROM housing_proposals WHERE id=$1", [
        second.proposalId,
      ])
    ).rows[0]?.status,
  ).toBe("needs_review");
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM housing_memberships WHERE person_key='user' AND kind='primary' AND ended_at IS NULL",
      )
    ).rows[0]?.n,
  ).toBe(1);
  expect(
    (
      await db.query<{ n: number }>("SELECT count(*)::int n FROM shared_events WHERE id=$1", [
        "housing:" + first.proposalId,
      ])
    ).rows[0]?.n,
  ).toBe(1);
});
it("applies only actual visible character housing actions once without inferring player consent", async () => {
  const text = "I'd like a smaller apartment in Tyrone someday.";
  await message(text, "tess", {
    housing_actions: [
      { action: "goal", quote: text, goal: "Consider a smaller apartment in Tyrone" },
    ],
  });
  await processHousingActions(client(), user, now);
  await processHousingActions(client(), user, now);
  expect(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM housing_goals")).rows[0]?.n,
  ).toBe(1);
  await message("Just chatting.", "tess", {
    housing_actions: [
      {
        action: "new_home",
        quote: "I agree to move",
        movers: ["user", "tess"],
        startsAt: now.toISOString(),
      },
    ],
  });
  await processHousingActions(client(), user, now);
  expect(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM housing_proposals")).rows[0]?.n,
  ).toBe(0);
});
it("keeps home access and records isolated across users and database roles", async () => {
  await rpc("housing_seed", { p_user: other });
  const foreign = await db.query<{ id: string }>(
    "SELECT id FROM housing_residences WHERE user_id=$1",
    [other],
  );
  expect((await snapshot()).homes.some((h) => foreign.rows.some((r) => r.id === h.id))).toBe(false);
  const q = await db.query<{ anon: boolean; authenticated: boolean }>(
    "SELECT has_function_privilege('anon','housing_command(uuid,uuid,text,text,jsonb,timestamptz)','execute') anon,has_table_privilege('authenticated','housing_residences','select') authenticated",
  );
  expect(q.rows[0]).toEqual({ anon: false, authenticated: false });
  await db.exec("SET ROLE authenticated");
  try {
    await expect(db.query("SELECT * FROM housing_residences")).rejects.toThrow("permission denied");
  } finally {
    await db.exec("RESET ROLE");
  }
});
it("Tess cooking agreement confirms the existing plan, enters My Home and completes one shared memory", async () => {
  await registerInteractivePlaces(client(), user);
  const proposed = await message(
    "Want to cook dinner together Wednesday at 6:30 PM at your home? I'll bring a recipe.",
    "tess",
  );
  const { schedulePayload } = await import("@/lib/calendar-coordinator.server");
  const draft = await schedulePayload(
    client(),
    user,
    conv,
    {
      action: "invite",
      title: "Cooking together",
      category: "dinner",
      date: "2026-10-28",
      time: "18:30",
      place: "home:user",
      durationMinutes: 90,
    },
    now,
  );
  const created = (await rpc("calendar_event_action", {
    p_user: user,
    p_kind: "message",
    p_source: proposed,
    p_ordinal: 1,
    p_payload: draft,
    p_now: now.toISOString(),
  })) as { id: string };
  const acceptance = await message(
    "Absolutely. I'll provide the ingredients.",
    "user",
    {},
    new Date(now.getTime() + 1000),
  );
  await syncResidentialUserMessage(
    client(),
    user,
    conv,
    acceptance,
    new Date(now.getTime() + 2000),
  );
  await syncResidentialUserMessage(
    client(),
    user,
    conv,
    acceptance,
    new Date(now.getTime() + 2000),
  );
  const plans = await db.query<{ id: string; status: string; place_key: string }>(
    "SELECT id,status,place_key FROM social_plans WHERE origin='conversation'",
  );
  expect(plans.rows).toEqual([{ id: created.id, status: "accepted", place_key: "home:user" }]);
  expect(
    (await schedulingAgenda(client(), user, now)).events.find((p) => p.id === created.id)
      ?.venueLabel,
  ).toBe("My Home");
  const at = new Date("2026-10-28T22:30Z");
  await experienceSeed(client(), user, at);
  await experienceCommand(client(), user, created.id, id(), "claim", null, {}, at);
  await generateExperience(
    client(),
    user,
    created.id,
    id(),
    "turn",
    "I set out the ingredients and start cooking.",
    null,
    false,
    at,
  );
  expect((await livingHistory(client(), user, created.id)).scene.live_scene).toMatchObject({
    locationKey: "home:user",
    locationKind: "home",
    activity: "cooking",
  });
  expect(model.reply.mock.calls.at(-1)?.[0].worldKnowledge.join(" ")).toContain(
    "PRIVATE HOUSING CONTEXT",
  );
  await generateExperience(
    client(),
    user,
    created.id,
    id(),
    "finish",
    "close_now",
    null,
    false,
    at,
  );
  expect(
    (
      await db.query<{ status: string }>("SELECT status FROM social_plans WHERE id=$1", [
        created.id,
      ])
    ).rows[0]?.status,
  ).toBe("completed");
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM memories WHERE summary LIKE '[Completed in-person experience]%'",
      )
    ).rows[0]?.n,
  ).toBe(1);
});
it("does not re-enable public calendar sweeps or accept unrelated home venues", async () => {
  const action = {
    action: "invite" as const,
    planId: null,
    parentPlanId: null,
    title: "Coffee",
    description: null,
    category: "coffee" as const,
    date: "2026-10-28",
    time: "18:30",
    timeHint: null,
    timeZone: null,
    place: "coffee:local",
    durationMinutes: null,
    userQuote: null,
  };
  expect(
    await prepareScheduleActions(
      client(),
      user,
      conv,
      { messages: ["Want coffee Wednesday?"], schedule_actions: [action] },
      now,
    ),
  ).toEqual([]);
  expect(await rpc("calendar_pending", { p_user: user, p_now: now.toISOString() })).toEqual([]);
  const source = await message("Let's visit Claire's house.");
  await expect(
    rpc("calendar_event_action", {
      p_user: user,
      p_kind: "message",
      p_source: source,
      p_ordinal: 0,
      p_payload: { action: "invite", title: "Visit", category: "meetup", place: "home:claire" },
      p_now: now.toISOString(),
    }),
  ).rejects.toThrow("authorized residence");
});

it("requires explicit adult eligibility for shared housing without blocking solo homes", async () => {
  await command("user", "adult_confirmation", { confirmed: false });
  const proposal = (await command("user", "propose_move", {
    place: "home:tess",
    movers: ["user"],
    purpose: "partners",
    startsAt: now.toISOString(),
  })) as { proposalId: string; status: string };
  expect(proposal.status).toBe("needs_review");
  await expect(
    command("tess", "respond", { proposalId: proposal.proposalId, version: 0, accept: true }),
  ).rejects.toThrow("closed or needs review");
  expect(
    (
      (await command("user", "new_home", {
        movers: ["user"],
        startsAt: new Date(now.getTime() + 3 * 3600000).toISOString(),
      })) as { status: string }
    ).status,
  ).toBe("accepted");
});
it("cancels a housing event in place and a breakup never evicts residents", async () => {
  const p = (await command("user", "propose_move", {
    place: "home:tess",
    movers: ["user"],
    startsAt: now.toISOString(),
  })) as { proposalId: string; planId: string };
  await command("user", "cancel", { proposalId: p.proposalId, version: 0 });
  expect(
    (await db.query<{ status: string }>("SELECT status FROM social_plans WHERE id=$1", [p.planId]))
      .rows[0]?.status,
  ).toBe("cancelled");
  await db.query(
    "UPDATE tess_state SET romantic_intent=0,romantic_attraction=0 WHERE conversation_id=$1",
    [conv],
  );
  expect(await rpc("housing_primary", { p_user: user, p_person: "tess" })).toBe("home:tess");
});
it("records home activities and uses the same virtual travel rather than teleporting", async () => {
  await rpc("town_command", {
    p_user: user,
    p_id: id(),
    p_command: "visit",
    p_payload: { place: "home:user", minutes: 5 },
    p_now: now.toISOString(),
  });
  await expect(
    rpc("venue_act", {
      p_user: user,
      p_id: id(),
      p_place: "home:user",
      p_action: "cook",
      p_detail: "Preparing dinner",
      p_now: now.toISOString(),
    }),
  ).rejects.toThrow("Arrive before");
  const at = new Date(now.getTime() + 5 * 60000);
  await rpc("venue_act", {
    p_user: user,
    p_id: id(),
    p_place: "home:user",
    p_action: "cook",
    p_detail: "Preparing dinner",
    p_now: at.toISOString(),
  });
  expect(
    (
      await db.query<{ activity: string }>(
        "SELECT state->>'last_activity' activity FROM venue_sessions",
      )
    ).rows[0]?.activity,
  ).toBe("cook");
});
it("protects paused outings from moves in the actual world-worker adapter", async () => {
  await registerInteractivePlaces(client(), user);
  const plan = id();
  await db.query(
    "INSERT INTO social_plans(user_id,id,organizer,title,place_key,starts_at,ends_at,status,origin,conversation_id,category,user_response,character_response) VALUES($1,$2,'tess','Coffee','coffee:local',$3::timestamptz,$3::timestamptz+interval '1 hour','accepted','conversation',$4,'coffee','accepted','accepted')",
    [user, plan, now.toISOString(), conv],
  );
  await experienceSeed(client(), user, now);
  await experienceCommand(client(), user, plan, id(), "claim", null, {}, now);
  await experienceCommand(client(), user, plan, id(), "pause", null, {}, now);
  await command("user", "new_home", {
    movers: ["user"],
    startsAt: new Date(now.getTime() + 3 * 3600000).toISOString(),
  });
  await runHousingTick(client(), user, new Date(now.getTime() + 4 * 3600000));
  expect(await rpc("housing_primary", { p_user: user, p_person: "user" })).toBe("home:user");
});
it("never exposes a configured address to a future housemate before disclosure", async () => {
  await command("user", "set_home", { address: "Imaginary 17 Example Lane", showExact: true });
  const p = (await command("user", "propose_move", {
    place: "home:user",
    movers: ["user", "tess"],
    startsAt: now.toISOString(),
  })) as { proposalId: string };
  const before = await snapshot("tess");
  expect(JSON.stringify(before)).not.toContain("Imaginary 17 Example Lane");
  await command("tess", "respond", { proposalId: p.proposalId, version: 0, accept: true });
  await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] });
  expect(await housingContext(client(), user, "tess", now)).toContain("household");
});

it("queues a persistent town character's housing decision in the existing NPC delivery transaction", async () => {
  const { initializeTown } = await import("@/lib/town.server");
  await initializeTown(client(), user);
  await db.query(
    "INSERT INTO town_connections(user_id,npc_key) VALUES($1,'rowan-ellis') ON CONFLICT DO NOTHING",
    [user],
  );
  await db.query(
    "INSERT INTO town_presence(user_id,place_key,arrives_at) VALUES($1,'coffee:local',$2) ON CONFLICT(user_id) DO UPDATE SET place_key=excluded.place_key,arrives_at=excluded.arrives_at",
    [user, now.toISOString()],
  );
  const action = id();
  await rpc("town_command", {
    p_user: user,
    p_id: action,
    p_command: "start",
    p_payload: {
      npc: "rowan-ellis",
      text: "How is your apartment?",
      mode: "scene",
      place: "coffee:local",
      daily_limit: 40,
    },
    p_now: now.toISOString(),
  });
  const quote = "I'd like to move to a quieter apartment eventually.";
  await rpc("town_command", {
    p_user: user,
    p_id: action,
    p_command: "finish",
    p_payload: {
      reply: quote,
      contact: false,
      memories: [],
      followup: null,
      housingActions: [{ action: "goal", quote, goal: "Consider a quieter apartment" }],
    },
    p_now: now.toISOString(),
  });
  await processHousingActions(client(), user, new Date(now.getTime() + 1000));
  expect(
    (await db.query<{ person_key: string }>("SELECT person_key FROM housing_goals")).rows[0]
      ?.person_key,
  ).toBe("rowan-ellis");
});

it("a host approves a new housemate without being recorded as moving again", async () => {
  const p = (await command("user", "propose_move", {
    place: "home:user",
    movers: ["user", "tess"],
    startsAt: now.toISOString(),
  })) as { proposalId: string; planId: string };
  await command("tess", "respond", { proposalId: p.proposalId, version: 0, accept: true });
  await rpc("housing_tick", { p_user: user, p_now: now.toISOString(), p_blocked: [] });
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM housing_memberships WHERE person_key='user'",
      )
    ).rows[0]?.n,
  ).toBe(1);
  expect(
    (await schedulingAgenda(client(), user, now)).events
      .find((e) => e.id === p.planId)
      ?.participants.map((p) => p.key),
  ).toEqual(expect.arrayContaining(["user", "tess"]));
  await expect(
    rpc("shared_world_command", {
      p_user_id: user,
      p_plan_id: p.planId,
      p_command: "cancel",
      p_payload: {},
      p_now: now.toISOString(),
      p_expected_version: 0,
    }),
  ).rejects.toThrow("calendar lifecycle");
});

it("encourages ordinary home initiative without a score threshold or automatic cohabitation", async () => {
  const context = await housingContext(client(), user, "tess", now);
  expect(context).toContain("do not need to wait for the player");
  expect(context).toContain("friends can host too");
  expect(context).toContain("playerAtSharedHome describes only the player");
  expect(context).toContain("CURRENT PHYSICAL CONTEXT");
  expect(context).toContain("do not repeat an unanswered offer");
  expect(context).toContain("all necessary consent");
  expect(context).toContain("never an invented street address");
  expect(context).toContain("Never move anyone or accept for the player");
});

it("lists Claire's home and records an explicitly saved movie invitation without leaking an address or duplicating plans",async()=>{
  const claire=id();
  await db.query("INSERT INTO conversations(id,user_id,character_id) SELECT $1,$2,id FROM characters WHERE key='claire'",[claire,user]);
  await rpc("housing_seed",{p_user:user});
  const at=new Date(Date.now()+2000),created=new Date(at.getTime()-1).toISOString(),message=id();
  const before=await calendarResidences(client(),user,at);
  expect(before.find(h=>h.key==='home:claire')).toMatchObject({canPlan:false});
  await db.query("INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'tess',$4,$5,$5)",[message,user,claire,"Would you like to come over to my house for a movie night?",created]);
  const choices=await calendarResidences(client(),user,at);
  expect(choices.find(h=>h.key==='home:claire')).toMatchObject({canPlan:true,characters:['claire']});
  expect((await db.query("SELECT * FROM social_plans WHERE user_id=$1",[user])).rows).toHaveLength(0);
  expect(JSON.stringify(choices)).not.toMatch(/latitude|longitude|address/);
  const action=id(),input={id:action,conversationId:claire,confirmed:true,plan:{action:'invite',planId:null,parentPlanId:null,title:'Movie night',description:null,category:'meetup',date:resolveDate('tomorrow',at),time:'19:00',timeHint:null,timeZone:'America/New_York',place:'home:claire',durationMinutes:120,userQuote:null}};
  const result=await saveManualCalendar(client(),user,input,at);
  expect(result.status).toBe('accepted');
  expect((await db.query<{place_key:string}>("SELECT p.place_key FROM living_experiences e JOIN social_plans p ON p.user_id=e.user_id AND p.id=e.plan_id WHERE e.user_id=$1 AND e.plan_id=$2",[user,result.id])).rows[0]?.place_key).toBe('home:claire');
  const again=await saveManualCalendar(client(),user,input,at);
  expect(again.id).toBe(result.id);
  const saved=(await db.query<{place_key:string;status:string}>("SELECT place_key,status FROM social_plans WHERE user_id=$1",[user])).rows;
  expect(saved).toEqual([{place_key:'home:claire',status:'accepted'}]);
  expect((await db.query("SELECT * FROM messages WHERE user_id=$1",[user])).rows).toHaveLength(1);
  expect((await housingSnapshot(client(),user)).homes.find(h=>h.key==='home:claire')?.exact).toBe(false);
  expect((await db.query("SELECT * FROM housing_events WHERE user_id=$1 AND event_type='move'",[user])).rows).toHaveLength(0);
  // An older unsaved invitation must not reopen a subsequently cancelled visit.
  await db.query("INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'tess','Come over to my house for a movie night.',$4,$4)",[id(),user,claire,new Date(at.getTime()-10).toISOString()]);
  await db.query("UPDATE social_plans SET status='cancelled' WHERE user_id=$1 AND id=$2",[user,result.id]);
  expect((await calendarResidences(client(),user,at)).find(h=>h.key==='home:claire')?.canPlan).toBe(false);
});
it("does not authorize a home from a player's claim, another character's invitation or a hidden message",async()=>{
  const claire=id();
  await db.query("INSERT INTO conversations(id,user_id,character_id) SELECT $1,$2,id FROM characters WHERE key='claire'",[claire,user]);
  await rpc('housing_seed',{p_user:user});
  const at=new Date(Date.now()+2000),clock=new Date(at.getTime()-1).toISOString();
  for(const [conversation,sender,visible] of [[claire,'user',clock],[conv,'tess',clock],[claire,'tess',new Date(at.getTime()+60000).toISOString()]]){
    await db.query("INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,$4,'Come over to my house for a movie night.',$5,$6)",[id(),user,conversation,sender,clock,visible]);
  }
  expect((await calendarResidences(client(),user,at)).find(h=>h.key==='home:claire')?.canPlan).toBe(false);
  await expect(saveManualCalendar(client(),user,{id:id(),conversationId:claire,confirmed:true,plan:{action:'invite',planId:null,parentPlanId:null,title:'Movie night',description:null,category:'meetup',date:resolveDate('tomorrow',at),time:'19:00',timeHint:null,timeZone:'America/New_York',place:'home:claire',durationMinutes:120,userQuote:null}},at)).rejects.toThrow(/invitation/);
});

it("does not turn an earlier invitation into permission after the resident withdraws it",async()=>{
  const at=new Date(Date.now()+3000);
  await db.query("INSERT INTO messages(id,user_id,conversation_id,sender,body,created_at,visible_at) VALUES($1,$2,$3,'tess','Come over to my house for a movie night.',$4,$4),($5,$2,$3,'tess','I cannot host tonight.',$6,$6)",[id(),user,conv,new Date(at.getTime()-1000).toISOString(),id(),new Date(at.getTime()-500).toISOString()]);
  expect((await calendarResidences(client(),user,at)).find(h=>h.key==='home:tess')?.canPlan).toBe(false);
});
