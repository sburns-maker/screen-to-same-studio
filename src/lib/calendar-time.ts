export function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
/** Refuse gaps and folds rather than guessing an offset. Supports IANA quarter-hour offsets. */
export function zonedInstant(
  date: string | null,
  time: string | null,
  zone = "America/New_York",
): string | null {
  if (
    !date ||
    !time ||
    !/^20\d\d-\d\d-\d\d$/.test(date) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !validTimeZone(zone)
  )
    return null;
  const base = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== date) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const offsets =
    zone === "America/New_York"
      ? [240, 300]
      : zone === "UTC"
        ? [0]
        : Array.from({ length: 113 }, (_, i) => i * 15 - 840);
  const matches = offsets
    .map((n) => new Date(base + n * 60000))
    .filter((d) => {
      const parts = fmt.formatToParts(d);
      const v = (k: string) => parts.find((p) => p.type === k)?.value;
      return (
        `${v("year")}-${v("month")}-${v("day")}` === date && `${v("hour")}:${v("minute")}` === time
      );
    });
  return matches.length === 1 ? matches[0]!.toISOString() : null;
}
