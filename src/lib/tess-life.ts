// Tess's fictional life: weekly schedule, rotating life events, initiation
// decisions and response latency. Pure and deterministic given inputs so it
// can be unit-tested; the server supplies the clock, weather and randomness.

import type { Stage, TessState } from "./tess-logic";

export const TESS_TZ = "America/New_York";

/** Parts of Tess's local (Eastern) time. */
export function tessLocalParts(now: Date): { hour: number; minute: number; dow: number; label: string } {
  const local = new Date(now.toLocaleString("en-US", { timeZone: TESS_TZ }));
  return {
    hour: local.getHours(),
    minute: local.getMinutes(),
    dow: local.getDay(), // 0 = Sunday
    label: local.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }),
  };
}

export type TessActivity = {
  activity: string; // short label, e.g. "at work"
  availability: "asleep" | "busy" | "limited" | "free";
  detail: string; // prompt-facing description
};

/**
 * Weekly baseline schedule. Ops manager at a busy vet practice:
 * Mon–Fri up ~6:30, work 8–5 (calm/chaotic varies by day), Thursday trivia,
 * some Sundays dinner with parents, Mabel walks morning/evening.
 */
export function scheduleFor(now: Date, chaos = 1): TessActivity {
  const { hour, dow } = tessLocalParts(now);
  const weekend = dow === 0 || dow === 6;
  // Deterministic per-day variation: some workdays are calm, some chaotic.
  const daySeed = Math.floor(now.getTime() / 86_400_000);
  const chaoticDay = (daySeed * 31 + 7) % 5 < 2 * chaos; // ~2 in 5 workdays

  if (hour < 6 || (hour === 6 && !weekend)) return { activity: "asleep", availability: "asleep", detail: "asleep — it's before her alarm" };
  if (hour < 7) return { activity: "waking up", availability: "limited", detail: "just waking up, coffee, Mabel wants out" };
  if (hour < 8) return { activity: "walking Mabel", availability: "limited", detail: "morning Mabel walk / getting ready for the day" };

  if (!weekend && hour >= 8 && hour < 17) {
    if (chaoticDay) {
      return { activity: "at work (chaotic day)", availability: "busy", detail: "at the clinic — chaotic day, short-staffed, replies are short and sporadic" };
    }
    if (hour >= 12 && hour < 13) return { activity: "at work (lunch)", availability: "limited", detail: "at work, grabbing a late lunch — a few free minutes" };
    return { activity: "at work", availability: "limited", detail: "at the clinic — calm enough day, can text between things" };
  }

  if (dow === 4 && hour >= 19 && hour < 22) return { activity: "at trivia", availability: "busy", detail: "at Thursday trivia with her team — distracted, phone mostly away" };
  if (dow === 0 && hour >= 17 && hour < 20 && daySeed % 3 === 0)
    return { activity: "dinner at her parents'", availability: "busy", detail: "Sunday dinner at her parents' — phone down" };
  if (hour >= 17 && hour < 19) return { activity: "evening errands / Mabel walk", availability: "limited", detail: "evening — Mabel walk, errands or starting dinner" };
  if (hour >= 22 || hour < 6) return { activity: "winding down", availability: "limited", detail: "winding down for bed" };
  return { activity: weekend ? "free (weekend)" : "home after work", availability: "free", detail: weekend ? "weekend, relaxed" : "home after work, decent availability" };
}

export type LifeEvent = {
  id: string;
  summary: string; // prompt-facing
  mood: "up" | "down" | "stressed" | "neutral";
  availability: "busy" | "normal" | "free";
  days: number; // typical duration
};

export const LIFE_EVENTS: LifeEvent[] = [
  { id: "staffing", summary: "a vet tech quit, so she's covering schedules and the clinic is short-staffed", mood: "stressed", availability: "busy", days: 4 },
  { id: "clinic_emergency", summary: "an emergency surgery at the clinic ran long", mood: "stressed", availability: "busy", days: 1 },
  { id: "evan_wedding", summary: "Evan's wedding planning — venue appointments and family group-chat drama", mood: "neutral", availability: "normal", days: 5 },
  { id: "friend_outing", summary: "plans with her friend Priya this weekend", mood: "up", availability: "normal", days: 3 },
  { id: "sick_day", summary: "she's fighting off a cold and working from home-ish", mood: "down", availability: "normal", days: 2 },
  { id: "mabel_vet", summary: "Mabel has a checkup (ironic, given where Tess works)", mood: "neutral", availability: "normal", days: 1 },
  { id: "overtime", summary: "unexpected overtime — inventory week at the practice", mood: "stressed", availability: "busy", days: 3 },
  { id: "car_trouble", summary: "her car's making a noise and it's in the shop", mood: "down", availability: "normal", days: 2 },
  { id: "quiet_weekend", summary: "a deliberately quiet weekend — books, Mabel, an ambitious recipe", mood: "up", availability: "free", days: 2 },
  { id: "hike", summary: "she's planning a spontaneous hike if the weather holds", mood: "up", availability: "free", days: 2 },
  { id: "canceled_plans", summary: "her plans got canceled and she's secretly relieved", mood: "neutral", availability: "free", days: 1 },
  { id: "visitor", summary: "an old college friend is in town visiting", mood: "up", availability: "busy", days: 3 },
  { id: "family_dinner", summary: "a family dinner — her mom will absolutely bring up the dentist's son", mood: "neutral", availability: "busy", days: 1 },
  { id: "trivia_win", summary: "her trivia team finally broke the losing streak", mood: "up", availability: "normal", days: 2 },
];

