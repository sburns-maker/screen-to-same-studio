/**
 * Calendar commitments take priority over a character's baseline weekly
 * schedule and background storylines. Pure and deterministic; the server
 * supplies plan + Living Experience rows already scoped to one user.
 */
import type { TessActivity } from "./tess-life";
import { TESS_TZ } from "./tess-life";

export type CommitmentPlan = {
  id: string;
  title: string;
  organizer: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  place_key: string | null;
};
export type CommitmentExperience = {
  plan_id: string;
  state: string;
  synced_at: string | null;
  updated_at: string;
};
export type CommitmentPhase = "preparing" | "attending" | "pending_completion" | "after";
export type Commitment = TessActivity & { planId: string; phase: CommitmentPhase; summary: string };

const MIN = 60_000;
export const PREPARE_MINUTES = 45;
export const AFTER_MINUTES = 90;
/** An unrecorded finish keeps the character at the outing for a bounded time, never forever. */
export const PENDING_CAP_HOURS = 6;
/** Marker used by downstream guards (photos, storylines). Never matches work/location regexes. */
export const OUTING_MARKER = "CALENDAR COMMITMENT";

const place = (p: CommitmentPlan) => (p.place_key ?? "the planned place").split(":")[0]!.replace(/[_-]+/g, " ");

export function activeCommitment(
  character: string,
  plans: CommitmentPlan[],
  experiences: CommitmentExperience[],
  now: Date,
): Commitment | null {
  const t = now.getTime();
  const candidates: Commitment[] = [];
  for (const p of plans) {
    if (p.organizer !== character || !p.starts_at) continue;
    if (!["accepted", "in_progress", "completed"].includes(p.status)) continue;
    const start = Date.parse(p.starts_at);
    const end = p.ends_at ? Date.parse(p.ends_at) : start + 2 * 3_600_000;
    const ex = experiences.find((e) => e.plan_id === p.id);
    const finished = p.status === "completed" || ex?.state === "completed";
    const where = place(p);
    const base = { planId: p.id };
    if (finished) {
      // Use the recorded completion time; fall back to the scheduled end only when nothing was recorded.
      const doneAt = ex?.state === "completed" ? Date.parse(ex.synced_at ?? ex.updated_at) : end;
      if (t >= start && t >= doneAt && t < doneAt + AFTER_MINUTES * MIN)
        candidates.push({ ...base, phase: "after", activity: "back from an outing", availability: "limited",
          detail: `${OUTING_MARKER}: just finished ${p.title} at ${where}; heading home or relaxing afterward. Off work; not at any workplace.`,
          summary: `${p.title} at ${where} has just ended.` });
      else if (t >= start && t < doneAt)
        candidates.push({ ...base, phase: "attending", activity: "on an outing", availability: "limited",
          detail: `${OUTING_MARKER}: attending ${p.title} at ${where}. Can glance at messages or think about other things, but is physically here.`,
          summary: `${p.title} is happening at ${where}.` });
      continue;
    }
    if (t < start - PREPARE_MINUTES * MIN) continue;
    if (t < start) {
      candidates.push({ ...base, phase: "preparing", activity: "getting ready for an outing", availability: "limited",
        detail: `${OUTING_MARKER}: getting ready for ${p.title} at ${where}.`, summary: `${p.title} at ${where} starts soon.` });
      continue;
    }
    if (t < end) {
      candidates.push({ ...base, phase: "attending", activity: "on an outing", availability: "limited",
        detail: `${OUTING_MARKER}: attending ${p.title} at ${where}. Can glance at messages or think about other things, but is physically here.`,
        summary: `${p.title} is happening at ${where}.` });
      continue;
    }
    // Scheduled end passed without a recorded finish: do not assume it ended.
    const live = ex && !["scheduled", "completed", "expired", "missed", "cancelled"].includes(ex.state);
    if (live && t < end + PENDING_CAP_HOURS * 3_600_000)
      candidates.push({ ...base, phase: "pending_completion", activity: "on an outing", availability: "limited",
        detail: `${OUTING_MARKER}: still at ${p.title} at ${where}; its finish has not been recorded yet.`,
        summary: `${p.title} at ${where} is still in progress (finish not recorded).` });
  }
  const rank: Record<CommitmentPhase, number> = { attending: 0, pending_completion: 1, preparing: 2, after: 3 };
  return candidates.sort((a, b) => rank[a.phase] - rank[b.phase])[0] ?? null;
}

/** Workplace storylines require physical presence at work. */
export function isWorkplaceStory(location: string, summary = ""): boolean {
  return /practice|office|clinic|library|work van|^work$|the venue|job site/i.test(location) || /clinic|rota|shift coverage|staffing/i.test(summary);
}
export function isOffDay(now: Date): boolean {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TESS_TZ, weekday: "short" }).format(now);
  return wd === "Sat" || wd === "Sun";
}
/** A character cannot physically take part in a workplace milestone on an off-day or during an outing. */
export function physicalStoryAllowed(location: string, summary: string, now: Date, committed: boolean): boolean {
  if (!isWorkplaceStory(location, summary)) return true;
  return !committed && !isOffDay(now);
}
/** Photo moments must match where the character actually is. */
export function photoContextConflicts(schedule: TessActivity, context: string): boolean {
  const away = schedule.detail.includes(OUTING_MARKER) || /weekend|off work/i.test(schedule.detail);
  return away && /\b(clinic|rota|shift|staffing|vet practice|at work|workplace|office desk)\b/i.test(context);
}
