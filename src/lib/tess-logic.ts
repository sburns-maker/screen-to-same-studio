export const STATE_KEYS = [
  "comfort",
  "trust",
  "romantic_attraction",
  "physical_attraction",
  "curiosity",
  "emotional_intimacy",
  "perceived_pressure",
  "irritation",
  "respect",
  "playfulness",
  "relationship_momentum",
  "romantic_intent",
] as const;

export type StateKey = (typeof STATE_KEYS)[number];
export type TessState = Record<StateKey, number>;

export const SEED_STATE: TessState = {
  comfort: 42,
  trust: 25,
  romantic_attraction: 24,
  physical_attraction: 34,
  curiosity: 52,
  emotional_intimacy: 10,
  perceived_pressure: 4,
  irritation: 0,
  respect: 44,
  playfulness: 38,
  relationship_momentum: 22,
  romantic_intent: 0,
};

export const DIFFICULTIES = ["easy", "realistic", "ambiguous", "guarded", "chaos"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MAX_DELTA_PER_TURN = 6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** "Bad" dimensions where an increase is negative for the connection. */
const NEGATIVE_KEYS: StateKey[] = ["perceived_pressure", "irritation"];

/** Clamp a raw model delta and apply difficulty scaling. */
export function sanitizeDelta(raw: Partial<Record<StateKey, unknown>>, difficulty: Difficulty): TessState {
  const out = {} as TessState;
  for (const k of STATE_KEYS) {
    let v = Number(raw?.[k] ?? 0);
    if (!Number.isFinite(v)) v = 0;
    v = Math.round(clamp(v, -MAX_DELTA_PER_TURN, MAX_DELTA_PER_TURN));
    const improving = NEGATIVE_KEYS.includes(k) ? v < 0 : v > 0;
    let mult = 1;
    if (difficulty === "easy") mult = improving ? 1.3 : 0.8;
    if (difficulty === "guarded") mult = improving ? 0.6 : 1.3;
    if (difficulty === "chaos") mult = 1.2;
    out[k] = Math.round(clamp(v * mult, -MAX_DELTA_PER_TURN * 1.5, MAX_DELTA_PER_TURN * 1.5));
  }
  return out;
}

export function applyDelta(state: TessState, delta: TessState): TessState {
  const out = {} as TessState;
  for (const k of STATE_KEYS) out[k] = clamp(Math.round((state[k] ?? 0) + (delta[k] ?? 0)), 0, 100);
  return out;
}

export const STAGES = [
  "Newly acquainted",
  "Comfortable acquaintance",
  "Friendly connection",
  "Flirty friendship",
  "Mutual romantic curiosity",
  "Early dating",
  "Dating",
  "Established relationship",
  "Platonic friendship",
  "Connection faded",
] as const;
export type Stage = (typeof STAGES)[number];

/** Relationship stage emerges from state — never from points. */
export function deriveStage(s: TessState): Stage {
  if (s.irritation >= 70 || (s.relationship_momentum <= 5 && s.curiosity <= 20)) return "Connection faded";
  const romance = s.romantic_attraction;
  if (romance >= 85 && s.trust >= 80 && s.emotional_intimacy >= 80) return "Established relationship";
  if (romance >= 75 && s.trust >= 70 && s.emotional_intimacy >= 65) return "Dating";
  if (romance >= 65 && s.trust >= 55 && s.emotional_intimacy >= 45) return "Early dating";
  if (romance >= 50 && s.curiosity >= 45) return "Mutual romantic curiosity";
  if (romance >= 38 && s.playfulness >= 50) return "Flirty friendship";
  if (s.trust >= 55 && s.comfort >= 60 && romance < 30) return "Platonic friendship";
  if (s.comfort >= 55) return "Friendly connection";
  if (s.comfort >= 47) return "Comfortable acquaintance";
  return "Newly acquainted";
}

export const clampDelaySeconds = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? clamp(Math.round(v), 3, 240) : 20;
};
