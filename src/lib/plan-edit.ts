/** Convert an America/New_York wall-clock date+time into the exact instant (DST-aware). */
export function easternInstant(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asEastern = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess.getTime() + (guess.getTime() - asEastern));
}
