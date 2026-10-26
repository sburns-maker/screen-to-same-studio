import { z } from "zod";
export const housingTypes = [
  "house",
  "apartment",
  "townhouse",
  "shared_residence",
  "private_residence",
] as const;
export const housingArrangements = [
  "renting",
  "owning",
  "family",
  "shared_rent",
  "temporary",
  "other",
] as const;
export const housingHomeSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  kind: z.literal("home"),
  community: z.string(),
  housingType: z.enum(housingTypes),
  arrangement: z.enum(housingArrangements),
  description: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().nullable(),
  exact: z.boolean(),
  canEdit: z.boolean(),
  canVisit: z.boolean(),
  canPlan: z.boolean(),
  primaryFor: z.array(z.string()),
  provisional: z.boolean(),
});
export type HousingHome = z.infer<typeof housingHomeSchema>;
export const housingSnapshotSchema = z.object({
  goals: z.array(z.string()),
  households: z.array(
    z.object({
      id: z.string(),
      arrangement: z.string(),
      pets: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
      dependents: z.array(
        z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      ),
      permissions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      sharedExpenses: z.array(
        z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      ),
    }),
  ),
  adultConfirmed: z.boolean(),
  homes: z.array(housingHomeSchema),
  primary: z.string().nullable(),
  members: z.array(
    z.object({
      person_key: z.string(),
      label: z.string(),
      homeLabel: z.string(),
      residence_id: z.string(),
      kind: z.string(),
      relation: z.string(),
      expires_at: z.string().nullable(),
    }),
  ),
  proposals: z.array(
    z.object({
      id: z.string(),
      plan_id: z.string().nullable(),
      residence_id: z.string(),
      initiator: z.string(),
      movers: z.array(z.string()),
      required: z.array(z.string()),
      responses: z.record(z.string(), z.string()),
      status: z.string(),
      version: z.number(),
      starts_at: z.string().nullable(),
      ends_at: z.string().nullable(),
      purpose: z.string(),
      homeLabel: z.string(),
      community: z.string(),
      kind: z.string(),
    }),
  ),
  history: z.array(
    z.object({
      id: z.string(),
      person: z.string(),
      homeLabel: z.string(),
      community: z.string(),
      kind: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      relation: z.string(),
    }),
  ),
});
export type HousingSnapshot = z.infer<typeof housingSnapshotSchema>;
export const emptyHousing: HousingSnapshot = {
  goals: [],
  households: [],
  adultConfirmed: false,
  homes: [],
  primary: null,
  members: [],
  proposals: [],
  history: [],
};
const details = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  community: z.enum(["Altoona", "Hollidaysburg", "Tyrone", "Duncansville"]).optional(),
  housingType: z.enum(housingTypes).optional(),
  arrangement: z.enum(housingArrangements).optional(),
  description: z.string().max(500).optional(),
  address: z.string().trim().max(160).nullable().optional(),
  showExact: z.boolean().optional(),
  exactLatitude: z.number().min(-90).max(90).nullable().optional(),
  exactLongitude: z.number().min(-180).max(180).nullable().optional(),
});
export const housingInputSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("adult_confirmation"),
    payload: z.object({ confirmed: z.boolean() }),
  }),
  z.object({ command: z.literal("set_home"), payload: details }),
  z.object({
    command: z.literal("remove_home"),
    payload: z.object({ confirmation: z.literal("REMOVE MY VIRTUAL HOME") }),
  }),
  z.object({
    command: z.literal("new_home"),
    payload: details.extend({
      movers: z.array(z.string().max(80)).min(1).max(6),
      startsAt: z.string().datetime({ offset: true }).nullable(),
      endsAt: z.string().datetime({ offset: true }).nullable().optional(),
      kind: z.enum(["move", "temporary"]).default("move"),
      purpose: z.string().max(80).default("individual"),
    }),
  }),
  z.object({
    command: z.literal("propose_move"),
    payload: z.object({
      place: z.string().max(80),
      movers: z.array(z.string().max(80)).min(1).max(6),
      startsAt: z.string().datetime({ offset: true }).nullable(),
      endsAt: z.string().datetime({ offset: true }).nullable().optional(),
      kind: z.enum(["move", "temporary"]).default("move"),
      purpose: z.string().max(80).default("roommates"),
    }),
  }),
  z.object({
    command: z.literal("respond"),
    payload: z.object({
      proposalId: z.string().uuid(),
      version: z.number().int().nonnegative(),
      accept: z.boolean(),
      startsAt: z.string().datetime({ offset: true }).optional(),
    }),
  }),
  z.object({
    command: z.literal("cancel"),
    payload: z.object({ proposalId: z.string().uuid(), version: z.number().int().nonnegative() }),
  }),
  z.object({
    command: z.literal("disclose"),
    payload: z.object({
      place: z.string().max(80),
      viewer: z.string().max(80),
      permission: z.enum(["address", "visit"]),
    }),
  }),
  z.object({
    command: z.literal("revoke"),
    payload: z.object({
      place: z.string().max(80),
      viewer: z.string().max(80),
      permission: z.enum(["address", "visit"]),
    }),
  }),
]);
export type HousingInput = z.input<typeof housingInputSchema>;
export function residencePlace(home: HousingHome) {
  return {
    ...home,
    fictional: true,
    public: false,
    addressStatus: home.exact ? "Fictional address shared" : "Approximate neighborhood only",
    address: home.address ?? undefined,
    activities: ["look", "seat", "wait", "cook", "movie", "games", "chores", "relax"],
    opens: 0,
    closes: 24,
    categories: ["meetup", "dinner", "date"],
    walkIns: false,
    reservations: false,
    accessibleAreas: ["Invited areas only"],
    scene: home.description,
    timezone: "America/New_York",
    open: home.canVisit,
  };
}

