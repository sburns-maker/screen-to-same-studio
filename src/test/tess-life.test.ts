import { describe, expect, it } from "vitest";
import {
  LIFE_EVENTS,
  MIN_INITIATION_GAP_HOURS,
  activeLifeEvent,
  decideInitiation,
  decideLatency,
  scheduleFor,
  weatherFlavor,
  type InitiationInput,
} from "@/lib/tess-life";
import { SEED_STATE, type TessState } from "@/lib/tess-logic";

const freeSchedule = { activity: "home after work", availability: "free" as const, detail: "home" };
const busySchedule = { activity: "at work (chaotic day)", availability: "busy" as const, detail: "chaotic clinic day" };
const asleepSchedule = { activity: "asleep", availability: "asleep" as const, detail: "asleep" };

function base(over: Partial<InitiationInput> = {}, state: Partial<TessState> = {}): InitiationInput {
  return {
    state: { ...SEED_STATE, ...state },
    stage: "Newly acquainted",
    gapHours: 8,
    lastInitiatedAt: null,
    userCarrying: false,
    recentQuality: 50,
    schedule: freeSchedule,
    lifeEvent: null,
    hasPlausibleReason: true,
    now: new Date("2026-10-20T18:00:00-04:00"),
    ...over,
  };
}

describe("initiation engine", () => {
  it("5 hours elapsed only opens eligibility — it never guarantees a message", () => {
    // With a low-inclination state, many checks pass with no initiation.
    const low = base({ gapHours: 6 }, { curiosity: 30, relationship_momentum: 20, comfort: 25, romantic_attraction: 10, playfulness: 15, trust: 15 });
    let initiated = 0;
    for (let i = 0; i < 200; i++) if (decideInitiation(low).initiate) initiated++;
    expect(initiated).toBeLessThan(200); // not automatic
    expect(decideInitiation(low).eligible).toBe(true); // but eligible
  });

  it("under 5 hours is never eligible and reports the next window", () => {
    const d = decideInitiation(base({ gapHours: 2 }));
    expect(d.eligible).toBe(false);
    expect(d.initiate).toBe(false);
    expect(d.nextWindowHours).toBeCloseTo(MIN_INITIATION_GAP_HOURS - 2);
  });

  it("irritation suppresses initiation", () => {
    const d = decideInitiation(base({}, { irritation: 45 }));
    expect(d.initiate).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/irritation/);
  });

  it("high perceived pressure suppresses initiation", () => {
    const d = decideInitiation(base({}, { perceived_pressure: 40 }));
    expect(d.initiate).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/pressure/);
  });

  it("strong momentum raises the initiation chance", () => {
    const hot = decideInitiation(base({}, { curiosity: 80, relationship_momentum: 75, comfort: 70, playfulness: 70, romantic_attraction: 55, trust: 60 }));
    const cold = decideInitiation(base({}, { curiosity: 25, relationship_momentum: 15, comfort: 30, playfulness: 20, romantic_attraction: 10, trust: 20 }));
    expect(hot.chance).toBeGreaterThan(cold.chance);
    expect(hot.score).toBeGreaterThan(cold.score);
  });

  it("never double-initiates without user interaction", () => {
    const d = decideInitiation(base({ lastInitiatedAt: new Date("2026-10-20T10:00:00-04:00") }));
    expect(d.initiate).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/double-initiate/);
  });

  it("weather alone does not trigger initiation when state is flat", () => {
    const d = decideInitiation(
      base({ hasPlausibleReason: true }, { curiosity: 12, relationship_momentum: 8, comfort: 15, romantic_attraction: 5, playfulness: 10, trust: 10 }),
      () => 0.5, // coin lands "no" unless chance >= 50%
    );
    expect(d.initiate).toBe(false);
  });

  it("a strong state with a plausible reason can initiate", () => {
    const d = decideInitiation(
      base({}, { curiosity: 85, relationship_momentum: 80, comfort: 75, playfulness: 75, romantic_attraction: 60, trust: 65 }),
      () => 0.01, // low roll
    );
    expect(d.initiate).toBe(true);
  });

  it("she is never eligible while asleep", () => {
    expect(decideInitiation(base({ schedule: asleepSchedule })).initiate).toBe(false);
  });

  it("user carrying the conversation lowers her inclination", () => {
    const carrying = decideInitiation(base({ userCarrying: true }));
    const balanced = decideInitiation(base({ userCarrying: false }));
    expect(carrying.score).toBeLessThan(balanced.score);
  });
});