const EVENT_SPAN_DAYS = 3;

/**
 * The currently active temporary life event. Deterministic per time window so
 * the whole backend agrees without storage; roughly one event every few days,
 * with gaps (no event) so her life isn't a constant soap opera.
 */
export function activeLifeEvent(now: Date, weatherHint?: { snowing?: boolean; rain?: boolean; alert?: boolean }): LifeEvent | null {
  const windowIndex = Math.floor(now.getTime() / (EVENT_SPAN_DAYS * 86_400_000));
  // ~60% of windows have no special event.
  if ((windowIndex * 13 + 5) % 10 < 4) return null;
  let pool = LIFE_EVENTS;
  // Bad weather makes weather-flavored events more likely and hikes less likely.
  if (weatherHint?.alert || weatherHint?.snowing) {
    pool = LIFE_EVENTS.filter((e) => e.id !== "hike");
  }
  return pool[(windowIndex * 7 + 3) % pool.length] ?? null;
}

/** Weather-flavored one-liners Tess might reference, keyed by condition. */
export function weatherFlavor(w: { condition: string; temperature_f: number; snowing: boolean; rain: boolean; alert: string | null }): string | null {
  if (w.alert) return `there's a weather alert in her area (${w.alert}) — plans may shift`;
  if (w.snowing) return `it's snowing — she genuinely loves winter; Mabel goes feral in snow, roads are slow, trivia could get canceled if it keeps up`;
  if (w.rain) return `it's raining — wet dog, muddy walks, lazy-evening energy`;
  if (w.temperature_f >= 88) return `it's hot — shorter Mabel walks, iced coffee, complaining about the clinic AC`;
  if (w.temperature_f <= 20) return `it's bitter cold — quick Mabel walks, defrosting the car`;
  if (w.condition === "clear" && w.temperature_f >= 55 && w.temperature_f <= 80) return `it's genuinely nice out — long-walk / outdoor-coffee weather`;
  return null;
}

// ---------------------------------------------------------------------------
// Initiation
// ---------------------------------------------------------------------------

export type InitiationInput = {
  state: TessState;
  stage: Stage;
  gapHours: number; // hours since last message in the conversation
  lastInitiatedAt: Date | null;
  userCarrying: boolean; // user has been carrying most of the conversation
  recentQuality: number; // 0–100 subjective quality of the recent conversation
  schedule: TessActivity;
  lifeEvent: LifeEvent | null;
  hasPlausibleReason: boolean; // a callback, plan follow-up, weather hook, Mabel/work story exists
  now: Date;
};

export type InitiationDecision = {
  eligible: boolean;
  initiate: boolean;
  reasons: string[]; // why eligible / why not — for the debug screen
  score: number; // 0–100 inclination score
  chance: number; // probability used this check
  nextWindowHours: number | null; // when eligibility next opens, if known
};

export const MIN_INITIATION_GAP_HOURS = 5;
export const MIN_BETWEEN_INITIATIONS_HOURS = 20;

/**
 * Decide whether Tess texts first. The 5-hour gap only opens eligibility —
 * it never triggers a message by itself. Personality, state, schedule, life
 * events and a plausible reason decide; randomness makes the timing
 * impossible to reverse-engineer.
 */
