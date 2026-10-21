// Deterministic daily micro-disruptions: small, ordinary happenings that vary
// each day per character. No storage, no AI — seeded by user-agnostic
// character key + local date + time block so every server path agrees.
import { hashSeed, mulberry32 } from "./social-logic";

export type Availability = "asleep" | "busy" | "limited" | "free";
export type Disruption = { id: string; detail: string; availability: Availability | null; block: "work" | "off" };

const POOLS: Record<string, { work: Omit<Disruption, "block">[]; off: Omit<Disruption, "block">[] }> = {
  tess: {
    work: [
      { id: "intake", detail: "an emergency intake just came in at the clinic", availability: "busy" },
      { id: "handover", detail: "short-staffed handover, juggling the front desk", availability: "busy" },
      { id: "lull", detail: "an unexpected quiet lull at work, tea in hand", availability: "free" },
      { id: "supplier", detail: "chasing a late supply delivery", availability: "limited" },
    ],
    off: [
      { id: "mabel", detail: "Mabel got into something she shouldn't have", availability: "limited" },
      { id: "traffic", detail: "stuck in slow traffic on the way home", availability: "limited" },
      { id: "groceries", detail: "a quick grocery run that turned into a long one", availability: "limited" },
      { id: "couch", detail: "unexpectedly relaxed evening on the couch", availability: "free" },
    ],
  },
  maya: {
    work: [
      { id: "florist", detail: "a supplier arrived early and threw off the setup", availability: "busy" },
      { id: "vendor", detail: "a last-minute vendor swap to sort out", availability: "busy" },
      { id: "espresso", detail: "a quick espresso break between tasks", availability: "free" },
    ],
    off: [
      { id: "friends", detail: "spontaneous drinks invite from a friend", availability: "limited" },
      { id: "laundry", detail: "finally tackling a laundry mountain", availability: "limited" },
      { id: "show", detail: "half-watching a show, phone in hand", availability: "free" },
    ],
  },
  claire: {
    work: [
      { id: "bookdrop", detail: "the book drop overflowed this morning", availability: "busy" },
      { id: "request", detail: "helping someone track down an awkward request", availability: "limited" },
      { id: "staffroom", detail: "quiet tea in the staff room", availability: "free" },
    ],
    off: [
      { id: "garden", detail: "pottering in the garden while the light lasts", availability: "limited" },
      { id: "call", detail: "a long phone call with family", availability: "busy" },
      { id: "reading", detail: "curled up with a book", availability: "free" },
    ],
  },
  jordan: {
    work: [
      { id: "revision", detail: "vague revision notes needing another pass", availability: "busy" },
      { id: "coffee", detail: "the office coffee machine is broken again", availability: null },
      { id: "flow", detail: "deep focus, headphones on", availability: "busy" },
    ],
    off: [
      { id: "climb", detail: "a quick unplanned climbing session", availability: "busy" },
      { id: "repair", detail: "fixing something small around the apartment", availability: "limited" },
      { id: "quiet", detail: "a quiet evening alone, unusually chatty mood", availability: "free" },
    ],
  },
  ben: {
    work: [
      { id: "hardware", detail: "an extra hardware store run for fittings", availability: "limited" },
      { id: "level", detail: "Mikey misplaced the laser level again", availability: "busy" },
      { id: "truck", detail: "lunch in the truck with the radio on", availability: "free" },
    ],
    off: [
      { id: "pickup", detail: "rushing to pick the kids up from practice", availability: "busy" },
      { id: "workshop", detail: "tinkering in the garage", availability: "limited" },
      { id: "dinner", detail: "family dinner, phone face down", availability: "busy" },
    ],
  },
};

/** ~35% of 3-hour blocks get a disruption; varies daily per character. */
export function disruptionFor(character: string, now: Date, atWork: boolean): Disruption | null {
  const pool = POOLS[character];
  if (!pool) return null;
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = `${local.getFullYear()}-${local.getMonth()}-${local.getDate()}`;
  const blockIdx = Math.floor(local.getHours() / 3);
  const block = atWork ? "work" : "off";
  const rng = mulberry32(hashSeed(`disrupt:${character}:${day}:${blockIdx}`));
  if (rng() > 0.35) return null;
  const list = pool[block];
  const d = list[Math.floor(rng() * list.length)];
  return d ? { ...d, block } : null;
}

/** Applies a disruption to a base availability; never wakes anyone up. */
export function applyDisruption<T extends { availability: Availability; detail: string }>(base: T, d: Disruption | null): T {
  if (!d || base.availability === "asleep") return base;
  return { ...base, availability: d.availability ?? base.availability, detail: `${base.detail}; today: ${d.detail}` };
}