/** Flat, nullable contract is compatible with the existing strict structured provider. */
export const housingActionsSchema = z
  .array(
    z.object({
      action: z.enum(["goal", "new_home", "propose_move", "respond", "disclose"]),
      quote: z.string().min(8).max(500),
      place: z.string().max(80).nullable(),
      movers: z.array(z.string().max(80)).max(6).nullable(),
      purpose: z.string().max(80).nullable(),
      startsAt: z.string().datetime({ offset: true }).nullable(),
      endsAt: z.string().datetime({ offset: true }).nullable(),
      kind: z.enum(["move", "temporary"]).nullable(),
      label: z.string().max(100).nullable(),
      community: z.enum(["Altoona", "Hollidaysburg", "Tyrone", "Duncansville"]).nullable(),
      housingType: z.enum(housingTypes).nullable(),
      arrangement: z.enum(housingArrangements).nullable(),
      proposalId: z.string().uuid().nullable(),
      version: z.number().int().min(0).nullable(),
      accept: z.boolean().nullable(),
      viewer: z.string().max(80).nullable(),
      permission: z.enum(["visit", "address"]).nullable(),
      goal: z.string().max(500).nullable(),
    }),
  )
  .max(2)
  .nullable();
export const HOUSING_ACTION_RULES = `HOUSING ACTIONS: housing_actions=null unless available private housing context justifies your own definite visible action. You may record a tentative goal (goal), propose a move to a known home (propose_move), select a new provisional fictional home (new_home), respond to an existing proposal addressed to you (respond with proposalId/version), or explicitly invite someone to visit/share your home details (disclose). Quote exact words from your own current visible message; no inferred player consent or hidden decisions. All unused fields null. movers must include yourself; include the player only as a pending proposal requiring their separate explicit approval. Never manufacture another resident's consent. A high score, marriage, breakup or elapsed time never authorizes a housing change. Do not invent exact finances, addresses, dependents or landlords. A proposal is not a completed move. State your preference naturally rather than claim a database action succeeded. Do not repeat proposals already pending. Ordinary home invitations go through residential schedule_actions, not a move. Do not create a home merely as a reason to message. Your own accepted response to a visible proposal is not acceptance for any other resident.`;

export function housingCommuteMinutes(
  home: { key: string; latitude: number; longitude: number },
  work: { key: string; latitude: number; longitude: number },
) {
  const radians = Math.PI / 180,
    a =
      Math.sin(((work.latitude - home.latitude) * radians) / 2) ** 2 +
      Math.cos(home.latitude * radians) *
        Math.cos(work.latitude * radians) *
        Math.sin(((work.longitude - home.longitude) * radians) / 2) ** 2;
  return home.key === work.key
    ? 0
    : Math.max(
        5,
        Math.min(
          120,
          Math.ceil(((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 35) * 60 + 5),
        ),
      );
}