export function decideInitiation(input: InitiationInput, rng: () => number = Math.random): InitiationDecision {
  const s = input.state;
  const reasons: string[] = [];
  const no = (why: string, nextWindowHours: number | null = null): InitiationDecision => ({
    eligible: false,
    initiate: false,
    reasons: [why, ...reasons],
    score: 0,
    chance: 0,
    nextWindowHours,
  });

  if (input.gapHours < MIN_INITIATION_GAP_HOURS) {
    return no(`only ${input.gapHours.toFixed(1)}h since the last message — not eligible yet`, MIN_INITIATION_GAP_HOURS - input.gapHours);
  }
  reasons.push(`${Math.round(input.gapHours)}h gap — eligibility window open`);

  if (input.schedule.availability === "asleep") return no("she's asleep");
  if (input.schedule.availability === "busy") reasons.push(`busy (${input.schedule.activity}) — less likely`);
  if (s.irritation >= 30) return no(`irritation ${s.irritation} — she doesn't feel like reaching out`);
  if (s.perceived_pressure >= 30) return no(`perceived pressure ${s.perceived_pressure} — reaching out would reward pressure`);
  if (input.lastInitiatedAt && input.now.getTime() - input.lastInitiatedAt.getTime() < MIN_BETWEEN_INITIATIONS_HOURS * 3_600_000) {
    return no("she initiated recently — won't double-initiate");
  }
  if (s.curiosity < 20 && s.relationship_momentum < 15) return no("curiosity and momentum are both low — nothing pulling her toward the phone");
  if (!input.hasPlausibleReason) reasons.push("no specific reason in mind — relying on general inclination");

  // Inclination score: personality- and state-driven.
  let score =
    s.curiosity * 0.22 +
    s.relationship_momentum * 0.2 +
    s.comfort * 0.14 +
    s.playfulness * 0.12 +
    s.romantic_attraction * 0.1 +
    s.trust * 0.1 +
    input.recentQuality * 0.12;
  if (input.userCarrying) {
    score *= 0.65;
    reasons.push("he's been carrying the conversation — she notices the imbalance");
  }
  if (input.hasPlausibleReason) score *= 1.25;
  if (input.lifeEvent?.availability === "busy") score *= 0.7;
  if (input.lifeEvent && input.lifeEvent.mood === "up") score *= 1.1;
  if (input.stage === "Connection faded") score *= 0.4;
  if (input.schedule.availability === "busy") score *= 0.75;
  score = Math.min(100, Math.round(score));

  // Probability: even a great score is not a guarantee; a low score sometimes
  // still texts. This is what makes timing un-gameable.
  const chance = Math.min(0.65, Math.max(0.04, score / 160));
  const initiate = rng() < chance;
  reasons.push(`inclination ${score}/100 → ${Math.round(chance * 100)}% this check → ${initiate ? "she texts" : "not this time"}`);
  return { eligible: true, initiate, reasons, score, chance, nextWindowHours: null };
}

// ---------------------------------------------------------------------------
// Response latency
// ---------------------------------------------------------------------------

export type LatencyInput = {
  realTimeMode: boolean;
  schedule: TessActivity;
  lifeEvent: LifeEvent | null;
  state: TessState;
  activelyChatting: boolean; // user sent a message within the last few minutes
  baseSeconds: number; // the model's 3–240 practice-mode delay
};

export type LatencyDecision = {
  seconds: number | null; // null = she leaves it until later (sleep boundary)
  reason: string; // debug-facing explanation
};

/**
 * Response delay. Practice mode keeps the 3s–4min behavior. Real-Time Mode
 * follows her schedule: fast when actively chatting and free, slower and
 * shorter at work, nothing while asleep. Delay is never used as punishment —
 * irritation shortens and cools the *reply*, not the clock.
 */
export function decideLatency(input: LatencyInput, rng: () => number = Math.random): LatencyDecision {
  const { schedule, state } = input;
  if (!input.realTimeMode) {
    return { seconds: Math.min(240, Math.max(3, Math.round(input.baseSeconds))), reason: "practice mode — normal simulated delay" };
  }
  if (schedule.availability === "asleep") {
    return { seconds: null, reason: `real-time: ${schedule.detail} — she'll see it in the morning` };
  }
  if (input.activelyChatting && schedule.availability === "free") {
    return { seconds: 5 + Math.round(rng() * 40), reason: "real-time: free and actively chatting — fast replies" };
  }
  if (schedule.availability === "busy") {
    const s = 240 + Math.round(rng() * 900); // 4–19 min
    return { seconds: s, reason: `real-time: ${schedule.activity} — replies when she gets a gap` };
  }
  if (input.lifeEvent?.availability === "busy") {
    const s = 180 + Math.round(rng() * 600);
    return { seconds: s, reason: `real-time: ${input.lifeEvent.summary} — slower than usual` };
  }
  if (schedule.availability === "limited") {
    const s = 60 + Math.round(rng() * 300); // 1–6 min
    return { seconds: s, reason: `real-time: ${schedule.activity} — a few minutes` };
  }
  // Free but not an active exchange: momentum nudges speed, never punished.
  const base = 20 + Math.round(rng() * 120);
  const s = state.relationship_momentum > 50 ? Math.round(base * 0.6) : base;
  return { seconds: s, reason: "real-time: free — normal texting pace" };
}