describe("schedule", () => {
  const at = (iso: string) => new Date(iso);
  it("weekday work hours are work", () => {
    // 2026-10-21 is a Wednesday
    expect(scheduleFor(at("2026-10-21T14:00:00-04:00")).activity).toMatch(/at work/);
  });
  it("early morning is asleep", () => {
    expect(scheduleFor(at("2026-10-21T03:00:00-04:00")).availability).toBe("asleep");
  });
  it("Thursday evening is trivia", () => {
    // 2026-10-22 is a Thursday
    expect(scheduleFor(at("2026-10-22T20:00:00-04:00")).activity).toBe("at trivia");
  });
  it("weekday evenings are free-ish", () => {
    expect(["free", "limited"]).toContain(scheduleFor(at("2026-10-21T20:30:00-04:00")).availability);
  });
});

describe("life events", () => {
  it("events come from the defined pool and are deterministic per window", () => {
    const now = new Date("2026-10-20T18:00:00-04:00");
    const a = activeLifeEvent(now);
    const b = activeLifeEvent(now);
    expect(a).toEqual(b);
    if (a) expect(LIFE_EVENTS.map((e) => e.id)).toContain(a.id);
  });
  it("snow suppresses hike plans", () => {
    // Scan many windows: with snow, "hike" must never appear.
    for (let i = 0; i < 60; i++) {
      const t = new Date(Date.UTC(2026, 0, 1) + i * 3 * 86_400_000);
      expect(activeLifeEvent(t, { snowing: true })?.id).not.toBe("hike");
    }
  });
});

describe("weather flavor", () => {
  it("snow gives a winter-positive hook", () => {
    expect(weatherFlavor({ condition: "snow", temperature_f: 28, snowing: true, rain: false })).toMatch(/snow/i);
  });
  it("mild clear weather gives a nice-day hook", () => {
    expect(weatherFlavor({ condition: "clear", temperature_f: 65, snowing: false, rain: false })).toMatch(/nice/i);
  });
  it("unremarkable weather gives no hook", () => {
    expect(weatherFlavor({ condition: "cloudy", temperature_f: 50, snowing: false, rain: false })).toBeNull();
  });
});

describe("latency", () => {
  const state = { ...SEED_STATE };
  it("practice mode keeps the 3s–4min simulated delay", () => {
    const d = decideLatency({ realTimeMode: false, schedule: busySchedule, lifeEvent: null, state, activelyChatting: false, baseSeconds: 45 });
    expect(d.seconds).toBe(45);
  });
  it("practice mode clamps to 240s max", () => {
    const d = decideLatency({ realTimeMode: false, schedule: freeSchedule, lifeEvent: null, state, activelyChatting: false, baseSeconds: 999 });
    expect(d.seconds).toBe(240);
  });
  it("real-time: sleep suppresses the immediate response entirely", () => {
    const d = decideLatency({ realTimeMode: true, schedule: asleepSchedule, lifeEvent: null, state, activelyChatting: false, baseSeconds: 30 });
    expect(d.seconds).toBeNull();
    expect(d.reason).toMatch(/morning/);
  });
  it("real-time: work slows replies", () => {
    const d = decideLatency({ realTimeMode: true, schedule: busySchedule, lifeEvent: null, state, activelyChatting: false, baseSeconds: 30 });
    expect(d.seconds!).toBeGreaterThanOrEqual(240);
  });
  it("real-time: active exchange while free is fast", () => {
    const d = decideLatency({ realTimeMode: true, schedule: freeSchedule, lifeEvent: null, state, activelyChatting: true, baseSeconds: 30 });
    expect(d.seconds!).toBeLessThanOrEqual(45);
  });
  it("real-time: a busy life event slows replies", () => {
    const ev = LIFE_EVENTS.find((e) => e.availability === "busy")!;
    const d = decideLatency({ realTimeMode: true, schedule: freeSchedule, lifeEvent: ev, state, activelyChatting: false, baseSeconds: 30 });
    expect(d.seconds!).toBeGreaterThanOrEqual(180);
    expect(d.reason).toContain(ev.summary);
  });
});
